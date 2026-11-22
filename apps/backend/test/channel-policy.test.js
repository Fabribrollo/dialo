import { drainEffects } from '../src/utils/backgroundEffects.js';
import { beforeEach as isolateQuota } from 'node:test';
import { resetRateLimits } from '../src/utils/rateLimit.js';
isolateQuota(resetRateLimits);
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configura TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_policy_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, ana, dani, eli;
const sockets = [];

async function request(path, { method = 'GET', body, as } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, cookie: r.cookie };
}
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(error);
    assert.equal(reply.error.code, 'VALIDATION_ERROR'); resolve();
  }));
}
async function socketFor(user) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await ready(socket);
  return socket;
}

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
  await prisma.notificacion.deleteMany();
  await prisma.usuario.updateMany({data:{preferencias:{}}});
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await drainEffects();
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const community = async(owner=ana) => (await request('/communities',{method:'POST',as:owner,body:{nombre:'Kanban',tipo:'PRIVADA'}})).body.comunidad;
const member = (c,u,rol='INTEGRANTE') => prisma.membresia.create({data:{idComunidad:c.id,idUsuario:u.id,rol}});
const create=async(c,{privado=false,tipo='TEXTO',permisosGlobales=tipo==='TEXTO'?['VER','ESCRIBIR']:['VER','HABLAR']}={})=>{
  const r=await request(`/communities/${c.id}/channels`,{method:'POST',as:ana,body:{nombre:'Canal',tipo,privado,permisosGlobales:privado?[]:permisosGlobales}});
  assert.equal(r.status,201,JSON.stringify(r.body));return r.body.canal;
};
const config=(ch,body,as=ana)=>request(`/channels/${ch.id}/access`,{method:'PUT',as,body});
const ask=(ch,as=dani)=>request(`/channels/${ch.id}/requests`,{method:'POST',as,body:{}});
const decide=(ch,id,body,as=ana)=>request(`/channels/${ch.id}/requests/${id}`,{method:'POST',as,body});
const read=(path,as=dani)=>request(path,{as});
test('creación pública atómica con permisos globales iguales y administradores con acceso total',async()=>{
  const c=await community();await member(c,dani);await member(c,eli,'MODERADOR');
  const ch=await create(c,{permisosGlobales:['VER']});
  for(const user of [dani,eli])assert.deepEqual((await read(`/channels/${ch.id}`,user)).body.canal.misPermisos,['VER']);
  assert.deepEqual((await read(`/channels/${ch.id}`,ana)).body.canal.misPermisos,['VER','ESCRIBIR','ELIMINAR_MENSAJES','GESTIONAR_CANALES','EXPULSAR','BANEAR']);
  assert.equal((await config(ch,{privado:false,permisosGlobales:['ESCRIBIR']})).status,200);
  assert.deepEqual((await read(`/channels/${ch.id}`)).body.canal.misPermisos,['VER','ESCRIBIR']);
  assert.equal((await config(ch,{privado:false,permisosGlobales:[]})).status,200);
  assert.deepEqual((await read(`/channels/${ch.id}`)).body.canal.misPermisos,['VER']);
  assert.equal((await ask(ch)).status,400);
});
test('contratos separan públicos globales y privados individuales y rechazan suplantación',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c);
  for(const body of [
    {privado:true,habilitaciones:[{rol:'INTEGRANTE',permisos:['VER']}]},
    {privado:true,habilitaciones:[{idRol:3,permisos:['VER']}]},
    {privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['VER']},{idUsuario:dani.id,permisos:['VER']}]},
    {privado:false,permisosGlobales:['VER','VER']},
  ])assert.equal((await config(ch,body)).status,400);
  assert.equal((await config(ch,{privado:false,permisosGlobales:['TRANSMITIR']})).status,400);
  const hidden=await create(c,{privado:true});
  assert.equal((await config(hidden,{privado:true,habilitaciones:[{idUsuario:eli.id,permisos:['VER']}]})).status,404);
  assert.equal((await config(ch,{privado:false,permisosGlobales:[]},dani)).status,403);
});
test('catálogo bloqueado solo para miembros; nunca habilita historial, sockets, búsqueda ni llamadas',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});
  await prisma.mensaje.create({data:{idCanal:ch.id,idAutor:ana.id,contenido:'NO REVELAR'}});
  const catalog=await read(`/communities/${c.id}/channels`);
  const locked=catalog.body.items.find(x=>x.id===ch.id);assert.equal(locked.bloqueado,true);assert.deepEqual(locked.misPermisos,[]);
  assert.ok(!JSON.stringify(catalog.body).includes('NO REVELAR'));
  assert.equal((await read(`/communities/${c.id}/channels`,eli)).status,404);
  for(const path of [`/channels/${ch.id}`,`/channels/${ch.id}/messages`,`/channels/${ch.id}/messages/search?q=NO`,`/channels/${ch.id}/call/participants`])assert.equal((await read(path)).status,404,path);
  const socket=await socketFor(dani);
  const ack=await new Promise(resolve=>socket.emit('channel:subscribe',{idCanal:ch.id},resolve));assert.equal(ack.ok,false);
});
test('solicitudes idempotentes entre pestañas; solo admin o propietario pueden resolver',async()=>{
  const c=await community();await member(c,dani);await member(c,eli,'MODERADOR');const ch=await create(c,{privado:true});
  const [a,b]=await Promise.all([ask(ch),ask(ch)]);assert.equal(a.status,200);assert.equal(a.body.solicitud.id,b.body.solicitud.id);
  assert.equal(await prisma.solicitudAccesoCanal.count(),1);
  assert.equal(await prisma.notificacion.count({where:{tipo:'solicitud_canal'}}),1);
  const q=a.body.solicitud;
  assert.equal((await read(`/channels/${ch.id}/requests`,dani)).status,403);
  assert.equal((await decide(ch,q.id,{aceptar:true,permisos:['VER']},eli)).status,403);
  assert.equal((await read(`/notifications`,ana)).body.items.find(n=>n.tipo==='solicitud_canal').contexto.idCanal,ch.id);
  const approved=await decide(ch,q.id,{aceptar:true,permisos:['VER']});assert.equal(approved.status,200);
  assert.deepEqual((await read(`/channels/${ch.id}`)).body.canal.misPermisos,['VER']);
  assert.equal((await read('/notifications',ana)).body.items.some(n=>n.tipo==='solicitud_canal'),false);
  assert.ok((await read('/notifications')).body.items.some(n=>n.tipo==='acceso_aceptado'&&n.contexto.idComunidad===c.id));
  await decide(ch,q.id,{aceptar:true,permisos:['VER']});assert.equal(await prisma.notificacion.count({where:{tipo:'acceso_aceptado'}}),1);
});
test('rechazo no da acceso y permite un nuevo pedido sin duplicar solicitudes pendientes',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});const q=(await ask(ch)).body.solicitud;
  assert.equal((await decide(ch,q.id,{aceptar:false})).status,200);
  assert.equal((await read(`/channels/${ch.id}`)).status,404);
  assert.equal((await read('/notifications')).body.items.find(n=>n.tipo==='acceso_rechazado').contexto.idComunidad,undefined);
  await ask(ch);await ask(ch);assert.equal(await prisma.solicitudAccesoCanal.count({where:{estado:'PENDIENTE'}}),1);
  assert.equal(await prisma.notificacion.count({where:{tipo:'solicitud_canal',leida:false}}),1);
});
test('resoluciones concurrentes convergen, no conceden permisos fuera del tipo y no cruzan canales',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});const other=await create(c,{privado:true});const q=(await ask(ch)).body.solicitud;
  assert.equal((await decide(other,q.id,{aceptar:true,permisos:['VER']})).status,404);
  assert.equal((await decide(ch,q.id,{aceptar:true,permisos:['TRANSMITIR']})).status,400);
  const replies=await Promise.all([decide(ch,q.id,{aceptar:true,permisos:['VER']}),decide(ch,q.id,{aceptar:false})]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  assert.equal(await prisma.notificacion.count({where:{tipo:{in:['acceso_aceptado','acceso_rechazado']}}}),1);
});
test('baneo o abandono borra solicitudes y hace imposible aprobarlas después',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});const q=(await ask(ch)).body.solicitud;
  const {banMember}=await import('../src/services/communityBansService.js');await banMember(c.id,ana.id,dani.id,{motivo:'Prueba'});
  assert.equal(await prisma.solicitudAccesoCanal.count(),0);
  assert.equal((await decide(ch,q.id,{aceptar:true,permisos:['VER']})).status,404);
  assert.equal((await ask(ch)).status,404);
  assert.equal((await read('/notifications')).body.items.some(n=>n.contexto?.nombre),false);
});
test('habilitación privada manual, revocación y recuperación de pedidos sin rol colectivo',async()=>{
  const c=await community();await member(c,dani);await member(c,eli);const ch=await create(c,{privado:true});
  assert.equal((await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['ESCRIBIR']}]})).status,200);
  assert.deepEqual((await read(`/channels/${ch.id}`)).body.canal.misPermisos,['VER','ESCRIBIR']);
  assert.equal((await read(`/channels/${ch.id}`,eli)).status,404);
  assert.equal((await read(`/channels/${ch.id}/access`,ana)).body.acceso.habilitaciones.length,1);
  await config(ch,{privado:true,habilitaciones:[]});assert.equal((await read(`/channels/${ch.id}`)).status,404);
  assert.equal((await ask(ch)).body.solicitud.estado,'PENDIENTE');
});
test('privacidad y tipo son inmutables por PATCH y configuración sin alterar pedidos ni permisos',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});await ask(ch);
  const publicCh=await create(c);
  for(const body of [{privado:false},{tipo:'VOZ'},{nombre:'cambio',privado:false}]) assert.equal((await request(`/channels/${ch.id}`,{method:'PATCH',as:ana,body})).status,400);
  assert.equal((await config(ch,{privado:false,permisosGlobales:['VER']})).status,409);
  assert.equal((await config(publicCh,{privado:true,habilitaciones:[]})).status,409);
  assert.equal((await prisma.canal.findUnique({where:{id:ch.id}})).privado,true);
  assert.equal(await prisma.solicitudAccesoCanal.count(),1);
  assert.equal((await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['VER']}]})).status,200);
  assert.equal((await config(publicCh,{privado:false,permisosGlobales:['VER']})).status,200);
});
test('migración conserva habilitaciones privadas vigentes por persona y unifica públicos sin ampliar permisos',async()=>{
  const legacy='test_policy_migration_'+randomUUID().replaceAll('-','');
  const url=new URL(databaseUrl);url.searchParams.set('schema',legacy);const client=new PrismaClient({datasourceUrl:url.href});
  try{
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);
    await applyMigrations(admin,legacy,{hasta:'20261120220000_permisos_base_publicos'});
    const users=await Promise.all(['uno','dos','futuro'].map(nombreUsuario=>client.usuario.create({select:{id:true},data:{nombreUsuario,nombreVisible:nombreUsuario,correo:nombreUsuario+'@test.test',hashContrasena:'test'}})));
    const c=await client.comunidad.create({data:{nombre:'Anterior'}});
    for(const u of users.slice(0,2))await client.membresia.create({data:{idComunidad:c.id,idUsuario:u.id,rol:'INTEGRANTE'}});
    const [privateCh]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".canal(id_comunidad,nombre,tipo,privado) VALUES ($1,'Privado','VOZ',true) RETURNING id_canal AS id`,c.id);
    const [publicCh]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".canal(id_comunidad,nombre,tipo) VALUES ($1,'Público','TEXTO') RETURNING id_canal AS id`,c.id);
    await client.canalRol.create({data:{idCanal:privateCh.id,rol:'INTEGRANTE',permisos:['VER','HABLAR']}});
    const [role]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".rol_personalizado(id_comunidad,nombre) VALUES ($1,'Cámara') RETURNING id_rol AS id`,c.id);
    await client.membresiaRol.create({data:{idComunidad:c.id,idUsuario:users[0].id,idRol:role.id}});
    await client.canalRolPersonalizado.create({data:{idCanal:privateCh.id,idComunidad:c.id,idRol:role.id,permisos:['VER','TRANSMITIR']}});
    await client.canalRol.createMany({data:[{idCanal:publicCh.id,rol:'INTEGRANTE',permisos:['VER']},{idCanal:publicCh.id,rol:'MODERADOR',permisos:['VER','ESCRIBIR']}]});
    await applyMigrations(admin,legacy,{desde:'20261120220000_permisos_base_publicos'});
    const grants=await client.canalUsuario.findMany({where:{idCanal:privateCh.id}});
    assert.deepEqual(new Set(grants.find(g=>g.idUsuario===users[0].id).permisos),new Set(['VER','HABLAR','TRANSMITIR']));
    assert.deepEqual(new Set(grants.find(g=>g.idUsuario===users[1].id).permisos),new Set(['VER','HABLAR']));
    await client.membresia.create({data:{idComunidad:c.id,idUsuario:users[2].id,rol:'INTEGRANTE'}});
    assert.equal(await client.canalUsuario.count({where:{idCanal:privateCh.id,idUsuario:users[2].id}}),0);
    assert.deepEqual((await client.canal.findUnique({where:{id:publicCh.id}})).permisosGlobales,['VER']);
    assert.equal(await client.canalRol.count(),0);assert.equal(await client.canalRolPersonalizado.count(),0);
  }finally{await client.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});
