import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';

// Nunca se toma DATABASE_URL del .env: las pruebas requieren una conexión explícita
// y crean/eliminan únicamente un schema nuevo, exclusivo de esta ejecución.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL de pruebas antes de ejecutar este archivo');
}
const schema = `test_t10_${randomUUID().replaceAll('-', '')}`;
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

test('las cuatro rutas exigen una sesión real y no aceptan identidad de desarrollo en producción', async () => {
  for (const [method, path, body] of [
    ['GET', '/conversations'],
    ['POST', '/conversations', { idUsuario: beto.id }],
    ['GET', '/conversations/1'],
    ['GET', '/conversations/1/messages'],
  ]) {
    const response = await request(path, { method, body, headers: { 'x-dev-user-id': String(ana.id) } });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  }
});

test('crea una conversación entre amigos con el par ordenado y devuelve solo datos públicos', async () => {
  const response = await request('/conversations', { method: 'POST', as: beto, body: { idUsuario: ana.id } });
  assert.equal(response.status, 201);
  const chat = response.body.conversacion;
  assert.equal(chat.otroUsuario.id, ana.id);
  assert.equal(chat.puedeEscribir, true);
  assert.equal(chat.ultimoMensaje, null);
  assert.equal(chat.otroUsuario.correo, undefined);
  assert.equal(chat.otroUsuario.hashContrasena, undefined);
  const stored = await prisma.conversacionPrivada.findUnique({ where: { id: chat.id } });
  assert.equal(stored.idUsuarioA, ana.id);
  assert.equal(stored.idUsuarioB, beto.id);
});

test('reutiliza la misma conversación desde ambos participantes con respuesta 200', async () => {
  const first = await request('/conversations', { method: 'POST', as: ana, body: { idUsuario: beto.id } });
  const second = await request('/conversations', { method: 'POST', as: beto, body: { idUsuario: ana.id } });
  assert.equal(second.status, 200);
  assert.equal(second.body.conversacion.id, first.body.conversacion.id);
  assert.equal(second.body.conversacion.otroUsuario.id, ana.id);
  assert.equal(await prisma.conversacionPrivada.count(), 1);
});

test('rechaza conversación propia, sin amistad y con destinatario inexistente', async () => {
  for (const [idUsuario, status, code] of [
    [ana.id, 400, 'SELF_CONVERSATION'],
    [cata.id, 403, 'NOT_FRIENDS'],
    [2147483647, 403, 'NOT_FRIENDS'],
  ]) {
    const response = await request('/conversations', { method: 'POST', as: ana, body: { idUsuario } });
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, code);
  }
  assert.equal(await prisma.conversacionPrivada.count(), 0);
});

