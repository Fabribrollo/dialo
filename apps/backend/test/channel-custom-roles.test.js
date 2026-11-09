import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { applyMigrations } from './migrations.js';
import { effectiveChannelPermissions } from '../src/utils/channelPermissions.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configura TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_t31_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, channels, ana, dani, eli;
const sockets = [];
const events = ['channel:updated', 'channel:access-lost'];

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
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(8000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
function capture(socket) {
  const output = [];
  socket.onAny((event, data) => { if (events.includes(event)) output.push({ event, data }); });
  return output;
}
async function flush(...clients) { await Promise.all(clients.map(ready)); await new Promise((resolve) => setTimeout(resolve, 30)); }
const serverSocket = (client) => io.sockets.sockets.get(client.id);

// Comunidad privada con un canal privado y dos roles personalizados.
async function escenario() {
  const r = await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Roles', tipo: 'PRIVADA' } });
  assert.equal(r.status, 201);
  const c = r.body.comunidad;
  await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: dani.id } });
  const canal = (await request(`/communities/${c.id}/channels`, { method: 'POST', as: ana, body: { nombre: 'privado', tipo: 'TEXTO', privado: true } })).body.canal;
  const lectores = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Lectores' } });
  const editores = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Editores' } });
  return { c, canal, lectores, editores };
}
const acceso = (canal, habilitaciones) => request(`/channels/${canal.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones } });
const asignar = (c, user, rol) => channels.withCommunityAccessChange(c.id, (tx) => tx.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: user.id, idRol: rol.id } }));
const quitar = (c, user, rol) => channels.withCommunityAccessChange(c.id, (tx) => tx.membresiaRol.delete({ where: { idRol_idUsuario: { idRol: rol.id, idUsuario: user.id } } }));

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  channels = await import('../src/services/channelsService.js');
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
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('los roles personalizados se suman al rol base y a la habilitacion individual', () => {
  const canal = {
    tipo: 'TEXTO', privado: true,
    habilitacionesRol: [{ rol: 'INTEGRANTE', permisos: ['VER'] }],
    habilitacionesUsuario: [],
    habilitacionesRolPersonalizado: [{ idRol: 1, permisos: ['VER'] }, { idRol: 2, permisos: ['ESCRIBIR'] }],
  };
  assert.deepEqual(effectiveChannelPermissions(canal, 'INTEGRANTE', 7, [1, 2]), ['VER', 'ESCRIBIR']);
  assert.deepEqual(effectiveChannelPermissions(canal, 'INTEGRANTE', 7, [1]), ['VER']);
  // Un rol que el integrante no tiene (por ejemplo, de otra comunidad) no concede nada.
  assert.deepEqual(effectiveChannelPermissions({ ...canal, habilitacionesRol: [] }, 'INTEGRANTE', 7, [99]), []);
  // ESCRIBIR implica VER aunque el rol solo otorgue ESCRIBIR.
  assert.deepEqual(effectiveChannelPermissions({ ...canal, habilitacionesRol: [] }, 'INTEGRANTE', 7, [2]), ['VER', 'ESCRIBIR']);
  // Se filtran los permisos que no aplican al tipo de canal.
  assert.deepEqual(effectiveChannelPermissions({ ...canal, tipo: 'VOZ', habilitacionesRol: [] }, 'INTEGRANTE', 7, [1, 2]), ['VER']);
  assert.deepEqual(effectiveChannelPermissions(canal, null, 7, [1, 2]), []);
});

test('la configuracion de acceso acepta roles personalizados de la comunidad y rechaza los ajenos', async () => {
  const { canal, lectores } = await escenario();
  const r = await acceso(canal, [{ idRol: lectores.id, permisos: ['ESCRIBIR'] }]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.acceso.habilitaciones, [{ rolPersonalizado: { id: lectores.id, nombre: 'Lectores' }, permisos: ['VER', 'ESCRIBIR'] }]);
  assert.deepEqual((await request(`/channels/${canal.id}/access`, { as: ana })).body.acceso, r.body.acceso);

  const otra = await prisma.comunidad.create({ data: { nombre: 'Otra' } });
  const ajeno = await prisma.rolPersonalizado.create({ data: { idComunidad: otra.id, nombre: 'Ajeno' } });
  const rechazo = await acceso(canal, [{ idRol: ajeno.id, permisos: ['VER'] }]);
  assert.equal(rechazo.status, 404); assert.equal(rechazo.body.error.code, 'ROLE_NOT_FOUND');
  assert.equal((await acceso(canal, [{ idRol: lectores.id, permisos: ['VER'] }, { idRol: lectores.id, permisos: ['VER'] }])).status, 400);
  // El rechazo no modifica la configuracion guardada.
  assert.deepEqual((await request(`/channels/${canal.id}/access`, { as: ana })).body.acceso, r.body.acceso);
});

test('un rol personalizado da acceso igual por REST y por Socket.IO, y nunca a un no integrante', async () => {
  const { c, canal, lectores } = await escenario();
  await acceso(canal, [{ idRol: lectores.id, permisos: ['VER'] }]);
  assert.equal((await request(`/channels/${canal.id}`, { as: dani })).status, 404);
  await asignar(c, dani, lectores);
  assert.deepEqual((await request(`/channels/${canal.id}`, { as: dani })).body.canal.misPermisos, ['VER']);
  assert((await request(`/communities/${c.id}/channels`, { as: dani })).body.items.some((ch) => ch.id === canal.id));
  const socket = await socketFor(dani);
  assert.equal((await ack(socket, 'channel:subscribe', { idCanal: canal.id })).ok, true);
  const ajeno = await socketFor(eli);
  assert.equal((await ack(ajeno, 'channel:subscribe', { idCanal: canal.id })).error.code, 'CHANNEL_NOT_FOUND');
});

test('dos roles suman permisos; al quitar uno quedan los de la otra fuente y se bloquea la escritura', async () => {
  const { c, canal, lectores, editores } = await escenario();
  await acceso(canal, [{ idRol: lectores.id, permisos: ['VER'] }, { idRol: editores.id, permisos: ['VER', 'ESCRIBIR'] }]);
  await asignar(c, dani, lectores); await asignar(c, dani, editores);
  const tabs = [await socketFor(dani), await socketFor(dani)], logs = tabs.map(capture);
  for (const tab of tabs) assert.deepEqual((await ack(tab, 'channel:subscribe', { idCanal: canal.id })).data.canal.misPermisos, ['VER', 'ESCRIBIR']);
  assert.equal((await ack(tabs[0], 'channel-message:send', { idCanal: canal.id, contenido: 'Antes' })).ok, true);

  await quitar(c, dani, editores);
  await flush(...tabs);
  for (const log of logs) {
    assert.deepEqual(log.filter((e) => e.event === 'channel:updated').map((e) => e.data.canal.misPermisos), [['VER']]);
    assert(!log.some((e) => e.event === 'channel:access-lost'));
  }
  for (const tab of tabs) assert(serverSocket(tab).rooms.has(`channel:${canal.id}`));
  assert.equal((await ack(tabs[0], 'channel-message:send', { idCanal: canal.id, contenido: 'Despues' })).error.code, 'NO_WRITE_PERMISSION');
  assert.equal((await request(`/channels/${canal.id}/messages`, { as: dani })).status, 200);
});

test('perder el ultimo rol con VER retira las suscripciones de todas las pestanas', async () => {
  const { c, canal, lectores } = await escenario();
  await acceso(canal, [{ idRol: lectores.id, permisos: ['VER'] }]);
  await asignar(c, dani, lectores);
  const tabs = [await socketFor(dani), await socketFor(dani)], logs = tabs.map(capture);
  for (const tab of tabs) assert.equal((await ack(tab, 'channel:subscribe', { idCanal: canal.id })).ok, true);

  await quitar(c, dani, lectores);
  await flush(...tabs);
  for (const [n, tab] of tabs.entries()) {
    assert(logs[n].some((e) => e.event === 'channel:access-lost' && e.data.idCanal === canal.id));
    assert(!serverSocket(tab).rooms.has(`channel:${canal.id}`));
  }
  assert.equal((await request(`/channels/${canal.id}`, { as: dani })).status, 404);
  assert.equal((await ack(tabs[0], 'channel:subscribe', { idCanal: canal.id })).error.code, 'CHANNEL_NOT_FOUND');
});

test('eliminar un rol revoca el acceso que daba y avisa al punto de integracion', async () => {
  const { c, canal, lectores } = await escenario();
  await acceso(canal, [{ idRol: lectores.id, permisos: ['VER'] }]);
  await asignar(c, dani, lectores);
  const recibidos = [];
  const quitarListener = channels.onChannelAccessChange((cambios) => recibidos.push(...cambios));
  try {
    const tab = await socketFor(dani), log = capture(tab);
    await ack(tab, 'channel:subscribe', { idCanal: canal.id });
    await channels.withCommunityAccessChange(c.id, (tx) => tx.rolPersonalizado.delete({ where: { id: lectores.id } }));
    await flush(tab);
    assert(log.some((e) => e.event === 'channel:access-lost'));
    assert.deepEqual(recibidos, [{ idComunidad: c.id, idCanal: canal.id, idUsuario: dani.id, antes: ['VER'], despues: [] }]);
  } finally { quitarListener(); }
});

test('el rol base y la autoridad de propietario no cambian con roles personalizados', async () => {
  const { canal } = await escenario();
  assert.deepEqual((await request(`/channels/${canal.id}`, { as: ana })).body.canal.misPermisos, ['VER', 'ESCRIBIR']);
  assert.equal((await request(`/channels/${canal.id}`, { as: dani })).status, 404);
});