test('pedidos y decisiones se sincronizan en varias pestañas sin notificar a terceros',async()=>{
  const c=await community();await member(c,dani);await member(c,eli);const ch=await create(c,{privado:true});
  const a=await socketFor(ana),b=await socketFor(ana),d=await socketFor(dani),outsider=await socketFor(eli);
  let foreign=0;outsider.on('notifications:changed',()=>foreign++);
  const first=once(a,'notifications:changed'),second=once(b,'notifications:changed');
  const q=(await ask(ch)).body.solicitud;await Promise.all([first,second]);
  const approved=once(d,'notifications:changed');await decide(ch,q.id,{aceptar:true,permisos:['VER']});await approved;
  assert.equal(foreign,0);assert.equal((await read(`/channels/${ch.id}`,eli)).status,404);
});
test('smokes de canales, acceso, historial y mensajería siguen funcionando con la política nueva',async()=>{
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {fileURLToPath}=await import('node:url');
  for(const file of ['channels.smoke.js','channel-access.smoke.js','channel-messages.smoke.js','channel-realtime.smoke.js']){
    resetRateLimits();
    const result=await promisify(execFile)(process.execPath,[fileURLToPath(new URL(file,import.meta.url))],{env:{...process.env,DIALO_TEST_API_URL:baseUrl},timeout:1800000});
    assert.ok(result.stdout.includes('OK:'),result.stdout);
  }
});
test('seed de desarrollo usa globales, roles personalizados e individuales sin Moderador',async()=>{
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {fileURLToPath}=await import('node:url');
  await promisify(execFile)(process.execPath,[fileURLToPath(new URL('../prisma/seed.js',import.meta.url))],{env:process.env,timeout:180000});
  const voice=await prisma.canal.findFirst({where:{nombre:'charla',tipo:'VOZ'}});
  assert.ok(voice);assert.deepEqual(voice.permisosGlobales,['VER','HABLAR']);
  assert.equal(await prisma.canalRol.count(),0);assert.equal(await prisma.canalRolPersonalizado.count(),1);
  assert.equal(await prisma.membresia.count({where:{rol:'MODERADOR'}}),0);assert.ok(await prisma.canalUsuario.count()>0);
});
test('habilitar manualmente resuelve el pedido pendiente y sincroniza avisos sin duplicar aprobación',async()=>{
  const c=await community();await member(c,dani);const ch=await create(c,{privado:true});await ask(ch);
  const adminSocket=await socketFor(ana),targetSocket=await socketFor(dani);
  const first=once(adminSocket,'notifications:changed'),second=once(targetSocket,'notifications:changed');
  assert.equal((await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['VER']}]})).status,200);
  await Promise.all([first,second]);
  assert.equal((await read(`/channels/${ch.id}/requests`,ana)).body.items.length,0);
  assert.equal((await read('/notifications',ana)).body.items.some(n=>n.tipo==='solicitud_canal'),false);
  assert.equal(await prisma.notificacion.count({where:{tipo:'acceso_aceptado'}}),1);
  await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:['VER']}]});
  assert.equal(await prisma.notificacion.count({where:{tipo:'acceso_aceptado'}}),1);
});