test('valida IDs del body sin coerción y rechaza valores fuera del rango de PostgreSQL', async () => {
  for (const body of [{}, { idUsuario: '2' }, { idUsuario: 0 }, { idUsuario: -1 }, { idUsuario: 1.5 }, { idUsuario: 2147483648 }]) {
    const response = await request('/conversations', { method: 'POST', as: ana, body });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('valida IDs de rutas y parámetros de paginación', async () => {
  const chat = await conversation();
  for (const path of [
    '/conversations/no-es-id', '/conversations/0', '/conversations/2147483648',
    `/conversations/${chat.id}/messages?limit=0`,
    `/conversations/${chat.id}/messages?limit=51`,
    `/conversations/${chat.id}/messages?limit=1.5`,
    `/conversations/${chat.id}/messages?cursor=abc`,
    `/conversations/${chat.id}/messages?cursor=0`,
  ]) {
    const response = await request(path, { as: ana });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
});

test('resuelve dos creaciones simultáneas sin duplicar el par', async () => {
  // Barrera de lecturas: fuerza a ambas peticiones a ver el par todavía vacío.
  // Las escrituras siguen siendo reales y dependen de la restricción única SQL.
  const delegate = prisma.conversacionPrivada;
  const original = delegate.findUnique;
  let reads = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  delegate.findUnique = async (args) => {
    if (args.where.idUsuarioA_idUsuarioB && reads < 2) {
      reads += 1;
      if (reads === 2) release();
      await barrier;
      return null;
    }
    return original.call(delegate, args);
  };
  try {
    const responses = await Promise.all([
      request('/conversations', { method: 'POST', as: ana, body: { idUsuario: beto.id } }),
      request('/conversations', { method: 'POST', as: beto, body: { idUsuario: ana.id } }),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
    assert.equal(responses[0].body.conversacion.id, responses[1].body.conversacion.id);
    assert.equal(await prisma.conversacionPrivada.count(), 1);
  } finally {
    delegate.findUnique = original;
  }
});

test('une las rooms antes de emitir conversation:new personalizado, solo al crear', async () => {
  const socketA = await socketFor(ana);
  const socketA2 = await socketFor(ana);
  const socketB = await socketFor(beto);
  const socketC = await socketFor(cata);
  const counts = new Map([[socketA, 0], [socketA2, 0], [socketB, 0], [socketC, 0]]);
  for (const socket of counts.keys()) socket.on('conversation:new', () => counts.set(socket, counts.get(socket) + 1));
  const nextEvent = (socket) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Falta conversation:new')), 3000);
    socket.once('conversation:new', (payload) => { clearTimeout(timeout); resolve(payload); });
  });
  const received = Promise.all([nextEvent(socketA), nextEvent(socketA2), nextEvent(socketB)]);
  const created = await request('/conversations', { method: 'POST', as: ana, body: { idUsuario: beto.id } });
  const [eventA, eventA2, eventB] = await received;
  assert.equal(eventA.conversacion.otroUsuario.id, beto.id);
  assert.equal(eventA2.conversacion.otroUsuario.id, beto.id);
  assert.equal(eventB.conversacion.otroUsuario.id, ana.id);
  const room = `conversation:${created.body.conversacion.id}`;
  const participants = await io.in(room).fetchSockets();
  assert.deepEqual(participants.map((s) => s.id).sort(), [socketA.id, socketA2.id, socketB.id].sort());
  await request('/conversations', { method: 'POST', as: ana, body: { idUsuario: beto.id } });
  // Completa un viaje por el mismo transporte para comprobar que no hay otro evento encolado.
  for (const socket of [socketA, socketA2, socketB, socketC]) {
    const ack = new Promise((resolve) => socket.once('test:sync', resolve));
    io.to(socket.id).emit('test:sync');
    await ack;
  }
  assert.deepEqual([...counts.values()], [1, 1, 1, 0]);
  for (const socket of [socketA, socketA2, socketB, socketC]) socket.disconnect();
});

test('la lista excluye conversaciones ajenas y se ordena por último mensaje o creación', async () => {
  await friendship(ana, dani);
  const older = await conversation(ana, beto, new Date('2026-01-01T00:00:00Z'));
  const newer = await conversation(ana, dani, new Date('2026-01-02T00:00:00Z'));
  await conversation(beto, cata);
  await message(older, 'Actividad reciente', new Date('2026-01-03T00:00:00Z'));
  const response = await request('/conversations', { as: ana });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((c) => c.id), [older.id, newer.id]);
  assert.equal(response.body.items[0].ultimoMensaje.contenido, 'Actividad reciente');
  assert.equal(response.body.items[1].ultimoMensaje, null);
});

test('lista vacía y detalle personalizado para cada participante', async () => {
  assert.deepEqual((await request('/conversations', { as: cata })).body, { items: [] });
  const chat = await conversation();
  for (const [user, other] of [[ana, beto], [beto, ana]]) {
    const response = await request(`/conversations/${chat.id}`, { as: user });
    assert.equal(response.status, 200);
    assert.equal(response.body.conversacion.otroUsuario.id, other.id);
  }
});

test('un tercero no puede consultar detalle ni historial, y una conversación inexistente devuelve 404', async () => {
  const chat = await conversation();
  for (const suffix of ['', '/messages']) {
    const forbidden = await request(`/conversations/${chat.id}${suffix}`, { as: cata });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'NOT_PARTICIPANT');
    const missing = await request(`/conversations/2147483647${suffix}`, { as: ana });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'CONVERSATION_NOT_FOUND');
  }
});

test('eliminar amistad conserva historial y establece puedeEscribir:false para ambos', async () => {
  const chat = await conversation();
  const stored = await message(chat, 'Historial conservado', new Date());
  const removed = await request(`/friends/${beto.id}`, { method: 'DELETE', as: ana });
  assert.equal(removed.status, 204);
  for (const user of [ana, beto]) {
    const detail = await request(`/conversations/${chat.id}`, { as: user });
    const list = await request('/conversations', { as: user });
    const history = await request(`/conversations/${chat.id}/messages`, { as: user });
    assert.equal(detail.body.conversacion.puedeEscribir, false);
    assert.equal(list.body.items[0].puedeEscribir, false);
    assert.equal(history.body.items[0].id, stored.id);
  }
});

test('oculta el contenido eliminado en historial y último mensaje y respeta disponibilidad invisible', async () => {
  await prisma.usuario.update({ where: { id: beto.id }, data: { disponibilidad: 'INVISIBLE' } });
  const chat = await conversation();
  const stored = await message(chat, 'Contenido que no debe salir', new Date(), { fechaEliminacion: new Date(), idUsuarioEliminacion: ana.id });
  const history = await request(`/conversations/${chat.id}/messages`, { as: ana });
  const detail = await request(`/conversations/${chat.id}`, { as: ana });
  const list = await request('/conversations', { as: ana });
  assert.equal(history.body.items[0].contenido, null);
  assert.equal(history.body.items[0].eliminado, true);
  assert.equal(history.body.items[0].idAutor, ana.id);
  assert.equal(detail.body.conversacion.ultimoMensaje.contenido, null);
  assert.equal(list.body.items[0].ultimoMensaje.eliminado, true);
  assert.equal(detail.body.conversacion.otroUsuario.disponibilidad, 'AUSENTE');
  assert.equal((await prisma.mensaje.findUnique({ where: { id: stored.id } })).contenido, 'Contenido que no debe salir');
});

test('historial vacío y página final devuelven nextCursor:null', async () => {
  const chat = await conversation();
  assert.deepEqual((await request(`/conversations/${chat.id}/messages`, { as: ana })).body, { items: [], nextCursor: null });
  await message(chat, 'Único', new Date());
  const response = await request(`/conversations/${chat.id}/messages?limit=1`, { as: ana });
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.nextCursor, null);
});

