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
const schema = `test_notifications_${randomUUID().replaceAll('-', '')}`;
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

const list = async(user=dani) => {
  const response = await request('/notifications', {as:user});
  assert.equal(response.status,200,JSON.stringify(response.body));
  return response.body;
};
const changeRoles = async(c,rol='ADMIN') => {
  const { updateMemberRoles } = await import('../src/services/communityMemberRolesService.js');
  return updateMemberRoles(c.id,dani.id,ana.id,{rol});
};
test('cambio de rol persiste una vez, no notifica operaciones fallidas y aísla destinatarios', async()=>{
  const c=await community();await member(c,dani);
  await changeRoles(c);await changeRoles(c);
  const page=await list();assert.equal(page.items.length,1);assert.equal(page.items[0].tipo,'roles');
  assert.equal(page.items[0].contexto.nombre,c.nombre);assert.equal(page.noLeidas,1);
  assert.equal((await list(eli)).items.length,0);
  const {updateMemberRoles}=await import('../src/services/communityMemberRolesService.js');
  await assert.rejects(updateMemberRoles(c.id,dani.id,eli.id,{rol:'INTEGRANTE'}));
  assert.equal(await prisma.notificacion.count(),1);
});
test('baneo y rehabilitación son genéricos, repetibles sin duplicados y no restauran membresía',async()=>{
  const c=await community();await member(c,dani);await changeRoles(c);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const {notify}=await import('../src/services/notificationsService.js');
  await notify(dani.id,'canal',ch.id,'mensaje:999999');
  const {banMember,removeBan}=await import('../src/services/communityBansService.js');
  await banMember(c.id,ana.id,dani.id,{motivo:'Motivo reservado'});
  await banMember(c.id,ana.id,dani.id,{motivo:'Motivo reservado'});
  let page=await list();assert.equal(page.items.length,2);assert.equal(page.noLeidas,2);
  assert.ok(page.items.some(n=>n.tipo==='baneo'));
  assert.ok(page.items.every(n=>!n.contexto?.nombre&&!n.contexto?.idComunidad&&!n.vista));
  assert.ok(!JSON.stringify(page).includes('Motivo reservado'));
  await removeBan(c.id,ana.id,dani.id);await removeBan(c.id,ana.id,dani.id);
  page=await list();assert.equal(page.items.length,3);assert.equal(page.items[0].tipo,'rehabilitado');
  assert.equal(await prisma.membresia.count({where:{idComunidad:c.id,idUsuario:dani.id}}),0);
  await prisma.comunidad.delete({where:{id:c.id}});
  assert.ok((await list()).items.every(n=>!n.contexto?.nombre));
});
test('restricción de canal elimina mensajes privados del listado y genera un aviso seguro',async()=>{
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const {notify}=await import('../src/services/notificationsService.js');
  await notify(dani.id,'canal',ch.id,'mensaje:999998');
  const {kickChannelMember}=await import('../src/services/memberActionsService.js');
  await kickChannelMember(ch.id,ana.id,dani.id);
  await kickChannelMember(ch.id,ana.id,dani.id);
  const page=await list();assert.equal(page.items.length,1);assert.equal(page.items[0].tipo,'acceso');
  assert.deepEqual(page.items[0].contexto,{});assert.equal(page.noLeidas,1);
  assert.equal((await request(`/channels/${ch.id}`,{as:dani})).status,404);
});
test('pérdida de escritura conserva el destino autorizado sin incluir texto privado',async()=>{
  const c=await community();await member(c,dani);
  const ch=await prisma.canal.findFirstOrThrow({where:{idComunidad:c.id}});
  const {replaceChannelAccess}=await import('../src/services/channelAccessService.js');
  await replaceChannelAccess(ch.id,ana.id,{privado:false,permisosGlobales:['VER']});
  const page=await list();assert.equal(page.items[0].tipo,'acceso');assert.equal(page.items[0].contexto.idComunidad,c.id);
  assert.equal(page.items[0].vista,undefined);
});
test('lectura simultánea sincroniza pestañas, reconexión recupera persistencia y no toca terceros',async()=>{
  const c=await community();await member(c,dani);
  const one=await socketFor(dani),two=await socketFor(dani),other=await socketFor(eli);
  const first=once(one,'notifications:changed'),second=once(two,'notifications:changed');
  let foreign=0;other.on('notifications:changed',()=>foreign++);
  await changeRoles(c);await Promise.all([first,second]);
  const page=await list();const id=page.items[0].id;
  await request('/notifications/read',{method:'POST',as:eli,body:{id}});
  assert.equal((await list()).noLeidas,1);
  const readOne=once(one,'notifications:changed'),readTwo=once(two,'notifications:changed');
  const replies=await Promise.all([request('/notifications/read',{method:'POST',as:dani,body:{id}}),request('/notifications/read',{method:'POST',as:dani,body:{tipo:'roles',referencia:c.id}})]);
  assert.ok(replies.every(r=>r.status===204));await Promise.all([readOne,readTwo]);
  one.disconnect();two.disconnect();await changeRoles(c,'INTEGRANTE');
  await socketFor(dani);const after=await list();assert.equal(after.noLeidas,2);assert.deepEqual(new Set(after.items.filter(n=>!n.leida).map(n=>n.tipo)),new Set(['roles','acceso']));assert.equal(foreign,0);
});
test('paginación estable, lectura total y preferencia de silencio',async()=>{
  const {securityNotice}=await import('../src/services/notificationsService.js');
  const c=await community();await member(c,dani);
  for(let i=0;i<35;i++)await prisma.$transaction(tx=>securityNotice(tx,[dani.id],'roles',c.id));
  const first=await list();assert.equal(first.items.length,30);assert.equal(first.noLeidas,35);
  const second=await request(`/notifications?cursor=${first.nextCursor}`,{as:dani});
  assert.equal(second.body.items.length,5);assert.ok(!second.body.items.some(n=>first.items.some(x=>x.id===n.id)));
  await request('/notifications/read',{method:'POST',as:dani,body:{}});assert.equal((await list()).noLeidas,0);
  await prisma.usuario.update({where:{id:dani.id},data:{preferencias:{silenciarNotificaciones:true}}});
  await changeRoles(c);assert.equal(await prisma.notificacion.count(),35);
  assert.equal((await request('/notifications?cursor=invalid',{as:dani})).status,400);
});
test('un rollback no deja avisos y eliminar un rol asignado notifica al afectado',async()=>{
  const {securityNotice}=await import('../src/services/notificationsService.js');
  await assert.rejects(prisma.$transaction(async tx=>{await securityNotice(tx,[dani.id],'roles',10);throw new Error('rollback');}));
  assert.equal(await prisma.notificacion.count(),0);
  const c=await community();await member(c,dani);
  const {createRole,deleteRole}=await import('../src/services/rolesService.js');
  const role=await createRole(c.id,ana.id,{nombre:'Equipo'});
  await prisma.membresiaRol.create({data:{idComunidad:c.id,idUsuario:dani.id,idRol:role.id}});
  await deleteRole(c.id,role.id,ana.id);assert.equal((await list()).items[0].tipo,'roles');
});
test('migración de permisos públicos conserva acceso previo y no abre los privados', async () => {
  const legacy = 'test_public_' + randomUUID().replaceAll('-', '');
  const url = new URL(databaseUrl); url.searchParams.set('schema', legacy);
  const client = new PrismaClient({datasourceUrl:url.href});
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${legacy}"`);
    await applyMigrations(admin, legacy, {hasta:'20261119094000_llamadas_privadas'});
    const [c]=await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".comunidad(nombre) VALUES ('Anterior') RETURNING id_comunidad AS id`);
    const [publicChannel] = await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".canal(id_comunidad,nombre,tipo,posicion) VALUES ($1,'Público','TEXTO',0) RETURNING id_canal AS id`,c.id);
    const [privateChannel] = await admin.$queryRawUnsafe(`INSERT INTO "${legacy}".canal(id_comunidad,nombre,tipo,privado,posicion) VALUES ($1,'Privado','TEXTO',true,1) RETURNING id_canal AS id`,c.id);
    await client.canalRol.createMany({data:[publicChannel,privateChannel].map(ch=>({idCanal:ch.id,rol:'INTEGRANTE',permisos:['VER']}))});
    await applyMigrations(admin, legacy, {desde:'20261119094000_llamadas_privadas',hasta:'20261120220000_permisos_base_publicos'});
    const grants = await client.canalRol.findMany();
    assert.deepEqual(new Set(grants.find(g=>g.idCanal===publicChannel.id).permisos),new Set(['VER','ESCRIBIR']));
    assert.deepEqual(grants.find(g=>g.idCanal===privateChannel.id).permisos,['VER']);
    await client.canalRol.update({where:{idCanal_rol:{idCanal:publicChannel.id,rol:'INTEGRANTE'}},data:{permisos:[]}});
    assert.deepEqual((await client.canalRol.findUnique({where:{idCanal_rol:{idCanal:publicChannel.id,rol:'INTEGRANTE'}}})).permisos,[]);
  } finally {
    await client.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
  }
});
