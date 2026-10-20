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
const schema = `test_t22_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, ana, beto, cata, dani, eli;
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
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('todas las rutas requieren sesión y el header de desarrollo no suplanta usuarios en producción', async () => {
  for (const [method, path, body] of [
    ['GET', '/communities/1/channels'], ['POST', '/communities/1/channels', { nombre: 'general', tipo: 'TEXTO' }],
    ['GET', '/channels/1'], ['PATCH', '/channels/1', { nombre: 'nuevo' }], ['DELETE', '/channels/1'],
    ['PUT', '/communities/1/channels/order', { orden: [] }],
  ]) {
    const result = await request(path, { method, body, headers: { 'x-dev-user-id': String(ana.id) } });
    assert.equal(result.status, 401, `${method} ${path}`);
  }
});

test('propietario y administrador crean los tres tipos al final con datos públicos y permisos efectivos', async () => {
  const c = await community();
  for (const [index, tipo] of ['TEXTO', 'VOZ', 'VIDEO'].entries()) {
    const channel = await create(c, { nombre: tipo.toLowerCase(), tipo }, index % 2 ? beto : ana);
    assert.equal(channel.idComunidad, c.id); assert.equal(channel.posicion, index + 1); assert.equal(channel.privado, false);
    assert.deepEqual(channel.misPermisos, tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR', 'TRANSMITIR']);
    assert.deepEqual(Object.keys(channel).sort(), ['fechaCreacion', 'id', 'idComunidad', 'misPermisos', 'nombre', 'posicion', 'privado', 'tipo']);
  }
  assert.equal((await list(c)).length, 4);
});

test('moderador e integrante no administran; un tercero no descubre canales ajenos', async () => {
  const c = await community(); const channel = await create(c);
  for (const as of [cata, dani]) {
    assert.equal((await request(`/communities/${c.id}/channels`, { method: 'POST', as, body: { nombre: 'otro', tipo: 'TEXTO' } })).status, 403);
    assert.equal((await request(`/channels/${channel.id}`, { method: 'PATCH', as, body: { nombre: 'nuevo' } })).status, 403);
    assert.equal((await request(`/channels/${channel.id}`, { method: 'DELETE', as })).status, 403);
    assert.equal((await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as, body: { orden: [] } })).status, 403);
  }
  for (const method of ['GET', 'PATCH', 'DELETE']) assert.equal((await request(`/channels/${channel.id}`, { method, as: eli, ...(method === 'PATCH' ? { body: { nombre: 'nuevo' } } : {}) })).status, 404);
  assert.equal((await request(`/communities/${c.id}/channels`, { as: eli })).status, 404);
  const publicCommunity = await community('PUBLICA');
  assert.equal((await request(`/communities/${publicCommunity.id}/channels`, { as: eli })).status, 403);
});

test('valida nombre, tipo, booleano e IDs y rechaza campos protegidos', async () => {
  const c = await community(); const channel = await create(c);
  for (const datos of [
    { nombre: '' }, { nombre: ' x' }, { nombre: 'x ' }, { nombre: ' '.repeat(2) }, { nombre: 'x'.repeat(33) },
    { tipo: 'AUDIO' }, { privado: 'true' }, { posicion: 999 }, { idComunidad: 999 }, { id: 9 }, { habilitacionesRol: [] },
  ]) {
    const result = await request(`/communities/${c.id}/channels`, { method: 'POST', as: ana, body: { nombre: 'valido', tipo: 'TEXTO', ...datos } });
    assert.equal(result.status, 400, JSON.stringify(datos));
  }
  for (const body of [{}, { posicion: 3 }, { nombre: null }, { tipo: 'texto' }, { privado: 1 }]) {
    assert.equal((await request(`/channels/${channel.id}`, { method: 'PATCH', as: ana, body })).status, 400);
  }
  for (const id of ['0', '-1', '1.5', 'abc', '2147483648']) assert.equal((await request(`/channels/${id}`, { as: ana })).status, 400);
  assert.equal((await request('/channels/2147483647', { as: ana })).status, 404);
});

test('el listado tiene orden estable por posición e ID y se limita a la comunidad consultada', async () => {
  const c = await community(), other = await community();
  const first = await create(c, { nombre: 'primero' }), second = await create(c, { nombre: 'segundo' });
  await prisma.canal.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { posicion: 3 } });
  const items = await list(c);
  assert.deepEqual(items.slice(1).map((i) => i.id), [first.id, second.id]);
  assert(items.every((i) => i.idComunidad === c.id));
  assert.equal((await list(other)).length, 1);
});

test('canales privados aplican roles, usuarios habilitados y el tipo sin filtrar su configuración', async () => {
  const c = await community(), channel = await create(c, { privado: true });
  assert.equal((await list(c, dani)).some((i) => i.id === channel.id), false);
  assert.equal((await request(`/channels/${channel.id}`, { as: dani })).status, 404);
  await prisma.canalRol.create({ data: { idCanal: channel.id, rol: 'MODERADOR', permisos: ['VER', 'ESCRIBIR'] } });
  await prisma.canalUsuario.create({ data: { idCanal: channel.id, idComunidad: c.id, idUsuario: dani.id, permisos: ['VER'] } });
  const moderator = await request(`/channels/${channel.id}`, { as: cata });
  const member = await request(`/channels/${channel.id}`, { as: dani });
  assert.deepEqual(moderator.body.canal.misPermisos, ['VER', 'ESCRIBIR']);
  assert.deepEqual(member.body.canal.misPermisos, ['VER']);
  assert.equal(member.body.canal.habilitacionesRol, undefined);
  const { getChannelPermissions } = await import('../src/services/channelsService.js');
  assert.deepEqual(await getChannelPermissions(channel.id, eli.id), []);
  assert.deepEqual(await getChannelPermissions(2147483647, ana.id), []);
});

test('una actualización parcial conserva los otros campos y persiste', async () => {
  const c = await community(); const channel = await create(c, { privado: true });
  const updated = await request(`/channels/${channel.id}`, { method: 'PATCH', as: beto, body: { nombre: 'renombrado' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.canal.nombre, 'renombrado'); assert.equal(updated.body.canal.privado, true); assert.equal(updated.body.canal.tipo, 'TEXTO');
  assert.equal((await request(`/channels/${channel.id}`, { as: ana })).body.canal.nombre, 'renombrado');
});

test('permite cambios de tipo sin contenido y rechaza TEXTO a VOZ/VIDEO con mensajes, incluso eliminados', async () => {
  const c = await community(); const channel = await create(c);
  for (const tipo of ['VOZ', 'VIDEO', 'TEXTO']) assert.equal((await request(`/channels/${channel.id}`, { method: 'PATCH', as: ana, body: { tipo } })).status, 200);
  await prisma.mensaje.create({ data: { idAutor: ana.id, idCanal: channel.id, contenido: 'Conservar', fechaEliminacion: new Date(), idUsuarioEliminacion: ana.id } });
  for (const tipo of ['VOZ', 'VIDEO']) {
    const result = await request(`/channels/${channel.id}`, { method: 'PATCH', as: ana, body: { tipo, nombre: 'no debe guardarse' } });
    assert.equal(result.status, 409); assert.equal(result.body.error.code, 'CHANNEL_HAS_MESSAGES');
  }
  const result = await request(`/channels/${channel.id}`, { as: ana });
  assert.equal(result.body.canal.tipo, 'TEXTO'); assert.equal(result.body.canal.nombre, 'avisos');
  assert.equal(await prisma.mensaje.count({ where: { idCanal: channel.id } }), 1);
});

test('reordenar valida el conjunto completo sin alterar otros canales y permite la lista vacía si no hay canales', async () => {
  const c = await community(), other = await community();
  await create(c); await create(c, { nombre: 'tercero' });
  const original = (await list(c)).map((i) => i.id), foreign = (await list(other))[0].id;
  for (const orden of [[], original.slice(1), [...original, foreign], [original[0], original[0], original[2]], [original[0], original[1], foreign]]) {
    const result = await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden } });
    assert.equal(result.status, 400); assert.equal(result.body.error.code, 'INVALID_ORDER');
    assert.deepEqual((await list(c)).map((i) => i.id), original);
  }
  assert.equal((await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden: [String(original[0])] } })).status, 400);
  const orden = [...original].reverse();
  assert.equal((await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden } })).status, 204);
  assert.deepEqual((await list(c)).map((i) => [i.id, i.posicion]), orden.map((id, index) => [id, index]));
  assert.equal((await list(other))[0].posicion, 0);
  await prisma.canal.deleteMany({ where: { idComunidad: c.id } });
  assert.equal((await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden: [] } })).status, 204);
});

test('creaciones simultáneas agregan posiciones distintas y reordenamientos simultáneos nunca dejan un orden mezclado', async () => {
  const c = await community();
  const created = await Promise.all(Array.from({ length: 5 }, (_, n) => create(c, { nombre: `canal-${n}` })));
  assert.equal(new Set(created.map((i) => i.posicion)).size, 5);
  const ids = (await list(c)).map((i) => i.id), reversed = [...ids].reverse(), rotated = [...ids.slice(1), ids[0]];
  const result = await Promise.all([reversed, rotated].map((orden) => request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden } })));
  assert(result.every((r) => r.status === 204));
  const items = await list(c), final = items.map((i) => i.id);
  assert(JSON.stringify(final) === JSON.stringify(reversed) || JSON.stringify(final) === JSON.stringify(rotated));
  assert.deepEqual(items.map((i) => i.posicion), ids.map((_, n) => n));
});

test('crear mientras se reordena conserva todos los canales o rechaza el orden obsoleto sin escrituras parciales', async () => {
  const c = await community(); await create(c);
  const old = (await list(c)).map((i) => i.id).reverse();
  const [created, reordered] = await Promise.all([
    create(c, { nombre: 'concurrente' }),
    request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden: old } }),
  ]);
  assert([204, 400].includes(reordered.status));
  if (reordered.status === 400) assert.equal(reordered.body.error.code, 'INVALID_ORDER');
  const items = await list(c);
  assert.equal(items.length, 3); assert(items.some((i) => i.id === created.id));
  assert.equal(new Set(items.map((i) => i.posicion)).size, 3);
});

test('los eventos llegan a las pestañas autorizadas con permisos propios y excluyen a terceros', async () => {
  const c = await community();
  const clients = await Promise.all([ana, ana, dani, eli].map(socketFor));
  const recorded = clients.map(capture);
  const channel = await create(c);
  await flush(...clients);
  for (let i = 0; i < 3; i++) {
    assert.equal(recorded[i].length, 1); assert.equal(recorded[i][0].event, 'channel:created');
    assert.equal(recorded[i][0].data.canal.id, channel.id);
  }
  assert.deepEqual(recorded[2][0].data.canal.misPermisos, ['VER', 'ESCRIBIR']);
  assert.deepEqual(recorded[3], []);
  recorded.forEach((r) => r.splice(0));
  await create(c, { privado: true }); await flush(...clients);
  assert.equal(recorded[0].length, 1); assert.equal(recorded[1].length, 1);
  assert.deepEqual(recorded[2], []); assert.deepEqual(recorded[3], []);
});

test('volver privado retira todas las pestañas sin acceso de la room y abrirlo notifica el acceso recuperado', async () => {
  const c = await community(); const channel = await create(c);
  const clients = await Promise.all([ana, dani, dani].map(socketFor)), recorded = clients.map(capture);
  for (const socket of clients) await io.sockets.sockets.get(socket.id).join(`channel:${channel.id}`);
  assert.equal((await request(`/channels/${channel.id}`, { method: 'PATCH', as: ana, body: { privado: true } })).status, 200);
  await flush(...clients);
  for (let n = 1; n < 3; n++) {
    assert.equal(io.sockets.sockets.get(clients[n].id).rooms.has(`channel:${channel.id}`), false);
    assert.deepEqual(recorded[n], [{ event: 'channel:access-lost', data: { idCanal: channel.id, idComunidad: c.id } }]);
  }
  assert.equal(io.sockets.sockets.get(clients[0].id).rooms.has(`channel:${channel.id}`), true);
  recorded.forEach((r) => r.splice(0));
  await request(`/channels/${channel.id}`, { method: 'PATCH', as: ana, body: { privado: false } }); await flush(...clients);
  for (const r of recorded) assert.equal(r[0].event, 'channel:updated');
});

test('reordenar y eliminar no difunden IDs privados a usuarios sin acceso', async () => {
  const c = await community(); const hidden = await create(c, { privado: true }), visible = await create(c);
  const owner = await socketFor(ana), member = await socketFor(dani), ownerEvents = capture(owner), memberEvents = capture(member);
  const orden = (await list(c)).map((i) => i.id).reverse();
  await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden } });
  await flush(owner, member);
  assert.deepEqual(ownerEvents[0].data.orden, orden);
  assert.equal(memberEvents[0].data.orden.includes(hidden.id), false);
  assert(memberEvents[0].data.orden.includes(visible.id));
  ownerEvents.splice(0); memberEvents.splice(0);
  await request(`/channels/${hidden.id}`, { method: 'DELETE', as: ana }); await flush(owner, member);
  assert.equal(ownerEvents[0].event, 'channel:deleted'); assert.deepEqual(memberEvents, []);
});

test('eliminar borra mensajes/habilitaciones, vacía la room y no afecta otras comunidades ni chats privados', async () => {
  const c = await community(), other = await community(); const channel = await create(c);
  await prisma.canalRol.create({ data: { idCanal: channel.id, rol: 'INTEGRANTE', permisos: ['VER'] } });
  await prisma.canalUsuario.create({ data: { idCanal: channel.id, idComunidad: c.id, idUsuario: dani.id, permisos: ['VER'] } });
  await prisma.mensaje.create({ data: { idCanal: channel.id, idAutor: ana.id, contenido: 'canal' } });
  const chat = await prisma.conversacionPrivada.create({ data: { idUsuarioA: Math.min(ana.id, beto.id), idUsuarioB: Math.max(ana.id, beto.id) } });
  const privateMessage = await prisma.mensaje.create({ data: { idConversacion: chat.id, idAutor: ana.id, contenido: 'privado' } });
  const client = await socketFor(dani); await io.sockets.sockets.get(client.id).join(`channel:${channel.id}`);
  const result = await request(`/channels/${channel.id}`, { method: 'DELETE', as: beto });
  assert.equal(result.status, 204);
  assert.equal(await prisma.mensaje.count({ where: { idCanal: channel.id } }), 0);
  assert.equal(await prisma.canalRol.count({ where: { idCanal: channel.id } }), 0);
  assert.equal(await prisma.canalUsuario.count({ where: { idCanal: channel.id } }), 0);
  assert.equal(io.sockets.sockets.get(client.id).rooms.has(`channel:${channel.id}`), false);
  assert.equal((await request(`/channels/${channel.id}`, { as: ana })).status, 404);
  assert.equal((await list(other)).length, 1);
  assert.ok(await prisma.mensaje.findUnique({ where: { id: privateMessage.id } }));
});

test('una operación rechazada no emite cambios', async () => {
  const c = await community(); const channel = await create(c);
  const client = await socketFor(ana), recorded = capture(client);
  await request(`/channels/${channel.id}`, { method: 'PATCH', as: dani, body: { nombre: 'no autorizado' } });
  await request(`/communities/${c.id}/channels/order`, { method: 'PUT', as: ana, body: { orden: [channel.id] } });
  await flush(client); assert.deepEqual(recorded, []);
});

test('abandonar una comunidad impide seguir consultando sus canales', async () => {
  const c = await community(); const channel = await create(c);
  assert.equal((await request(`/channels/${channel.id}`, { as: dani })).status, 200);
  assert.equal((await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani })).status, 204);
  assert.equal((await request(`/channels/${channel.id}`, { as: dani })).status, 404);
  assert.equal((await request(`/communities/${c.id}/channels`, { as: dani })).status, 404);
});
