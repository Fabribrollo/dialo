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
const schema = `test_t41_${randomUUID().replaceAll('-', '')}`;
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
const events = ['community:left', 'channel:access-lost', 'community:bans-changed', 'channel-message:new'];

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
const serverSocket = (client) => io.sockets.sockets.get(client.id);

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
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const endpoint = (c, user) => `/communities/${c.id}/bans${user ? '/' + user.id : ''}`;
const ban = (c, user, as = ana, body = {}) => request(endpoint(c, user), { method: 'PUT', as, body });
const unban = (c, user, as = ana) => request(endpoint(c, user), { method: 'DELETE', as });
const member = (c, user, rol = 'INTEGRANTE') => prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
async function community(owner = ana) {
  const response = await request('/communities', { method: 'POST', as: owner, body: { nombre: 'Club', tipo: 'PRIVADA' } });
  assert.equal(response.status, 201);
  return response.body.comunidad;
}
async function invite(c) {
  const r = await request(`/communities/${c.id}/invitations`, { method: 'POST', as: ana, body: { usosMaximos: 3 } });
  assert.equal(r.status, 201);
  return r.body.invitacion;
}

test('la jerarquía base y la comunidad determinan quién puede gestionar y leer baneos', async () => {
  const c = await community(), another = await community();
  await member(c, dani, 'MODERADOR');
  await member(another, eli);
  assert.equal((await request(endpoint(c))).status, 401);
  assert.equal((await request(endpoint(c), { as: eli })).status, 404);
  assert.equal((await ban(c, eli)).status, 404);
  assert.equal((await ban(c, ana)).body.error.code, 'BAN_HIERARCHY');
  assert.equal((await ban(c, ana, dani)).body.error.code, 'BAN_HIERARCHY');
  assert.equal((await ban(c, dani, dani)).body.error.code, 'BAN_HIERARCHY');
  assert.equal((await ban(c, dani, ana, { motivo: ' '.repeat(3), rol: 'ADMIN' })).status, 400);
  await member(c, eli);
  const role = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Administración' } });
  await prisma.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: eli.id, idRol: role.id } });
  assert.equal((await ban(c, dani, eli)).status, 403);
  assert.equal((await request(endpoint(c), { as: eli })).status, 403);
  assert.equal((await ban(c, eli, dani, { motivo: 'Incumplimiento' })).status, 204);
  assert.equal((await ban(c, dani)).status, 204);
  const { items } = (await request(endpoint(c), { as: ana })).body;
  assert.equal(items.length, 2);
  const banned = items.find((b) => b.usuario.id === eli.id);
  assert.equal(banned.motivo, 'Incumplimiento');
  assert.equal(banned.autor.id, dani.id);
  assert.equal(banned.autor.correo, undefined);
  assert.equal((await unban(c, dani, eli)).status, 404);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: another.id, idUsuario: eli.id } }), 1);
});

test('retira salas, conserva mensajes y bloquea la invitación hasta levantar el baneo', async () => {
  const c = await community(), another = await community();
  await member(c, dani);
  await member(another, dani);
  await member(c, eli);
  const channel = await prisma.canal.findFirstOrThrow({ where: { idComunidad: c.id } });
  const role = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Edición' } });
  await prisma.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: dani.id, idRol: role.id } });
  await prisma.canalUsuario.create({ data: { idCanal: channel.id, idComunidad: c.id, idUsuario: dani.id, permisos: ['VER'] } });
  const message = await prisma.mensaje.create({ data: { idCanal: channel.id, idAutor: dani.id, contenido: 'Queda en el historial' } });
  const inv = await invite(c);
  const preview = `/invitations/${inv.codigo}`;
  const [d1, d2, staff, normal] = await Promise.all([socketFor(dani), socketFor(dani), socketFor(ana), socketFor(eli)]);
  const logs = [d1, d2, staff, normal].map(capture);
  for (const s of [d1, d2]) assert.equal((await ack(s, 'channel:subscribe', { idCanal: channel.id })).ok, true);
  // Si aceptar llega primero ve la membresía existente; si banear llega primero, rechaza.
  const [removed, accepted] = await Promise.all([
    ban(c, dani, ana, { motivo: '  Moderación  ' }),
    request(`${preview}/accept`, { method: 'POST', as: dani }),
  ]);
  assert.equal(removed.status, 204);
  assert.ok([200, 403].includes(accepted.status));
  assert.equal((await ban(c, dani, ana, { motivo: 'No sobrescribir' })).status, 204);
  for (const s of [d1, d2]) {
    assert.equal(serverSocket(s).rooms.has(`community:${c.id}`), false);
    assert.equal(serverSocket(s).rooms.has(`channel:${channel.id}`), false);
    assert.equal(serverSocket(s).rooms.has(`community:${another.id}`), true);
    assert.equal((await ack(s, 'channel:subscribe', { idCanal: channel.id })).ok, false);
    assert.equal((await ack(s, 'channel-message:send', { idCanal: channel.id, contenido: 'Bloqueado' })).ok, false);
  }
  const fresh = await socketFor(dani);
  assert.equal(serverSocket(fresh).rooms.has(`community:${c.id}`), false);
  for (const log of logs.slice(0, 2)) assert.deepEqual(log.filter(({ event }) => event === 'community:left'), [{ event: 'community:left', data: { idComunidad: c.id } }]);
  await ready(staff);
  assert.deepEqual(logs[2].filter(({ event }) => event === 'community:bans-changed'), [{ event: 'community:bans-changed', data: { idComunidad: c.id } }]);
  assert.equal(logs[3].some(({ event }) => event === 'community:bans-changed'), false);
  assert.equal((await request(`/channels/${channel.id}/messages`, { as: dani })).status, 404);
  assert.equal((await request(preview, { as: dani })).body.error.code, 'COMMUNITY_BANNED');
  const rejected = await request(`${preview}/accept`, { method: 'POST', as: dani });
  assert.equal(rejected.body.error.code, 'COMMUNITY_BANNED');
  assert.doesNotMatch(JSON.stringify(rejected.body), /Moderación/);
  assert.equal((await prisma.invitacion.findUniqueOrThrow({ where: { id: inv.id } })).usos, 0);
  assert.equal(await prisma.mensaje.count({ where: { id: message.id } }), 1);
  assert.equal(await prisma.membresiaRol.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 0);
  assert.equal(await prisma.canalUsuario.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 0);
  assert.equal((await request(endpoint(c), { as: ana })).body.items[0].motivo, 'Moderación');
  assert.equal((await unban(c, dani)).status, 204);
  assert.equal((await unban(c, dani)).status, 204);
  assert.equal((await request(`/communities/${c.id}`, { as: dani })).status, 404);
  const rejoined = await request(`${preview}/accept`, { method: 'POST', as: dani });
  assert.equal(rejoined.status, 201);
  assert.equal(rejoined.body.comunidad.miRol, 'INTEGRANTE');
  assert.equal(await prisma.membresiaRol.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 0);
});
