import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import { hashToken } from '../src/utils/tokens.js';

// Nunca se toma DATABASE_URL del .env: las pruebas requieren una conexión explícita
// y crean/eliminan únicamente un schema nuevo, exclusivo de esta ejecución.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL de pruebas antes de ejecutar este archivo');
}
const schema = `test_t11_${randomUUID().replaceAll('-', '')}`;
const isolatedUrl = new URL(databaseUrl);
isolatedUrl.searchParams.set('schema', schema);
isolatedUrl.searchParams.set('connection_limit', '1');
process.env.DATABASE_URL = isolatedUrl.href;
process.env.DIRECT_URL = isolatedUrl.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma;
let server;
let io;
let baseUrl;
let ana;
let beto;
let cata;
let dani;
const sockets = [];

async function request(path, { method = 'GET', body, as, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(as ? { Cookie: as.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}

async function register(nombreUsuario) {
  const response = await request('/auth/register', {
    method: 'POST',
    body: {
      nombreUsuario,
      correo: `${nombreUsuario}@example.test`,
      contrasena: 'ClaveDePrueba123',
      nombreVisible: nombreUsuario,
    },
  });
  assert.equal(response.status, 201);
  return { ...response.body.usuario, cookie: response.cookie };
}

async function friendship(a, b) {
  return prisma.amistad.create({
    data: { idUsuarioA: Math.min(a.id, b.id), idUsuarioB: Math.max(a.id, b.id) },
  });
}

async function conversation(a = ana, b = beto, fechaCreacion) {
  return prisma.conversacionPrivada.create({
    data: {
      idUsuarioA: Math.min(a.id, b.id),
      idUsuarioB: Math.max(a.id, b.id),
      ...(fechaCreacion ? { fechaCreacion } : {}),
    },
  });
}

async function message(chat, contenido, fechaCreacion, extra = {}) {
  return prisma.mensaje.create({
    data: { idConversacion: chat.id, idAutor: ana.id, contenido, fechaCreacion, ...extra },
  });
}

async function socketFor(user) {
  const socket = connectSocket(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { Cookie: user.cookie },
    reconnection: false,
    forceNew: true,
    timeout: 3000,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  // Ejecutamos el SQL inicial real, incluidas restricciones e índices que Prisma
  // db push no representa. Esta migración contiene sentencias simples sin
  // procedimientos ni bloques SQL con separadores internos.
  const initialSql = await readFile(new URL('../prisma/migrations/20261005170305_init/migration.sql', import.meta.url), 'utf8');
  await admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    for (const statement of initialSql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await tx.$executeRawUnsafe(statement);
    }
  }, { timeout: 30000 });

  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app);
  io = new Server(server);
  initSockets(io);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana');
  beto = await register('beto');
  cata = await register('cata');
  dani = await register('dani');
});

beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.sesion.updateMany({ data: { fechaRevocacion: null, fechaExpiracion: new Date(Date.now() + 3600000) } });
  await prisma.mensaje.deleteMany();
  await prisma.conversacionPrivada.deleteMany();
  await prisma.amistad.deleteMany();
  await friendship(ana, beto);
});

after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});


function ack(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(3000).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function readySocket(user) {
  const socket = await socketFor(user);
  const response = await ack(socket, 'message:send', {});
  assert.equal(response.error.code, 'VALIDATION_ERROR');
  return socket;
}

async function flush(clients) {
  await Promise.all(clients.filter((s) => s.connected).map((s) => {
    const done = once(s, 'test:sync');
    io.to(s.id).emit('test:sync');
    return done;
  }));
}

function capture(socket) {
  const events = [];
  for (const event of ['message:new', 'message:updated', 'message:deleted']) {
    socket.on(event, (data) => events.push({ event, data }));
  }
  return events;
}

async function setSession(user, data) {
  const token = decodeURIComponent(user.cookie.split('=').slice(1).join('='));
  await prisma.sesion.update({ where: { hashToken: hashToken(token) }, data });
}

async function rejectedConnection(options) {
  const socket = connectSocket(baseUrl, {
    transports: ['websocket'], reconnection: false, forceNew: true, timeout: 3000, ...options,
  });
  sockets.push(socket);
  const error = await new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('La conexión debía rechazarse')));
    socket.once('connect_error', resolve);
  });
  assert.equal(error.data.code, 'UNAUTHORIZED');
  assert.equal(socket.connected, false);
  assert.equal(io.sockets.sockets.size, 0);
}

