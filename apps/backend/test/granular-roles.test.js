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
// Esta suite comprueba IA sin proveedor; no heredar credenciales del entorno real.
process.env.OPENAI_API_KEY = '';

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

const role=async(c,permisos)=>{
 const r=await request(`/communities/${c.id}/roles`,{method:'POST',as:ana,body:{nombre:'Equipo',permisos}});
 assert.equal(r.status,201,JSON.stringify(r.body));return r.body.rol;
};
const assign=async(c,u,r)=>{await prisma.membresiaRol.create({data:{idComunidad:c.id,idUsuario:u.id,idRol:r.id}});};
test('roles con capacidades persisten; editar y quitar un rol recalcula el canal',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{permisosGlobales:[]});
 const r=await role(c,['ESCRIBIR','ELIMINAR_MENSAJES']);await assign(c,dani,r);
 let p=await request(`/channels/${ch.id}`,{as:dani});assert.equal(p.status,200);assert(p.body.canal.misPermisos.includes('ELIMINAR_MENSAJES'));
 const saved=await request(`/communities/${c.id}/roles/${r.id}`,{method:'PATCH',as:ana,body:{nombre:r.nombre,permisos:[]}});assert.equal(saved.status,200);
 assert.deepEqual((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos,['VER']);
});
test('privados exigen admisión individual y los roles siempre suman sus capacidades',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{privado:true});const r=await role(c,['ESCRIBIR']);await assign(c,dani,r);
 assert.equal((await request(`/channels/${ch.id}`,{as:dani})).status,404);
 assert.equal((await config(ch,{privado:true,roles:[{idRol:r.id,permisos:['VER']}],habilitaciones:[]})).status,400);
 assert.equal((await config(ch,{privado:true,habilitaciones:[{idUsuario:dani.id,permisos:[]}]})).status,200);
 assert.deepEqual((await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos,['VER','ESCRIBIR']);
 assert.equal((await ask(ch)).status,409);
 await config(ch,{privado:true,habilitaciones:[]});assert.equal((await read(`/channels/${ch.id}`)).status,404);
});
test('roles públicos no admiten excepciones por canal y conservan sus capacidades heredadas',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{permisosGlobales:[]});const r=await role(c,['ESCRIBIR']);await assign(c,dani,r);
 assert.equal((await config(ch,{privado:false,permisosGlobales:[],roles:[{idRol:r.id,permisos:[]}]})).status,400);
 assert.deepEqual((await read(`/channels/${ch.id}`)).body.canal.misPermisos,['VER','ESCRIBIR']);
});
test('administrador tiene acceso total, puede promover y no puede quitar admin, borrar ni transferir',async()=>{
 const c=await community();await member(c,dani,'ADMIN');await member(c,eli);const ch=await create(c,{privado:true});
 const permissions=(await request(`/channels/${ch.id}`,{as:dani})).body.canal.misPermisos;assert(permissions.includes('BANEAR'));assert(permissions.includes('GESTIONAR_CANALES'));
 assert.equal((await request(`/communities/${c.id}/members/${eli.id}`,{method:'PATCH',as:dani,body:{rol:'ADMIN'}})).status,200);
 assert.equal((await request(`/communities/${c.id}/members/${eli.id}`,{method:'PATCH',as:dani,body:{rol:'INTEGRANTE'}})).status,403);
 assert.equal((await request(`/communities/${c.id}/members/${eli.id}/kick`,{method:'POST',as:dani,body:{}})).status,403);
 assert.equal((await request(`/communities/${c.id}/bans/${eli.id}`,{method:'PUT',as:dani,body:{motivo:'Motivo de prueba'}})).status,403);
 assert.equal((await request(`/communities/${c.id}`,{method:'DELETE',as:dani})).status,403);
 assert.equal((await request(`/communities/${c.id}/ownership`,{method:'POST',as:dani,body:{idUsuario:eli.id}})).status,403);
});
test('rol personalizado gestiona canales y expulsa solo del canal sin autoridad global',async()=>{
 const c=await community();await member(c,dani);await member(c,eli);const r=await role(c,['GESTIONAR_CANALES','EXPULSAR']);await assign(c,dani,r);
 assert.equal((await request(`/communities/${c.id}/members/${eli.id}/kick`,{method:'POST',as:dani,body:{}})).status,403);
 const ch=await create(c);assert.equal((await request(`/channels/${ch.id}/members/${eli.id}/kick`,{method:'POST',as:dani,body:{}})).status,204);
 assert.equal(await prisma.membresia.count({where:{idComunidad:c.id,idUsuario:eli.id}}),1);
 assert.equal(await prisma.comunidadBaneo.count({where:{idComunidad:c.id,idUsuario:eli.id}}),0);
 assert.equal((await request(`/communities/${c.id}/roles`,{method:'POST',as:dani,body:{nombre:'Elevado',permisos:['ESCRIBIR']}})).status,403);
 assert.equal((await request(`/communities/${c.id}/members/${ana.id}/kick`,{method:'POST',as:dani,body:{}})).status,403);
 assert.equal((await request(`/communities/${c.id}/members/${dani.id}`,{method:'PATCH',as:dani,body:{rol:'ADMIN'}})).status,403);
});
test('cámara, pantalla y silencio tienen permisos independientes persistentes',async()=>{
 const c=await community();await member(c,dani);const ch=await create(c,{tipo:'VOZ',permisosGlobales:['VER','HABLAR','CAMARA']});
 const calls=await import('../src/services/callsService.js');const channels=await import('../src/services/channelsService.js');
 let p=await channels.getChannelPermissions(ch.id,dani.id);assert.deepEqual(calls.fuentesPermitidas(p),['microfono','camara']);
 assert.equal((await request(`/channels/${ch.id}/members/${dani.id}/silence`,{method:'POST',as:ana,body:{silenciado:true}})).status,204);
 p=await channels.getChannelPermissions(ch.id,dani.id);assert.deepEqual(calls.fuentesPermitidas(p),['camara']);
 const managed=await request(`/channels/${ch.id}/members/management`,{as:ana});assert.equal(managed.status,200);assert.equal(managed.body.items.find(m=>m.usuario.id===dani.id).silenciado,true);assert.equal(managed.body.items[0].usuario.correo,undefined);assert.equal((await request(`/channels/${ch.id}/members/management`,{as:dani})).status,403);
 assert.equal((await request(`/channels/${ch.id}/members/${ana.id}/silence`,{method:'POST',as:dani,body:{silenciado:true}})).status,403);
 await request(`/channels/${ch.id}/members/${dani.id}/silence`,{method:'POST',as:ana,body:{silenciado:false}});
 assert((await channels.getChannelPermissions(ch.id,dani.id)).includes('HABLAR'));
});
test('rol base moderador y permisos inventados son rechazados; IA sin clave no modifica datos',async()=>{
 const c=await community();await member(c,dani);
 assert.equal((await request(`/communities/${c.id}/members/${dani.id}`,{method:'PATCH',as:ana,body:{rol:'MODERADOR'}})).status,400);
 assert.equal((await request(`/communities/${c.id}/roles`,{method:'POST',as:ana,body:{nombre:'Robot',permisos:['SER_PROPIETARIO']}})).status,400);
 assert.equal((await request(`/communities/${c.id}/roles/suggestion`,{method:'POST',as:ana,body:{descripcion:'Ayudar en el chat'}})).status,503);
 assert.equal(await prisma.rolPersonalizado.count({where:{idComunidad:c.id}}),0);
});