test('pagina por fecha e ID sin perder mensajes con fechas iguales ni asumir IDs cronológicos', async () => {
  const chat = await conversation();
  const sameTime = new Date('2026-01-02T00:00:00Z');
  const first = await message(chat, 'Primero', sameTime);
  const second = await message(chat, 'Segundo', sameTime);
  const latest = await message(chat, 'Más reciente', new Date('2026-01-03T00:00:00Z'));
  const olderWithHigherId = await message(chat, 'Más antiguo', new Date('2026-01-01T00:00:00Z'));
  const firstPage = await request(`/conversations/${chat.id}/messages?limit=2`, { as: ana });
  assert.deepEqual(firstPage.body.items.map((m) => m.id), [latest.id, second.id]);
  assert.equal(firstPage.body.nextCursor, second.id);
  const secondPage = await request(`/conversations/${chat.id}/messages?limit=2&cursor=${firstPage.body.nextCursor}`, { as: ana });
  assert.deepEqual(secondPage.body.items.map((m) => m.id), [first.id, olderWithHigherId.id]);
  assert.equal(secondPage.body.nextCursor, null);
});

test('mensajes nuevos entre páginas no desplazan ni repiten los mensajes anteriores', async () => {
  const chat = await conversation();
  const old = await message(chat, 'Antiguo', new Date('2026-01-01T00:00:00Z'));
  const current = await message(chat, 'Actual', new Date('2026-01-02T00:00:00Z'));
  const firstPage = await request(`/conversations/${chat.id}/messages?limit=1`, { as: ana });
  assert.equal(firstPage.body.nextCursor, current.id);
  await message(chat, 'Nuevo', new Date('2026-01-03T00:00:00Z'));
  const nextPage = await request(`/conversations/${chat.id}/messages?limit=1&cursor=${current.id}`, { as: ana });
  assert.deepEqual(nextPage.body.items.map((m) => m.id), [old.id]);
  assert.equal(nextPage.body.nextCursor, null);
});

test('rechaza cursores inexistentes o pertenecientes a otra conversación', async () => {
  const chat = await conversation();
  const other = await conversation(ana, dani);
  const foreign = await message(other, 'Otro historial', new Date());
  for (const cursor of [foreign.id, 2147483647]) {
    const response = await request(`/conversations/${chat.id}/messages?cursor=${cursor}`, { as: ana });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.equal(response.body.error.details[0].campo, 'cursor');
  }
});

test('el historial utiliza 30 mensajes por defecto y permite recorrer hasta el final', async () => {
  const chat = await conversation();
  await prisma.mensaje.createMany({
    data: Array.from({ length: 31 }, (_, i) => ({
      idConversacion: chat.id,
      idAutor: ana.id,
      contenido: `Mensaje ${i}`,
      fechaCreacion: new Date(2026, 0, 1, 0, 0, i),
    })),
  });
  const first = await request(`/conversations/${chat.id}/messages`, { as: ana });
  assert.equal(first.body.items.length, 30);
  assert.notEqual(first.body.nextCursor, null);
  const last = await request(`/conversations/${chat.id}/messages?cursor=${first.body.nextCursor}`, { as: ana });
  assert.equal(last.body.items.length, 1);
  assert.equal(last.body.nextCursor, null);
  assert.equal(new Set([...first.body.items, ...last.body.items].map((m) => m.id)).size, 31);
});