test('rechaza handshake sin cookie, token falso, cookie malformada y suplantación de desarrollo en producción', async () => {
  for (const options of [
    {}, { extraHeaders: { Cookie: 'dialo_sid=falso' } },
    { extraHeaders: { Cookie: 'dialo_sid=%ZZ' } }, { auth: { devUserId: ana.id } },
  ]) await rejectedConnection(options);
});

test('rechaza handshake de sesiones revocadas o vencidas', async () => {
  await setSession(ana, { fechaRevocacion: new Date() });
  await rejectedConnection({ extraHeaders: { Cookie: ana.cookie } });
  await setSession(beto, { fechaExpiracion: new Date(Date.now() - 1000) });
  await rejectedConnection({ extraHeaders: { Cookie: beto.cookie } });
});

test('une a rooms personales y conversaciones propias, incluida una amistad eliminada', async () => {
  const own = await conversation();
  const foreign = await conversation(cata, dani);
  await prisma.amistad.deleteMany();
  const socket = await readySocket(ana);
  const rooms = io.sockets.sockets.get(socket.id).rooms;
  assert.ok(rooms.has(`user:${ana.id}`));
  assert.ok(rooms.has(`conversation:${own.id}`));
  assert.equal(rooms.has(`user:${beto.id}`), false);
  assert.equal(rooms.has(`conversation:${foreign.id}`), false);
});

test('el primer evento al conectar espera las rooms y persiste antes del ack', async () => {
  const chat = await conversation();
  const socket = await socketFor(ana);
  const events = capture(socket);
  const response = await ack(socket, 'message:send', { idConversacion: chat.id, contenido: 'Hola' });
  assert.equal(response.ok, true);
  const stored = await prisma.mensaje.findUnique({ where: { id: response.data.mensaje.id } });
  assert.equal(stored.contenido, 'Hola');
  assert.equal(stored.idAutor, ana.id);
  await flush([socket]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].data.mensaje, response.data.mensaje);
});

test('nueva conversación une varias pestañas y emite mensajes solo a sus participantes', async () => {
  const clients = await Promise.all([readySocket(ana), readySocket(ana), readySocket(beto), readySocket(cata)]);
  const recorded = clients.map(capture);
  const created = await request('/conversations', { method: 'POST', as: ana, body: { idUsuario: beto.id } });
  assert.equal(created.status, 201);
  const chat = created.body.conversacion;
  const response = await ack(clients[0], 'message:send', {
    idConversacion: chat.id, contenido: '  Hola desde otra pestaña  ', idAutor: cata.id,
  });
  assert.equal(response.ok, true);
  assert.equal(response.data.mensaje.idAutor, ana.id);
  assert.equal(response.data.mensaje.contenido, 'Hola desde otra pestaña');
  assert.equal(response.data.mensaje.eliminado, false);
  assert.equal(response.data.mensaje.fechaEdicion, null);
  assert.ok(response.data.mensaje.fechaCreacion);
  await flush(clients);
  for (const events of recorded.slice(0, 3)) {
    assert.deepEqual(events, [{ event: 'message:new', data: response.data }]);
  }
  assert.deepEqual(recorded[3], []);
  const history = await request(`/conversations/${chat.id}/messages`, { as: beto });
  assert.deepEqual(history.body.items, [response.data.mensaje]);
});

test('un tercero no puede enviar y una conversación inexistente devuelve el error del contrato', async () => {
  const chat = await conversation();
  const socket = await readySocket(cata);
  const events = capture(socket);
  for (const [idConversacion, code] of [[chat.id, 'NOT_PARTICIPANT'], [2147483647, 'CONVERSATION_NOT_FOUND']]) {
    const response = await ack(socket, 'message:send', { idConversacion, contenido: 'No autorizado' });
    assert.equal(response.ok, false);
    assert.equal(response.error.code, code);
  }
  assert.equal(await prisma.mensaje.count(), 0);
  await flush([socket]);
  assert.deepEqual(events, []);
});

