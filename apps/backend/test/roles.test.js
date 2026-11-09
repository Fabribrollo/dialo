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
const schema = `test_t29_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';
const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, owner, manager, moderator, member, outsider;
const sockets = [];
const roleEvents = ['community:role-created', 'community:role-updated', 'community:role-deleted'];

async function request(path, { method = 'GET', body, as, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, cookie: r.cookie };
}
async function community(tipo = 'PRIVADA') {
  const r = await request('/communities', { method: 'POST', as: owner, body: { nombre: 'Roles T29', tipo } });
  assert.equal(r.status, 201);
  const c = r.body.comunidad;
  for (const [user, rol] of [[manager, 'ADMIN'], [moderator, 'MODERADOR'], [member, 'INTEGRANTE']]) {
    await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
  }
  return c;
}
const path = (c, idRol) => `/communities/${c.id}/roles${idRol === undefined ? '' : `/${idRol}`}`;
async function create(c, nombre = 'Equipo', as = owner) {
  const r = await request(path(c), { method: 'POST', as, body: { nombre } });
  assert.equal(r.status, 201, JSON.stringify(r)); return r.body.rol;
}
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(error);
    assert.equal(reply.error.code, 'VALIDATION_ERROR'); resolve();
  }));
}
async function client(user) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await ready(socket);
  const events = [];
  socket.onAny((event, data) => { if (roleEvents.includes(event) || event === 'channel:updated') events.push({ event, data }); });
  return { socket, events };
}
async function flush(...clients) { await Promise.all(clients.map((c) => ready(c.socket))); await new Promise((r) => setTimeout(r, 20)); }
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  owner = await register('owner'); manager = await register('manager'); moderator = await register('moderator'); member = await register('member'); outsider = await register('outsider');
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((r) => io.close(r));
  else if (server?.listening) await new Promise((r) => server.close(r));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('las cinco rutas requieren sesión y no aceptan suplantación por header', async () => {
  for (const [method, url, body] of [['GET', '/communities/1/roles'], ['GET', '/communities/1/roles/1'], ['POST', '/communities/1/roles', { nombre: 'Equipo' }], ['PATCH', '/communities/1/roles/1', { nombre: 'Nuevo' }], ['DELETE', '/communities/1/roles/1']]) {
    assert.equal((await request(url, { method, body, headers: { 'x-dev-user-id': String(owner.id) } })).status, 401);
  }
});

test('propietario y administrador realizan CRUD y los integrantes consultan metadatos públicos', async () => {
  const c = await community();
  assert.deepEqual((await request(path(c), { as: member })).body, { items: [] });
  const r = await create(c, 'Equipo', manager);
  assert.deepEqual(Object.keys(r).sort(), ['fechaCreacion', 'id', 'idComunidad', 'nombre']);
  assert.equal(r.idComunidad, c.id);
  assert.equal((await request(path(c, r.id), { as: moderator })).body.rol.id, r.id);
  const updated = await request(path(c, r.id), { method: 'PATCH', as: owner, body: { nombre: 'Diseño' } });
  assert.equal(updated.status, 200); assert.equal(updated.body.rol.nombre, 'Diseño');
  assert.equal((await request(path(c), { as: member })).body.items[0].nombre, 'Diseño');
  assert.equal((await request(path(c, r.id), { method: 'DELETE', as: manager })).status, 204);
  assert.equal((await request(path(c, r.id), { as: owner })).body.error.code, 'ROLE_NOT_FOUND');
});

test('moderador e integrante no mutan roles; usuarios externos no descubren comunidades privadas', async () => {
  const c = await community(); const r = await create(c);
  for (const as of [moderator, member]) {
    for (const [method, url, body] of [['POST', path(c), { nombre: 'Nuevo' }], ['PATCH', path(c, r.id), { nombre: 'Otro' }], ['DELETE', path(c, r.id)]]) {
      assert.equal((await request(url, { method, as, body })).status, 403);
    }
  }
  for (const [method, url, body] of [['GET', path(c)], ['GET', path(c, r.id)], ['POST', path(c), { nombre: 'Nuevo' }], ['PATCH', path(c, r.id), { nombre: 'Otro' }], ['DELETE', path(c, r.id)]]) {
    assert.equal((await request(url, { method, as: outsider, body })).status, 404);
  }
  const pub = await community('PUBLICA');
  assert.equal((await request(path(pub), { as: outsider })).status, 403);
});

test('IDs ajenos o inexistentes no modifican roles de otra comunidad', async () => {
  const a = await community(); const b = await community(); const r = await create(b);
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    const result = await request(path(a, r.id), { method, as: owner, ...(method === 'PATCH' ? { body: { nombre: 'Cruzado' } } : {}) });
    assert.equal(result.status, 404); assert.equal(result.body.error.code, 'ROLE_NOT_FOUND');
  }
  assert.equal((await request('/communities/2147483647/roles', { as: owner })).status, 404);
  assert.equal((await prisma.rolPersonalizado.findUnique({ where: { id: r.id } })).nombre, 'Equipo');
});

test('valida cuerpos, IDs y roles base protegidos en HTTP', async () => {
  const c = await community(); const r = await create(c);
  for (const body of [{}, { nombre: '' }, { nombre: ' x' }, { nombre: 'x ' }, { nombre: 'x'.repeat(33) }, { nombre: 'Admin' }, { nombre: 'Equipo', permisos: ['VER'] }, { nombre: 'Equipo', idComunidad: c.id + 1 }]) {
    for (const [method, url] of [['POST', path(c)], ['PATCH', path(c, r.id)]]) {
      const response = await request(url, { method, as: owner, body });
      assert.equal(response.status, 400); assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
  }
  for (const id of ['0', '-1', 'abc', '1.5', '2147483648', 'ADMIN']) {
    assert.equal((await request(`/communities/${c.id}/roles/${id}`, { as: owner })).status, 400);
    assert.equal((await request(`/communities/${id}/roles`, { as: owner })).status, 400);
  }
});

test('unicidad insensible a mayúsculas y concurrencia devuelven conflicto sin duplicados', async () => {
  const c = await community();
  const responses = await Promise.all(['Equipo', 'equipo'].map((nombre) => request(path(c), { method: 'POST', as: owner, body: { nombre } })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal(responses.find((r) => r.status === 409).body.error.code, 'ROLE_NAME_TAKEN');
  assert.equal(await prisma.rolPersonalizado.count({ where: { idComunidad: c.id } }), 1);
  const other = await create(c, 'Otro');
  assert.equal((await request(path(c, other.id), { method: 'PATCH', as: manager, body: { nombre: 'EQUIPO' } })).status, 409);
  assert.equal((await prisma.rolPersonalizado.findUnique({ where: { id: other.id } })).nombre, 'Otro');
  await create(await community(), 'Equipo');
});

test('eliminar limpia asignaciones y grants conservando mensajes, integrantes y permisos anteriores', async () => {
  const c = await community(); const r = await create(c);
  const canal = await prisma.canal.create({ data: { idComunidad: c.id, nombre: 'secreto', privado: true } });
  await prisma.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: member.id, idRol: r.id } });
  await prisma.canalRolPersonalizado.create({ data: { idComunidad: c.id, idCanal: canal.id, idRol: r.id, permisos: ['VER'] } });
  await prisma.canalUsuario.create({ data: { idComunidad: c.id, idCanal: canal.id, idUsuario: member.id, permisos: ['VER'] } });
  const mensaje = await prisma.mensaje.create({ data: { idCanal: canal.id, idAutor: owner.id, contenido: 'Conservar' } });
  const listener = await client(moderator); const affected = await client(member);
  assert.equal((await request(path(c, r.id), { method: 'DELETE', as: owner })).status, 204);
  await flush(listener, affected);
  assert.equal(await prisma.membresiaRol.count({ where: { idRol: r.id } }), 0);
  assert.equal(await prisma.canalRolPersonalizado.count({ where: { idRol: r.id } }), 0);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id } }), 4);
  assert.ok(await prisma.mensaje.findUnique({ where: { id: mensaje.id } }));
  assert.equal(await prisma.canalUsuario.count({ where: { idCanal: canal.id } }), 1);
  assert.equal(listener.events.some((e) => e.event === 'channel:updated'), false);
  assert.equal(affected.events.some((e) => e.event === 'channel:updated' && e.data.canal.id === canal.id), true);
  assert.equal((await request(path(c, r.id), { method: 'DELETE', as: owner })).status, 404);
});

test('eventos de CRUD llegan una vez a varias pestañas y no a terceros ni ante errores', async () => {
  const c = await community();
  const one = await client(member); const two = await client(member); const out = await client(outsider);
  const r = await create(c);
  await create(c, 'Otro');
  const conflict = await request(path(c, r.id), { method: 'PATCH', as: owner, body: { nombre: 'otro' } });
  assert.equal(conflict.status, 409);
  await request(path(c, r.id), { method: 'PATCH', as: manager, body: { nombre: 'Editado' } });
  await request(path(c, r.id), { method: 'DELETE', as: manager });
  await flush(one, two, out);
  const expected = ['community:role-created', 'community:role-created', 'community:role-updated', 'community:role-deleted'];
  assert.deepEqual(one.events.map((e) => e.event), expected);
  assert.deepEqual(two.events, one.events); assert.deepEqual(out.events, []);
  for (const { data } of one.events) {
    assert.equal(data.idComunidad, c.id);
    assert.deepEqual(Object.keys(data).sort(), data.rol ? ['idComunidad', 'rol'] : ['idComunidad', 'idRol']);
    if (data.rol) assert.deepEqual(Object.keys(data.rol).sort(), ['fechaCreacion', 'id', 'idComunidad', 'nombre']);
  }
});

test('actualización y eliminación concurrentes no dejan roles ni relaciones huérfanas', async () => {
  const c = await community(); const r = await create(c);
  const [updated, deleted] = await Promise.all([
    request(path(c, r.id), { method: 'PATCH', as: owner, body: { nombre: 'Final' } }),
    request(path(c, r.id), { method: 'DELETE', as: manager }),
  ]);
  assert.ok([200, 404].includes(updated.status)); assert.equal(deleted.status, 204);
  assert.equal(await prisma.rolPersonalizado.count({ where: { id: r.id } }), 0);
});

test('eliminación de comunidad concurrente con creación de rol no deja registros huérfanos', async () => {
  const c = await community();
  const [created, deleted] = await Promise.all([
    request(path(c), { method: 'POST', as: manager, body: { nombre: 'Temporal' } }),
    request(`/communities/${c.id}`, { method: 'DELETE', as: owner }),
  ]);
  assert.ok([201, 404].includes(created.status)); assert.equal(deleted.status, 204);
  assert.equal(await prisma.rolPersonalizado.count({ where: { idComunidad: c.id } }), 0);
});
