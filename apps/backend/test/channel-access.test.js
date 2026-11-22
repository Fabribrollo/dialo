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
if (!databaseUrl) throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_t23_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, ana, beto, cata, dani, eli, permissions;
const sockets = [];
const events = ['channel:created', 'channel:updated', 'channel:access-lost', 'channel:deleted', 'channels:reordered'];

async function request(path, { method = 'GET', body, as, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const response = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(response.status, 201);
  return { ...response.body.usuario, cookie: response.cookie };
}
async function community(tipo = 'PRIVADA') {
  const result = await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Comunidad canales', tipo } });
  assert.equal(result.status, 201);
  const c = result.body.comunidad;
  for (const [user, rol] of [[beto, 'ADMIN'], [cata, 'MODERADOR'], [dani, 'INTEGRANTE']]) {
    await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
  }
  return c;
}
async function create(c, datos = {}, as = ana) {
  const response = await request(`/communities/${c.id}/channels`, { method: 'POST', as, body: { nombre: 'avisos', tipo: 'TEXTO', ...datos } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.canal;
}
async function list(c, as = ana) {
  const response = await request(`/communities/${c.id}/channels`, { as });
  assert.equal(response.status, 200);
  return response.body.items;
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
function capture(socket) {
  const output = [];
  socket.onAny((event, data) => { if (events.includes(event)) output.push({ event, data }); });
  return output;
}
async function flush(...clients) { await Promise.all(clients.map(ready)); await new Promise((resolve) => setTimeout(resolve, 20)); }

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  permissions = await import('../src/services/channelsService.js');
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); beto = await register('beto'); cata = await register('cata'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
  // Un caso revoca explícitamente la sesión: cada prueba recibe una vigente.
  const login = await request('/auth/login', { method: 'POST', body: { identificador: dani.nombreUsuario, contrasena: 'ClaveDePrueba123' } });
  assert.equal(login.status, 200); dani.cookie = login.cookie;
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await drainEffects();
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const access = (ch, body, as = ana) => request(`/channels/${ch.id}/access`, { method: 'PUT', as, body });
const readAccess = (ch, as = ana) => request(`/channels/${ch.id}/access`, { as });
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
const subscribe = (socket, ch) => ack(socket, 'channel:subscribe', { idCanal: ch.id });
const serverSocket = (socket) => io.sockets.sockets.get(socket.id);

test('configuración exige sesión; solo propietario/administrador consultan y reemplazan', async () => {
  const c = await community(), ch = await create(c);
  for (const method of ['GET', 'PUT']) {
    const body = method === 'PUT' ? { privado:false,permisosGlobales:['VER'] } : undefined;
    assert.equal((await request(`/channels/${ch.id}/access`, { method, body })).status, 401);
    for (const user of [cata, dani]) {
      assert.equal((await request(`/channels/${ch.id}/access`, { method, body, as: user })).status, 403);
    }
    assert.equal((await request(`/channels/${ch.id}/access`, { method, body, as: eli })).status, 404);
  }
  assert.equal((await readAccess(ch, beto)).status, 200);
  assert.equal((await access(ch, { privado:false,permisosGlobales:['VER'] }, beto)).status, 200);
  assert.equal((await readAccess(ch, ana)).status, 200);
  assert.equal((await readAccess(ch, cata)).status, 403);
});

test('validación inválida no modifica configuración ni emite eventos', async () => {
  const c = await community(), ch = await create(c);
  const socket = await socketFor(dani), recorded = capture(socket);
  const before = (await readAccess(ch)).body;
  for (const body of [
    {}, { privado: true }, { privado: 'true', habilitaciones: [] },
    { privado: true, habilitaciones: [{ rol: 'ADMIN', permisos: ['VER'] }] },
    { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER', 'VER'] }] },
    { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER'] }, { idUsuario: dani.id, permisos: [] }] },
    { privado: true, habilitaciones: [], idComunidad: c.id },
  ]) assert.equal((await access(ch, body)).status, 400);
  await flush(socket);
  assert.deepEqual(recorded, []); assert.deepEqual((await readAccess(ch)).body, before);
});

test('sockets aplican VER, payload estricto, sesión vigente, unsubscribe idempotente', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  const client = await socketFor(dani), outsider = await socketFor(eli);
  assert.equal((await subscribe(client, ch)).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await subscribe(outsider, ch)).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await ack(client, 'channel:subscribe', { idCanal: ch.id, rol: 'ADMIN' })).error.code, 'VALIDATION_ERROR');
  await access(ch, { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER'] }] });
  assert.deepEqual((await subscribe(client, ch)).data.canal.misPermisos, ['VER']);
  assert(serverSocket(client).rooms.has(`channel:${ch.id}`));
  assert.equal((await subscribe(client, ch)).ok, true);
  assert.equal((await ack(client, 'channel:unsubscribe', { idCanal: ch.id })).ok, true);
  assert(!serverSocket(client).rooms.has(`channel:${ch.id}`));
  assert.equal((await ack(client, 'channel:unsubscribe', { idCanal: 2_147_483_647 })).ok, true);
  // El logout avisa y desconecta el socket.
  const ended = once(client, 'session:ended'), disconnected = once(client, 'disconnect');
  await request('/auth/logout', { method: 'POST', as: dani });
  assert.deepEqual((await ended)[0], { motivo: 'LOGOUT' });
  await disconnected; assert.equal(client.connected, false);
});

test('revocar VER retira ambas pestañas, impide eventos y resuscripción; recuperar acceso no reconecta automáticamente', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  await access(ch, { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER', 'ESCRIBIR'] }] });
  const clients = await Promise.all([dani, dani, eli].map(socketFor)), captured = clients.map(capture);
  for (const client of clients.slice(0, 2)) assert.equal((await subscribe(client, ch)).ok, true);
  const received = [];
  clients[0].on('test:canal', (data) => received.push(data));
  await access(ch, { privado: true, habilitaciones: [] });
  await flush(...clients);
  for (let n = 0; n < 2; n++) {
    assert(!serverSocket(clients[n]).rooms.has(`channel:${ch.id}`));
    assert(captured[n].some((e) => e.event === 'channel:access-lost' && e.data.idCanal === ch.id));
    assert.equal((await subscribe(clients[n], ch)).error.code, 'CHANNEL_NOT_FOUND');
  }
  io.to(`channel:${ch.id}`).emit('test:canal', 'no debe llegar');
  await flush(...clients); assert.deepEqual(received, []); assert.deepEqual(captured[2], []);
  assert.equal((await request(`/channels/${ch.id}`, { as: dani })).status, 404);
  await access(ch, { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER'] }] });
  await flush(...clients);
  for (let n = 0; n < 2; n++) {
    assert(captured[n].some((e) => e.event === 'channel:updated' && e.data.canal.id === ch.id));
    assert(!serverSocket(clients[n]).rooms.has(`channel:${ch.id}`));
    assert.equal((await subscribe(clients[n], ch)).ok, true);
  }
});

test('permisos y suscripción concurrentes nunca dejan un socket sin VER dentro de la room', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  const client = await socketFor(dani);
  for (let n = 0; n < 3; n++) {
    await access(ch, { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER'] }] });
    const [changed, joined] = await Promise.all([access(ch, { privado: true, habilitaciones: [] }), subscribe(client, ch)]);
    assert.equal(changed.status, 200); assert(joined.ok || joined.error.code === 'CHANNEL_NOT_FOUND');
    await flush(client); assert(!serverSocket(client).rooms.has(`channel:${ch.id}`));
  }
});

test('abandono coordinado con suscripción elimina habilitación y nunca permite eventos posteriores', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  await access(ch, { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER'] }] });
  const client = await socketFor(dani);
  const [left, joined] = await Promise.all([
    request(`/communities/${c.id}/leave`, { method: 'POST', as: dani }), subscribe(client, ch),
  ]);
  assert.equal(left.status, 204); assert(joined.ok || joined.error.code === 'CHANNEL_NOT_FOUND');
  await flush(client);
  assert(!serverSocket(client).rooms.has(`channel:${ch.id}`));
  assert.equal(await prisma.canalUsuario.count({ where: { idCanal: ch.id, idUsuario: dani.id } }), 0);
  assert.equal((await subscribe(client, ch)).error.code, 'CHANNEL_NOT_FOUND');
});

test('borrado coordinado con suscripción retira todas las rooms', async () => {
  const c = await community(), ch = await create(c);
  const client = await socketFor(dani);
  const [deleted, joined] = await Promise.all([
    request(`/communities/${c.id}`, { method: 'DELETE', as: ana }), subscribe(client, ch),
  ]);
  assert.equal(deleted.status, 204); assert(joined.ok || joined.error.code === 'CHANNEL_NOT_FOUND');
  await flush(client); assert(!serverSocket(client).rooms.has(`channel:${ch.id}`));
});