test('perder amistad bloquea envío desde sockets ya conectados sin borrar el historial', async () => {
  const chat = await conversation();
  const socket = await readySocket(ana);
  const sent = await ack(socket, 'message:send', { idConversacion: chat.id, contenido: 'Antes' });
  assert.equal(sent.ok, true);
  await request(`/friends/${beto.id}`, { method: 'DELETE', as: ana });
  const response = await ack(socket, 'message:send', { idConversacion: chat.id, contenido: 'Después' });
  assert.equal(response.error.code, 'NOT_FRIENDS');
  assert.equal(await prisma.mensaje.count(), 1);
  const history = await request(`/conversations/${chat.id}/messages`, { as: ana });
  assert.equal(history.body.items[0].contenido, 'Antes');
});

test('valida payloads, IDs enteros y contenido en send/edit/delete sin persistir ni emitir', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  const socket = await readySocket(ana);
  const events = capture(socket);
  const invalidContent = ['', '   ', '\n\t', 'a'.repeat(2001), null, 42];
  const cases = [
    ['message:send', undefined], ['message:edit', null], ['message:delete', []],
    ...invalidContent.map((contenido) => ['message:send', { idConversacion: chat.id, contenido }]),
    ...invalidContent.map((contenido) => ['message:edit', { idMensaje: original.id, contenido }]),
    ...['2', 0, -1, 1.5, 2147483648].flatMap((id) => [
      ['message:send', { idConversacion: id, contenido: 'Hola' }],
      ['message:edit', { idMensaje: id, contenido: 'Hola' }],
      ['message:delete', { idMensaje: id }],
    ]),
  ];
  for (const [event, payload] of cases) {
    const response = await ack(socket, event, payload);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(response.error.details));
  }
  const stored = await prisma.mensaje.findUnique({ where: { id: original.id } });
  assert.equal(stored.contenido, 'Original');
  assert.equal(stored.fechaEdicion, null);
  assert.equal(stored.fechaEliminacion, null);
  assert.equal(await prisma.mensaje.count(), 1);
  await flush([socket]);
  assert.deepEqual(events, []);
});

test('admite exactamente 2000 caracteres al enviar y editar', async () => {
  const chat = await conversation();
  const socket = await readySocket(ana);
  const sent = await ack(socket, 'message:send', { idConversacion: chat.id, contenido: 'a'.repeat(2000) });
  assert.equal(sent.ok, true);
  const edited = await ack(socket, 'message:edit', { idMensaje: sent.data.mensaje.id, contenido: 'b'.repeat(2000) });
  assert.equal(edited.ok, true);
  assert.equal(edited.data.mensaje.contenido.length, 2000);
});

test('solo el autor edita, registra fecha y notifica a todas las pestañas de ambos participantes', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  const clients = await Promise.all([readySocket(ana), readySocket(ana), readySocket(beto), readySocket(cata)]);
  const recorded = clients.map(capture);
  for (const client of clients.slice(2)) {
    const response = await ack(client, 'message:edit', { idMensaje: original.id, contenido: 'Suplantado', idAutor: ana.id });
    assert.equal(response.error.code, 'NOT_AUTHOR');
  }
  const response = await ack(clients[0], 'message:edit', { idMensaje: original.id, contenido: 'Corregido', idAutor: beto.id });
  assert.equal(response.ok, true);
  assert.equal(response.data.mensaje.idAutor, ana.id);
  assert.equal(response.data.mensaje.contenido, 'Corregido');
  assert.ok(response.data.mensaje.fechaEdicion);
  const stored = await prisma.mensaje.findUnique({ where: { id: original.id } });
  assert.equal(stored.contenido, 'Corregido');
  assert.ok(stored.fechaEdicion instanceof Date);
  await flush(clients);
  for (const events of recorded.slice(0, 3)) assert.deepEqual(events, [{ event: 'message:updated', data: response.data }]);
  assert.deepEqual(recorded[3], []);
});

