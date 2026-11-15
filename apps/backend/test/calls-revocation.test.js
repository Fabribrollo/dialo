import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configura TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_t40_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:9';
process.env.LIVEKIT_API_KEY = 'clave-de-prueba';
process.env.LIVEKIT_API_SECRET = 'secreto-de-prueba-con-largo-suficiente-para-firmar';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, calls, media, tokens, ana, dani, eli;
// LiveKit simulado: se registra cada operacion que el backend le pide.
let ops = [], salas = [], enLiveKit = [], caido = false;
const CLAVE = 'ClaveDePrueba123';

async function request(path, { method = 'GET', body, as } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: CLAVE } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, cookie: r.cookie, contrasena: CLAVE };
}
async function login(user) {
  const r = await request('/auth/login', { method: 'POST', body: { identificador: user.nombreUsuario, contrasena: user.contrasena } });
  assert.equal(r.status, 200);
  return { ...user, cookie: r.cookie };
}
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const de = (tipo) => ops.filter((op) => op[0] === tipo).map((op) => op.slice(1));

async function comunidad() {
  const r = await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Revocacion', tipo: 'PRIVADA' } });
  assert.equal(r.status, 201);
  await prisma.membresia.create({ data: { idComunidad: r.body.comunidad.id, idUsuario: dani.id } });
  return r.body.comunidad;
}
async function canal(c, datos = {}) {
  const r = await request(`/communities/${c.id}/channels`, { method: 'POST', as: ana, body: { nombre: 'voz', tipo: 'VOZ', ...datos } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.canal;
}
const acceso = (ch, habilitaciones) => request(`/channels/${ch.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones } });
// Entra por la API y LiveKit confirma la conexion.
async function conectar(ch, user = dani) {
  const r = await request(`/channels/${ch.id}/call/join`, { method: 'POST', as: user });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ingreso = (await prisma.participanteLlamada.findUnique({ where: { idUsuario: user.id } })).ingreso;
  await calls.procesarEventoMedia({ tipo: 'participant_joined', sala: `canal-${ch.id}`, idUsuario: user.id, ingreso });
  ops = [];
  return ingreso;
}
const registro = (user = dani) => prisma.participanteLlamada.findUnique({ where: { idUsuario: user.id } });

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  calls = await import('../src/services/callsService.js');
  tokens = await import('../src/utils/tokens.js');
  ({ media } = await import('../src/services/mediaService.js'));
  const falla = () => { throw Object.assign(new Error('caido'), { code: 'MEDIA_UNAVAILABLE' }); };
  media.sacarParticipante = async (idCanal, idUsuario) => { if (caido) falla(); ops.push(['sacar', idCanal, idUsuario]); return true; };
  media.actualizarPermisos = async (idCanal, idUsuario, fuentes) => { if (caido) falla(); ops.push(['permisos', idCanal, idUsuario, fuentes]); return true; };
  media.cerrarSala = async (idCanal) => { if (caido) falla(); ops.push(['cerrar', idCanal]); return true; };
  media.listarSalas = async () => { if (caido) falla(); return salas; };
  media.listarParticipantes = async () => { if (caido) falla(); return enLiveKit; };
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => {
  await prisma.comunidad.deleteMany();
  ops = []; salas = []; enLiveKit = []; caido = false;
  dani = await login(dani);
});
after(async () => {
  if (io) await new Promise((resolve) => io.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('perder TRANSMITIR corta solo camara y pantalla en vivo; perder VER saca de la llamada', async () => {
  const c = await comunidad(), ch = await canal(c, { tipo: 'VIDEO', privado: true });
  await acceso(ch, [{ idUsuario: dani.id, permisos: ['HABLAR', 'TRANSMITIR'] }]);
  await conectar(ch);
  await acceso(ch, [{ idUsuario: dani.id, permisos: ['HABLAR'] }]);
  await pausa(50);
  assert.deepEqual(de('permisos'), [[ch.id, dani.id, ['microfono']]]);
  assert.equal(de('sacar').length, 0);
  assert.notEqual(await registro(), null);

  await acceso(ch, []);
  await pausa(50);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
  assert.equal(await registro(), null);
});

test('quitar el rol personalizado que daba acceso saca al participante', async () => {
  const c = await comunidad(), ch = await canal(c, { privado: true });
  const rol = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Voces' } });
  await acceso(ch, [{ idRol: rol.id, permisos: ['VER', 'HABLAR'] }]);
  await prisma.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: dani.id, idRol: rol.id } });
  await conectar(ch);
  const { withCommunityAccessChange } = await import('../src/services/channelsService.js');
  await withCommunityAccessChange(c.id, (tx) => tx.membresiaRol.deleteMany({ where: { idRol: rol.id } }));
  await pausa(50);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
  assert.equal(await registro(), null);
});

test('banear saca de la llamada e impide volver con el token anterior; desbanear no devuelve el acceso', async () => {
  const c = await comunidad(), ch = await canal(c);
  const ingreso = await conectar(ch);
  assert.equal((await request(`/communities/${c.id}/bans/${dani.id}`, { method: 'PUT', as: ana, body: {} })).status, 204);
  await pausa(50);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
  assert.equal(await registro(), null);
  await calls.procesarEventoMedia({ tipo: 'participant_joined', sala: `canal-${ch.id}`, idUsuario: dani.id, ingreso });
  assert.equal(de('sacar').length, 2);
  await request(`/communities/${c.id}/bans/${dani.id}`, { method: 'DELETE', as: ana });
  assert.equal((await request(`/channels/${ch.id}/call/join`, { method: 'POST', as: dani })).status, 404);
});

test('abandonar la comunidad corta la llamada', async () => {
  const c = await comunidad(), ch = await canal(c);
  await conectar(ch);
  assert.equal((await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani })).status, 204);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
  assert.equal(await registro(), null);
});

test('borrar el canal, cambiarlo a texto o borrar la comunidad cierra la sala', async () => {
  const c = await comunidad();
  const a = await canal(c, { nombre: 'a' });
  await conectar(a);
  assert.equal((await request(`/channels/${a.id}`, { method: 'DELETE', as: ana })).status, 204);
  await pausa(50);
  assert.deepEqual(de('cerrar'), [[a.id]]);
  assert.equal(await registro(), null);

  ops = [];
  const b = await canal(c, { nombre: 'b' });
  await conectar(b);
  assert.equal((await request(`/channels/${b.id}`, { method: 'PATCH', as: ana, body: { tipo: 'TEXTO' } })).status, 200);
  await pausa(50);
  assert.deepEqual(de('cerrar'), [[b.id]]);
  assert.equal(await registro(), null);

  ops = [];
  const d = await canal(c, { nombre: 'd' });
  await conectar(d);
  assert.equal((await request(`/communities/${c.id}`, { method: 'DELETE', as: ana })).status, 204);
  assert(de('cerrar').some(([id]) => id === d.id));
  assert.equal(await registro(), null);
});

test('logout corta solo la llamada de esa sesion; cambiar la contrasena corta todas', async () => {
  const c = await comunidad(), ch = await canal(c);
  await conectar(ch);
  const otra = await login(dani);
  assert.equal((await request('/auth/logout', { method: 'POST', as: otra })).status, 204);
  await pausa(50);
  assert.equal(de('sacar').length, 0);
  assert.notEqual(await registro(), null);

  assert.equal((await request('/auth/logout', { method: 'POST', as: dani })).status, 204);
  await pausa(50);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
  assert.equal(await registro(), null);

  ops = [];
  dani = await login(dani);
  await conectar(ch);
  const token = tokens.generateToken();
  await prisma.recuperacionCuenta.create({ data: { idUsuario: dani.id, hashToken: tokens.hashToken(token), fechaExpiracion: new Date(Date.now() + 60_000) } });
  dani.contrasena = 'OtraClaveDePrueba456';
  assert.equal((await request('/auth/reset-password', { method: 'POST', body: { token, contrasena: dani.contrasena } })).status, 204);
  await pausa(50);
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
});

test('volver a entrar con un token anterior no recupera una fuente quitada', async () => {
  const c = await comunidad(), ch = await canal(c, { tipo: 'VIDEO', privado: true });
  await acceso(ch, [{ idUsuario: dani.id, permisos: ['HABLAR', 'TRANSMITIR'] }]);
  const ingreso = await conectar(ch);
  // Se cae la conexion (sin borrar el registro) y le quitan TRANSMITIR mientras tanto.
  await prisma.participanteLlamada.update({ where: { idUsuario: dani.id }, data: { conectado: false } });
  await acceso(ch, [{ idUsuario: dani.id, permisos: ['HABLAR'] }]);
  ops = [];
  await calls.procesarEventoMedia({ tipo: 'participant_joined', sala: `canal-${ch.id}`, idUsuario: dani.id, ingreso });
  assert.deepEqual(de('permisos'), [[ch.id, dani.id, ['microfono']]]);
});

test('si LiveKit falla al revocar, el acceso igual se retira y la reconciliacion termina el corte', async () => {
  const c = await comunidad(), ch = await canal(c, { privado: true });
  await acceso(ch, [{ idUsuario: dani.id, permisos: ['VER', 'HABLAR'] }]);
  const ingreso = await conectar(ch);
  caido = true;
  await acceso(ch, []);
  await pausa(50);
  assert.equal(await registro(), null);
  assert.equal((await request(`/channels/${ch.id}/call/join`, { method: 'POST', as: dani })).status, 404);
  caido = false;
  salas = [ch.id];
  enLiveKit = [{ idUsuario: dani.id, ingreso }];
  await calls.reconciliarLlamadas();
  assert.deepEqual(de('sacar'), [[ch.id, dani.id]]);
});

test('la reconciliacion corta sesiones vencidas y cierra salas de canales que ya no existen', async () => {
  const c = await comunidad(), ch = await canal(c);
  const ingreso = await conectar(ch);
  const { idSesion } = await registro();
  await prisma.sesion.update({ where: { id: idSesion }, data: { fechaExpiracion: new Date(Date.now() - 1000) } });
  salas = [ch.id, 999999];
  enLiveKit = [{ idUsuario: dani.id, ingreso }];
  await calls.reconciliarLlamadas();
  assert(de('sacar').some(([id, u]) => id === ch.id && u === dani.id));
  assert(de('cerrar').some(([id]) => id === 999999));
  assert.equal(await registro(), null);
});
