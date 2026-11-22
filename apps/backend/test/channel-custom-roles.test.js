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
const events = ['channel:updated', 'channel:access-lost', 'community:member-updated'];

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
const cambiar = (c, user, body, as = ana) => request(`/communities/${c.id}/members/${user.id}`, { method: 'PATCH', as, body });
async function setRoles(c, user, idsRoles) {
  const result = await cambiar(c, user, { idsRoles });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.integrante;
}

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
  await drainEffects();
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('el rol base y la autoridad de propietario no cambian con roles personalizados', async () => {
  const { canal } = await escenario();
  assert.deepEqual((await request(`/channels/${canal.id}`, { as: ana })).body.canal.misPermisos, ['VER', 'ESCRIBIR', 'ELIMINAR_MENSAJES', 'GESTIONAR_CANALES', 'EXPULSAR', 'BANEAR']);
  assert.equal((await request(`/channels/${canal.id}`, { as: dani })).status, 404);
});


test('T-30: actualiza el catálogo de roles del integrante y repetir la solicitud no duplica eventos', async () => {
  const { c, lectores, editores } = await escenario();
  const tabs = [await socketFor(dani), await socketFor(dani)], logs = tabs.map(capture);
  const other = await socketFor(eli), otherLog = capture(other);
  const ids = [lectores.id, editores.id];
  const results = await Promise.all([setRoles(c, dani, ids), setRoles(c, dani, [...ids].reverse())]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0].rolesPersonalizados.map((r) => r.id), ids);
  const items = (await request(`/communities/${c.id}/members`, { as: dani })).body.items;
  assert.deepEqual(items.find((m) => m.usuario.id === dani.id), results[0]);
  await flush(...tabs, other);
  for (const log of logs) {
    const changes = log.filter((event) => event.event === 'community:member-updated');
    assert.deepEqual(changes.map(({ data }) => data), [{ idComunidad: c.id, integrante: results[0] }]);
  }
  assert.deepEqual(otherLog, []);
});

test('T-30: protege jerarquía, destino y atomicidad de roles base y personalizados', async () => {
  const { c, lectores } = await escenario();
  const foreign = await escenario();
  assert.equal((await cambiar(c, dani, { rol: 'ADMIN', idsRoles: [foreign.lectores.id] })).status, 404);
  assert.equal((await cambiar(c, dani, { idsRoles: [lectores.id, lectores.id] })).status, 400);
  assert.equal((await cambiar(c, dani, {})).status, 400);
  assert.equal((await cambiar(c, dani, { rol: 'PROPIETARIO' })).status, 400);
  assert.equal((await cambiar(c, ana, { idsRoles: [lectores.id] })).status, 403);
  assert.equal((await cambiar(c, eli, { idsRoles: [] })).status, 404);
  assert.equal((await cambiar(c, dani, { rol: 'ADMIN' }, dani)).status, 403);
  assert.equal((await cambiar(c, dani, { idsRoles: [] }, eli)).status, 404);
  const before = await prisma.membresia.findUnique({ where: { idComunidad_idUsuario: { idComunidad: c.id, idUsuario: dani.id } } });
  assert.equal(before.rol, 'INTEGRANTE');
  assert.equal((await cambiar(c, dani, { rol: 'ADMIN' })).status, 200);
  await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: eli.id } });
  assert.equal((await cambiar(c, eli, { rol: 'ADMIN' }, dani)).status, 200);
  await cambiar(c,eli,{rol:'INTEGRANTE'});
  assert.equal((await cambiar(c, eli, { rol: 'INTEGRANTE', idsRoles: [lectores.id] }, dani)).body.integrante.rol, 'INTEGRANTE');
  assert.equal((await cambiar(c, eli, { rol: 'INTEGRANTE' }, dani)).body.integrante.rolesPersonalizados[0].id, lectores.id);
  await cambiar(c, eli, { rol: 'ADMIN' });
  assert.equal((await cambiar(c, eli, { idsRoles: [] }, dani)).status, 403);
});

test('T-30: abandonar en paralelo no deja asignaciones huérfanas ni recrea membresías', async () => {
  const { c, lectores } = await escenario();
  const [change, leave] = await Promise.all([
    cambiar(c, dani, { idsRoles: [lectores.id] }),
    request(`/communities/${c.id}/leave`, { method: 'POST', as: dani }),
  ]);
  assert.ok([200, 404].includes(change.status));
  assert.equal(leave.status, 204);
  assert.equal(await prisma.membresiaRol.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 0);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 0);
});