test('eliminación lógica por el autor, auditoría y evento sin contenido a ambas partes', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Contenido secreto', new Date());
  const clients = await Promise.all([readySocket(ana), readySocket(ana), readySocket(beto), readySocket(cata)]);
  const recorded = clients.map(capture);
  for (const client of clients.slice(2)) {
    const response = await ack(client, 'message:delete', { idMensaje: original.id, idUsuarioEliminacion: ana.id });
    assert.equal(response.error.code, 'NOT_AUTHOR');
  }
  const response = await ack(clients[0], 'message:delete', { idMensaje: original.id, idUsuarioEliminacion: beto.id });
  assert.deepEqual(response, { ok: true, data: { idMensaje: original.id } });
  const stored = await prisma.mensaje.findUnique({ where: { id: original.id } });
  assert.ok(stored.fechaEliminacion instanceof Date);
  assert.equal(stored.idUsuarioEliminacion, ana.id);
  assert.equal(await prisma.mensaje.count(), 1);
  await flush(clients);
  for (const events of recorded.slice(0, 3)) assert.deepEqual(events, [{
    event: 'message:deleted', data: { idMensaje: original.id, idConversacion: chat.id },
  }]);
  assert.deepEqual(recorded[3], []);
  for (const path of [`/conversations/${chat.id}/messages`, `/conversations/${chat.id}`, '/conversations']) {
    const history = await request(path, { as: beto });
    assert.equal(JSON.stringify(history.body).includes('Contenido secreto'), false);
    const deleted = path.endsWith('/messages') ? history.body.items[0]
      : path === '/conversations' ? history.body.items[0].ultimoMensaje : history.body.conversacion.ultimoMensaje;
    assert.equal(deleted.contenido, null);
    assert.equal(deleted.eliminado, true);
  }
});

test('rechaza mensajes inexistentes, de canales y ya eliminados sin eventos', async () => {
  const chat = await conversation();
  const deleted = await message(chat, 'Eliminado', new Date(), { fechaEliminacion: new Date(), idUsuarioEliminacion: ana.id });
  const channel = await prisma.mensaje.create({ data: { idAutor: ana.id, idCanal: 10, contenido: 'Canal' } });
  const socket = await readySocket(ana);
  const events = capture(socket);
  for (const [idMensaje, code] of [[2147483647, 'MESSAGE_NOT_FOUND'], [channel.id, 'MESSAGE_NOT_FOUND'], [deleted.id, 'MESSAGE_DELETED']]) {
    for (const event of ['message:edit', 'message:delete']) {
      const response = await ack(socket, event, { idMensaje, contenido: 'Nuevo' });
      assert.equal(response.error.code, code);
    }
  }
  await flush([socket]);
  assert.deepEqual(events, []);
});

test('el autor puede corregir o eliminar mensajes anteriores después de perder amistad', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  const socket = await readySocket(ana);
  await prisma.amistad.deleteMany();
  const edited = await ack(socket, 'message:edit', { idMensaje: original.id, contenido: 'Corregido' });
  assert.equal(edited.ok, true);
  const deleted = await ack(socket, 'message:delete', { idMensaje: original.id });
  assert.equal(deleted.ok, true);
});

test('logout revoca la sesión conectada: cada operación devuelve UNAUTHORIZED y desconecta', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  for (const [event, payload] of [
    ['message:send', { idConversacion: chat.id, contenido: 'No' }],
    ['message:edit', { idMensaje: original.id, contenido: 'No' }],
    ['message:delete', { idMensaje: original.id }],
  ]) {
    await setSession(ana, { fechaRevocacion: null });
    const socket = await readySocket(ana);
    const disconnected = once(socket, 'disconnect');
    await request('/auth/logout', { method: 'POST', as: ana });
    const response = await ack(socket, event, payload);
    assert.equal(response.error.code, 'UNAUTHORIZED');
    await disconnected;
    assert.equal(socket.connected, false);
  }
  const stored = await prisma.mensaje.findUnique({ where: { id: original.id } });
  assert.equal(stored.contenido, 'Original');
  assert.equal(stored.fechaEdicion, null);
  assert.equal(stored.fechaEliminacion, null);
  assert.equal(await prisma.mensaje.count(), 1);
});

