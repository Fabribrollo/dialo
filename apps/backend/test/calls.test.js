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
const schema = `test_t35_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';
// LiveKit simulado: los tokens se firman de verdad y las llamadas al servidor se registran.
process.env.LIVEKIT_URL = 'ws://127.0.0.1:9';
process.env.LIVEKIT_API_KEY = 'clave-de-prueba';
process.env.LIVEKIT_API_SECRET = 'secreto-de-prueba-con-largo-suficiente-para-firmar';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, calls, media, ana, dani, eli;
let expulsados = [], enLiveKit = [];
const sockets = [];

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
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(8000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
async function socketFor(user) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
}
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function comunidad() {
  const r = await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Llamadas', tipo: 'PRIVADA' } });
  assert.equal(r.status, 201);
  await prisma.membresia.create({ data: { idComunidad: r.body.comunidad.id, idUsuario: dani.id } });
  return r.body.comunidad;
}
async function canal(c, datos) {
  const r = await request(`/communities/${c.id}/channels`, { method: 'POST', as: ana, body: { nombre: 'voz', tipo: 'VOZ', ...datos } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.canal;
}
const entrar = (ch, user) => request(`/channels/${ch.id}/call/join`, { method: 'POST', as: user });
const ingresoDe = async (user) => (await prisma.participanteLlamada.findUnique({ where: { idUsuario: user.id } }))?.ingreso;
const evento = (tipo, ch, user, ingreso) => calls.procesarEventoMedia({ tipo, sala: `canal-${ch.id}`, idUsuario: user.id, ingreso });
const participantes = async (ch, user = ana) => (await request(`/channels/${ch.id}/call/participants`, { as: user })).body.items;

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  calls = await import('../src/services/callsService.js');
  ({ media } = await import('../src/services/mediaService.js'));
  media.sacarParticipante = async (idCanal, idUsuario) => { expulsados.push([idCanal, idUsuario]); return true; };
  media.listarParticipantes = async () => enLiveKit;
  media.listarSalas = async () => [...new Set((await prisma.participanteLlamada.findMany()).map((p) => p.idCanal))];
  media.actualizarPermisos = async () => true;
  media.cerrarSala = async () => true;
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
  expulsados = []; enLiveKit = [];
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('un integrante con VER entra a un canal de voz y el token solo permite sus fuentes', async () => {
  const c = await comunidad(), ch = await canal(c);
  const r = await entrar(ch, dani);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { llamada } = r.body;
  assert.equal(llamada.sala, `canal-${ch.id}`);
  assert.deepEqual(llamada.misPermisos, ['VER', 'HABLAR']);
  assert.equal(llamada.ingreso, undefined);
  const c1 = claims(llamada.token);
  assert.equal(c1.sub, `usuario-${dani.id}`);
  assert.equal(c1.video.room, `canal-${ch.id}`);
  assert.deepEqual(c1.video.canPublishSources, ['microphone']);
  assert.equal((await prisma.participanteLlamada.findUnique({ where: { idUsuario: dani.id } })).conectado, false);
});

test('TRANSMITIR habilita camara y pantalla; solo VER no permite publicar nada', async () => {
  const c = await comunidad();
  const video = await canal(c, { nombre: 'video', tipo: 'VIDEO', privado: true });
  await request(`/channels/${video.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['TRANSMITIR'] }] } });
  const transmite = claims((await entrar(video, dani)).body.llamada.token);
  assert.deepEqual(transmite.video.canPublishSources.sort(), ['camera', 'screen_share', 'screen_share_audio']);
  const oyente = await canal(c, { nombre: 'oyentes', privado: true });
  await request(`/channels/${oyente.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones: [{ rol: 'INTEGRANTE', permisos: ['VER'] }] } });
  const solo = claims((await entrar(oyente, dani)).body.llamada.token);
  assert.equal(solo.video.canPublish, false);
  assert.equal(solo.video.canSubscribe, true);
});

test('sin VER, en un canal de texto o de otra comunidad no se puede entrar', async () => {
  const c = await comunidad();
  const privado = await canal(c, { nombre: 'privado', privado: true });
  assert.equal((await entrar(privado, dani)).status, 404);
  assert.equal((await entrar(privado, eli)).status, 404);
  const texto = await canal(c, { nombre: 'texto', tipo: 'TEXTO' });
  const r = await entrar(texto, dani);
  assert.equal(r.status, 400); assert.equal(r.body.error.code, 'NOT_A_CALL_CHANNEL');
  assert.equal(await prisma.participanteLlamada.count(), 0);
});

test('sin LiveKit configurado el ingreso responde MEDIA_UNAVAILABLE sin guardar nada', async () => {
  const c = await comunidad(), ch = await canal(c);
  media.configurado = false;
  try {
    const r = await entrar(ch, dani);
    assert.equal(r.status, 503); assert.equal(r.body.error.code, 'MEDIA_UNAVAILABLE');
    assert.equal(await prisma.participanteLlamada.count(), 0);
  } finally { media.configurado = true; }
});

test('el webhook con el ingreso correcto conecta una sola vez; uno falso saca al participante', async () => {
  const c = await comunidad(), ch = await canal(c);
  const oyente = await socketFor(ana), recibidos = [];
  oyente.on('call:participant-joined', (data) => recibidos.push(data));
  assert.equal((await ack(oyente, 'channel:subscribe', { idCanal: ch.id })).ok, true);
  await entrar(ch, dani);
  const ingreso = await ingresoDe(dani);

  await evento('participant_joined', ch, dani, 'ingreso-falso');
  assert.deepEqual(expulsados, [[ch.id, dani.id]]);
  assert.deepEqual(await participantes(ch), []);

  await evento('participant_joined', ch, dani, ingreso);
  await evento('participant_joined', ch, dani, ingreso);
  const lista = await participantes(ch);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].usuario.id, dani.id);
  assert.equal(JSON.stringify(lista).includes('token'), false);
  await pausa(50);
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0].participante.usuario.id, dani.id);
});

test('salir quita al participante, es idempotente y un evento de salida repetido no hace nada', async () => {
  const c = await comunidad(), ch = await canal(c);
  await entrar(ch, dani);
  const ingreso = await ingresoDe(dani);
  await evento('participant_joined', ch, dani, ingreso);
  assert.equal((await request(`/channels/${ch.id}/call/leave`, { method: 'POST', as: dani })).status, 204);
  assert.deepEqual(await participantes(ch), []);
  assert.deepEqual(expulsados, [[ch.id, dani.id]]);
  assert.equal((await request(`/channels/${ch.id}/call/leave`, { method: 'POST', as: dani })).status, 204);
  await evento('participant_left', ch, dani, ingreso);
  assert.equal(expulsados.length, 1);
  // Reusar el token despues de salir: el webhook lo saca.
  await evento('participant_joined', ch, dani, ingreso);
  assert.equal(expulsados.length, 2);
});

test('una sola llamada activa por usuario: estar conectado en otro canal es un conflicto', async () => {
  const c = await comunidad(), a = await canal(c, { nombre: 'a' }), b = await canal(c, { nombre: 'b' });
  await entrar(a, dani);
  await evento('participant_joined', a, dani, await ingresoDe(dani));
  const r = await entrar(b, dani);
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'ALREADY_IN_CALL');
  assert.equal(r.body.error.details[0].idCanal, a.id);
  await request(`/channels/${a.id}/call/leave`, { method: 'POST', as: dani });
  assert.equal((await entrar(b, dani)).status, 200);
  // Volver a pedir token en el mismo canal invalida el ingreso anterior.
  const viejo = await ingresoDe(dani);
  await entrar(b, dani);
  assert.notEqual(await ingresoDe(dani), viejo);
});

test('no se conecta con una sesion cerrada ni sin VER al momento de entrar a la sala', async () => {
  const c = await comunidad(), ch = await canal(c, { nombre: 'cerrado', privado: true });
  await request(`/channels/${ch.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones: [{ idUsuario: dani.id, permisos: ['VER', 'HABLAR'] }] } });
  await entrar(ch, dani);
  const ingreso = await ingresoDe(dani);
  await request(`/channels/${ch.id}/access`, { method: 'PUT', as: ana, body: { privado: true, habilitaciones: [] } });
  await pausa(50);
  // Desde T-40 perder VER ya corta la autorizacion; el ingreso posterior tambien se rechaza.
  assert.equal(await prisma.participanteLlamada.findUnique({ where: { idUsuario: dani.id } }), null);
  await evento('participant_joined', ch, dani, ingreso);
  assert.deepEqual(expulsados.at(-1), [ch.id, dani.id]);

  const abierto = await canal(c, { nombre: 'abierto' });
  const login = await request('/auth/login', { method: 'POST', body: { identificador: 'dani', contrasena: 'ClaveDePrueba123' } });
  const sesion = { ...dani, cookie: login.cookie };
  await entrar(abierto, sesion);
  const otroIngreso = await ingresoDe(dani);
  await request('/auth/logout', { method: 'POST', as: sesion });
  await evento('participant_joined', abierto, dani, otroIngreso);
  assert.deepEqual(expulsados.at(-1), [abierto.id, dani.id]);
  assert.deepEqual(await participantes(abierto), []);
});

test('la reconciliacion quita conexiones que ya no existen y saca a quien entro sin autorizacion', async () => {
  const c = await comunidad(), ch = await canal(c);
  await entrar(ch, dani);
  await evento('participant_joined', ch, dani, await ingresoDe(dani));
  enLiveKit = [{ idUsuario: eli.id, ingreso: 'sin-registro' }];
  await calls.reconciliarLlamadas();
  assert.deepEqual(await participantes(ch), []);
  assert.deepEqual(expulsados, [[ch.id, eli.id]]);

  await entrar(ch, ana);
  await prisma.participanteLlamada.update({ where: { idUsuario: ana.id }, data: { fechaAutorizacion: new Date(Date.now() - 11 * 60 * 1000) } });
  await calls.reconciliarLlamadas();
  assert.equal(await prisma.participanteLlamada.count(), 0);
});