test('permisos de banear y echar por canal no conceden autoridad global',async()=>{
 const c=await community();await member(c,dani);await member(c,eli);const ch=await create(c);
 await config(ch,{privado:false,permisosGlobales:['VER','ESCRIBIR'],roles:[],habilitaciones:[{idUsuario:dani.id,permisos:['VER','BANEAR']}]});
 assert.equal((await request(`/communities/${c.id}/bans/${eli.id}`,{method:'PUT',as:dani,body:{motivo:'Prueba'}})).status,403);
 assert.equal((await request(`/channels/${ch.id}/members/${eli.id}/ban`,{method:'POST',as:dani,body:{}})).status,403);
 assert.equal(await prisma.comunidadBaneo.count({where:{idComunidad:c.id,idUsuario:eli.id}}),0);
 assert.equal((await request(`/channels/${ch.id}/members/${ana.id}/ban`,{method:'POST',as:dani,body:{}})).status,403);
});
test('migración retira Moderador conservando membresías y responsabilidades en un rol personalizado',async()=>{
 const legacy='test_roles_migration_'+randomUUID().replaceAll('-','');const url=new URL(databaseUrl);url.searchParams.set('schema',legacy);const db=new PrismaClient({datasourceUrl:url.href});
 try{
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);await applyMigrations(admin,legacy,{hasta:'20261120230000_solicitudes_canales'});
  const users=await Promise.all(['uno','dos'].map(nombreUsuario=>db.usuario.create({select:{id:true},data:{nombreUsuario,nombreVisible:nombreUsuario,correo:nombreUsuario+'@test.test',hashContrasena:'test'}})));
  const [c]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".comunidad(nombre) VALUES ('Anterior') RETURNING id_comunidad AS id`);await db.membresia.createMany({data:users.map(u=>({idComunidad:c.id,idUsuario:u.id,rol:'MODERADOR'}))});
  const channel=await db.canal.create({data:{idComunidad:c.id,nombre:'Privado previo',privado:true},select:{id:true}});
  await db.canalUsuario.create({data:{idCanal:channel.id,idComunidad:c.id,idUsuario:users[0].id,permisos:['VER']}});
  await applyMigrations(admin,legacy,{desde:'20261120230000_solicitudes_canales'});
  const oldAccess=await db.canalUsuario.findFirst({where:{idCanal:channel.id,idUsuario:users[0].id}});assert(oldAccess.permisos.includes('ELIMINAR_MENSAJES'));
  assert.equal(await db.canalUsuario.count({where:{idCanal:channel.id,idUsuario:users[1].id}}),0);
  const members=await db.membresia.findMany({where:{idComunidad:c.id},include:{rolesPersonalizados:{include:{rol:true}}}});
  assert.equal(members.length,2);assert(members.every(m=>m.rol==='INTEGRANTE'));assert.equal(await db.rolPersonalizado.count({where:{idComunidad:c.id}}),1);
  assert(members.every(m=>m.rolesPersonalizados[0].rol.permisos.includes('ELIMINAR_MENSAJES')));assert(members.every(m=>!m.rolesPersonalizados[0].rol.permisos.includes('BANEAR')));
 }finally{await db.$disconnect();await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);}
});
test('IA propone capacidades existentes sin guardar y rechaza permisos inventados',async()=>{
 const c=await community();const {env}=await import('../src/config/env.js');const {suggestRole}=await import('../src/services/roleSuggestionService.js');const key=env.openaiApiKey,model=process.env.OPENAI_GENERATION_MODEL;env.openaiApiKey='test-key';process.env.OPENAI_GENERATION_MODEL='test-model';
 try{
  const transport=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({nombre:'Eventos',permisos:['CAMARA'],resumen:'Permite compartir cámara.'})}]}]})});
  const proposed=await suggestRole(c.id,ana.id,{descripcion:'Coordinar eventos'},transport);assert.deepEqual(proposed.permisos,['CAMARA']);assert.equal(await prisma.rolPersonalizado.count({where:{idComunidad:c.id}}),0);
  const invalid=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({nombre:'Dueño',permisos:['SER_PROPIETARIO'],resumen:'Inválido'})}]}]})});
  await assert.rejects(suggestRole(c.id,ana.id,{descripcion:'Coordinar eventos'},invalid),e=>e.code==='AI_UNAVAILABLE');
 }finally{env.openaiApiKey=key;if(model===undefined)delete process.env.OPENAI_GENERATION_MODEL;else process.env.OPENAI_GENERATION_MODEL=model;}
});