test('vencimiento posterior al handshake impide send/edit/delete y quita las rooms', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  for (const [event, payload] of [
    ['message:send', { idConversacion: chat.id, contenido: 'No' }],
    ['message:edit', { idMensaje: original.id, contenido: 'No' }],
    ['message:delete', { idMensaje: original.id }],
  ]) {
    await setSession(ana, { fechaExpiracion: new Date(Date.now() + 3600000) });
    const socket = await readySocket(ana);
    const disconnected = once(socket, 'disconnect');
    await setSession(ana, { fechaExpiracion: new Date(Date.now() - 1000) });
    const response = await ack(socket, event, payload);
    assert.equal(response.error.code, 'UNAUTHORIZED');
    await disconnected;
    assert.equal(io.sockets.sockets.has(socket.id), false);
  }
  assert.equal(await prisma.mensaje.count(), 1);
  assert.equal((await prisma.mensaje.findUnique({ where: { id: original.id } })).fechaEliminacion, null);
});

test('eliminar simultáneamente desde dos pestañas produce un único evento', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  const clients = await Promise.all([readySocket(ana), readySocket(ana), readySocket(beto)]);
  const events = capture(clients[2]);
  const responses = await Promise.all(clients.slice(0, 2).map((s) => ack(s, 'message:delete', { idMensaje: original.id })));
  assert.deepEqual(responses.map((r) => r.ok).sort(), [false, true]);
  assert.equal(responses.find((r) => !r.ok).error.code, 'MESSAGE_DELETED');
  await flush(clients);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'message:deleted');
});

test('edición y eliminación concurrentes no resucitan contenido ni emiten una edición posterior', async () => {
  const chat = await conversation();
  const original = await message(chat, 'Original', new Date());
  const clients = await Promise.all([readySocket(ana), readySocket(ana), readySocket(beto)]);
  const events = capture(clients[2]);
  const responses = await Promise.all([
    ack(clients[0], 'message:edit', { idMensaje: original.id, contenido: 'Corregido' }),
    ack(clients[1], 'message:delete', { idMensaje: original.id }),
  ]);
  assert.equal(responses[1].ok, true);
  if (!responses[0].ok) assert.equal(responses[0].error.code, 'MESSAGE_DELETED');
  await flush(clients);
  assert.equal(events.at(-1).event, 'message:deleted');
  const history = await request(`/conversations/${chat.id}/messages`, { as: beto });
  assert.equal(history.body.items[0].contenido, null);
  assert.equal(history.body.items[0].eliminado, true);
});

test('reconexión recupera rooms e historial persistido por HTTP', async () => {
  const chat = await conversation();
  const first = await readySocket(ana);
  const sent = await ack(first, 'message:send', { idConversacion: chat.id, contenido: 'Persistido' });
  first.disconnect();
  const reconnected = await readySocket(ana);
  assert.ok(io.sockets.sockets.get(reconnected.id).rooms.has(`conversation:${chat.id}`));
  const history = await request(`/conversations/${chat.id}/messages`, { as: ana });
  assert.equal(history.body.items[0].id, sent.data.mensaje.id);
  assert.equal(history.body.items[0].contenido, 'Persistido');
});

test('un evento sin callback no interrumpe el servidor ni evita la persistencia', async () => {
  const chat = await conversation();
  const socket = await readySocket(ana);
  const arrival = once(socket, 'message:new');
  socket.emit('message:send', { idConversacion: chat.id, contenido: 'Sin ack' });
  const [event] = await arrival;
  assert.equal(event.mensaje.contenido, 'Sin ack');
  assert.equal(await prisma.mensaje.count(), 1);
  const response = await ack(socket, 'message:edit', { idMensaje: event.mensaje.id, contenido: 'Sigue funcionando' });
  assert.equal(response.ok, true);
});

test('el comando de verificación manual completa su recorrido contra la API real', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./messages.smoke.js', import.meta.url))], {
    env: { ...process.env, DIALO_TEST_API_URL: baseUrl }, timeout: 20000,
  });
  assert.ok(stdout.includes('T-11 OK'));
});
