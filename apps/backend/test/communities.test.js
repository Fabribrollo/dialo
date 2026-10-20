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
if (!databaseUrl) {
  throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL de pruebas antes de ejecutar este archivo');
}
const schema = `test_f05_${randomUUID().replaceAll('-', '')}`;
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
const sockets = [];

async function request(path, { method = 'GET', body, as } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(as ? { Cookie: as.cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
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

async function create(as, body = { nombre: 'Club de lectura', tipo: 'PRIVADA' }) {
  const response = await request('/communities', { method: 'POST', as, body });
  assert.equal(response.status, 201);
  return response.body.comunidad;
}

function addMember(comunidad, usuario, rol = 'INTEGRANTE') {
  return prisma.membresia.create({ data: { idComunidad: comunidad.id, idUsuario: usuario.id, rol } });
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

function nextEvent(socket, evento) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No llegó ${evento}`)), 3000);
    socket.once(evento, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function inRoom(socket, room) {
  return io.sockets.sockets.get(socket.id)?.rooms.has(room) ?? false;
}

async function waitInRoom(socket, room) {
  for (let i = 0; i < 100 && !inRoom(socket, room); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(inRoom(socket, room), `El socket no entró a ${room}`);
}

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);

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
});

beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
});

after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (prisma) await prisma.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('todas las rutas exigen sesión', async () => {
  for (const [method, path, body] of [
    ['GET', '/communities'],
    ['POST', '/communities', { nombre: 'Club' }],
    ['GET', '/communities/1'],
    ['PATCH', '/communities/1', { nombre: 'Club' }],
    ['POST', '/communities/1/imagen'],
    ['DELETE', '/communities/1'],
  ]) {
    const response = await request(path, { method, body });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  }
});

test('crear deja al creador como propietario e integrante, con el canal general', async () => {
  const comunidad = await create(ana);
  assert.equal(comunidad.nombre, 'Club de lectura');
  assert.equal(comunidad.tipo, 'PRIVADA');
  assert.equal(comunidad.idPropietario, ana.id);
  assert.equal(comunidad.miRol, 'PROPIETARIO');
  assert.equal(comunidad.cantidadIntegrantes, 1);
  assert.equal(comunidad.imagenUrl, null);

  const membresias = await prisma.membresia.findMany({ where: { idComunidad: comunidad.id } });
  assert.deepEqual(membresias.map((m) => [m.idUsuario, m.rol]), [[ana.id, 'PROPIETARIO']]);
  const canales = await prisma.canal.findMany({ where: { idComunidad: comunidad.id } });
  assert.deepEqual(canales.map((c) => [c.nombre, c.tipo, c.privado]), [['general', 'TEXTO', false]]);
});

test('el cliente no puede elegir propietario ni mandar datos inválidos', async () => {
  for (const body of [
    { nombre: 'Club', idPropietario: beto.id },
    { nombre: 'C' },
    { nombre: ' Club' },
    { nombre: 'x'.repeat(65) },
    { nombre: 'Club', tipo: 'SECRETA' },
    {},
  ]) {
    const response = await request('/communities', { method: 'POST', as: ana, body });
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal(await prisma.comunidad.count(), 0);
});

test('una falla al crear no deja la comunidad a medias', async () => {
  await assert.rejects(prisma.comunidad.create({
    data: {
      nombre: 'Rota',
      membresias: { create: { idUsuario: ana.id, rol: 'PROPIETARIO' } },
      canales: { create: { nombre: 'general', posicion: -1 } },
    },
  }));
  assert.equal(await prisma.comunidad.count(), 0);
  assert.equal(await prisma.membresia.count(), 0);
});

test('el listado trae solo las comunidades propias, la más reciente primero', async () => {
  const primera = await create(ana, { nombre: 'Primera', tipo: 'PUBLICA' });
  const segunda = await create(ana, { nombre: 'Segunda' });
  await create(beto, { nombre: 'Ajena privada' });
  const deBeto = await create(beto, { nombre: 'Ajena publica', tipo: 'PUBLICA' });
  await addMember(deBeto, ana);

  const response = await request('/communities', { as: ana });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.items.map((c) => [c.nombre, c.miRol]), [
    ['Ajena publica', 'INTEGRANTE'],
    ['Segunda', 'PROPIETARIO'],
    ['Primera', 'PROPIETARIO'],
  ]);
  assert.equal(response.body.items[1].id, segunda.id);
  assert.equal(response.body.items[2].id, primera.id);
  assert.equal((await request('/communities', { as: cata })).body.items.length, 0);
});

test('ver una comunidad respeta su visibilidad y persiste', async () => {
  const privada = await create(ana);
  const publica = await create(ana, { nombre: 'Abierta', tipo: 'PUBLICA' });
  await addMember(privada, beto);

  const propia = await request(`/communities/${privada.id}`, { as: beto });
  assert.equal(propia.status, 200);
  assert.equal(propia.body.comunidad.miRol, 'INTEGRANTE');
  assert.equal(propia.body.comunidad.cantidadIntegrantes, 2);
  assert.equal(propia.body.comunidad.idPropietario, ana.id);

  const ajenaPrivada = await request(`/communities/${privada.id}`, { as: cata });
  assert.equal(ajenaPrivada.status, 404);
  assert.equal(ajenaPrivada.body.error.code, 'COMMUNITY_NOT_FOUND');

  const ajenaPublica = await request(`/communities/${publica.id}`, { as: cata });
  assert.equal(ajenaPublica.status, 403);
  assert.equal(ajenaPublica.body.error.code, 'NOT_MEMBER');

  const inexistente = await request('/communities/999999', { as: ana });
  assert.equal(inexistente.status, 404);
  assert.equal(inexistente.body.error.code, 'COMMUNITY_NOT_FOUND');

  const invalida = await request('/communities/abc', { as: ana });
  assert.equal(invalida.status, 400);
});

test('solo ADMIN o más edita, sin tocar campos protegidos ni los no enviados', async () => {
  const comunidad = await create(ana);
  await addMember(comunidad, beto, 'ADMIN');
  await addMember(comunidad, cata, 'MODERADOR');

  const moderador = await request(`/communities/${comunidad.id}`, { method: 'PATCH', as: cata, body: { nombre: 'Nuevo' } });
  assert.equal(moderador.status, 403);
  assert.equal(moderador.body.error.code, 'INSUFFICIENT_ROLE');

  for (const body of [{}, { idPropietario: beto.id }, { id: 5 }, { imagenUrl: 'http://x' }, { nombre: 'A' }]) {
    const response = await request(`/communities/${comunidad.id}`, { method: 'PATCH', as: ana, body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }

  const socketCata = await socketFor(cata);
  await waitInRoom(socketCata, `community:${comunidad.id}`);
  const evento = nextEvent(socketCata, 'community:updated');
  const admin = await request(`/communities/${comunidad.id}`, { method: 'PATCH', as: beto, body: { tipo: 'PUBLICA' } });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.comunidad.tipo, 'PUBLICA');
  assert.equal(admin.body.comunidad.nombre, 'Club de lectura');
  assert.equal(admin.body.comunidad.miRol, 'ADMIN');
  assert.equal(admin.body.comunidad.idPropietario, ana.id);
  const { comunidad: emitida } = await evento;
  assert.equal(emitida.tipo, 'PUBLICA');
  assert.equal(emitida.miRol, undefined);

  const otra = await request(`/communities/${comunidad.id}`, { as: ana });
  assert.equal(otra.body.comunidad.tipo, 'PUBLICA');
});

test('crear avisa a las pestañas propias y las une a la room', async () => {
  const socket = await socketFor(ana);
  const evento = nextEvent(socket, 'community:new');
  const comunidad = await create(ana);
  assert.equal((await evento).comunidad.id, comunidad.id);
  assert.ok(inRoom(socket, `community:${comunidad.id}`));
});

test('al conectar, el socket entra a sus comunidades y no a las ajenas', async () => {
  const propia = await create(ana);
  const ajena = await create(beto);
  const socket = await socketFor(ana);
  await waitInRoom(socket, `community:${propia.id}`);
  assert.equal(inRoom(socket, `community:${ajena.id}`), false);
});

test('solo el propietario elimina, en cascada y sin tocar lo ajeno', async () => {
  const comunidad = await create(ana);
  const otra = await create(beto);
  await addMember(comunidad, beto, 'ADMIN');
  const [general] = await prisma.canal.findMany({ where: { idComunidad: comunidad.id } });
  await prisma.mensaje.create({ data: { idAutor: ana.id, idCanal: general.id, contenido: 'hola' } });
  await prisma.invitacion.create({ data: { idComunidad: comunidad.id, idCreador: ana.id, codigo: 'abc123' } });
  const chat = await prisma.conversacionPrivada.create({
    data: { idUsuarioA: Math.min(ana.id, beto.id), idUsuarioB: Math.max(ana.id, beto.id) },
  });

  const noPropietario = await request(`/communities/${comunidad.id}`, { method: 'DELETE', as: beto });
  assert.equal(noPropietario.status, 403);
  assert.equal(noPropietario.body.error.code, 'INSUFFICIENT_ROLE');

  const socketBeto = await socketFor(beto);
  await waitInRoom(socketBeto, `community:${comunidad.id}`);
  await waitInRoom(socketBeto, `community:${otra.id}`);
  const evento = nextEvent(socketBeto, 'community:deleted');
  const response = await request(`/communities/${comunidad.id}`, { method: 'DELETE', as: ana });
  assert.equal(response.status, 204);
  assert.deepEqual(await evento, { idComunidad: comunidad.id });
  assert.equal(inRoom(socketBeto, `community:${comunidad.id}`), false);
  assert.ok(inRoom(socketBeto, `community:${otra.id}`));

  assert.equal(await prisma.canal.count({ where: { idComunidad: comunidad.id } }), 0);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: comunidad.id } }), 0);
  assert.equal(await prisma.invitacion.count({ where: { idComunidad: comunidad.id } }), 0);
  assert.equal(await prisma.mensaje.count({ where: { idCanal: general.id } }), 0);
  assert.ok(await prisma.comunidad.findUnique({ where: { id: otra.id } }));
  assert.ok(await prisma.conversacionPrivada.findUnique({ where: { id: chat.id } }));

  const deNuevo = await request(`/communities/${comunidad.id}`, { as: ana });
  assert.equal(deNuevo.status, 404);
});

test('la imagen exige ADMIN o más y un archivo válido', async () => {
  const comunidad = await create(ana);
  await addMember(comunidad, beto);

  const form = (type) => {
    const data = new FormData();
    data.append('imagen', new Blob(['contenido'], { type }), 'archivo');
    return data;
  };
  const integrante = await fetch(`${baseUrl}/api/communities/${comunidad.id}/imagen`, {
    method: 'POST', headers: { Cookie: beto.cookie }, body: form('image/png'),
  });
  assert.equal(integrante.status, 403);
  assert.equal((await integrante.json()).error.code, 'INSUFFICIENT_ROLE');

  const sinArchivo = await fetch(`${baseUrl}/api/communities/${comunidad.id}/imagen`, {
    method: 'POST', headers: { Cookie: ana.cookie },
  });
  assert.equal(sinArchivo.status, 400);
  assert.equal((await sinArchivo.json()).error.code, 'INVALID_FILE');

  const tipoInvalido = await fetch(`${baseUrl}/api/communities/${comunidad.id}/imagen`, {
    method: 'POST', headers: { Cookie: ana.cookie }, body: form('text/plain'),
  });
  assert.equal(tipoInvalido.status, 400);
  assert.equal((await tipoInvalido.json()).error.code, 'INVALID_FILE');
});
