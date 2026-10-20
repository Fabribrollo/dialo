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
const schema = `test_t15_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

// Salida de consola, para verificar que no se registren tokens.
const salida = [];
for (const metodo of ['log', 'info', 'warn', 'error']) {
  const original = console[metodo];
  console[metodo] = (...args) => {
    salida.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg))).join(' '));
    original(...args);
  };
}

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
const CONTRASENA = 'ClaveDePrueba123';
let prisma, io, server, baseUrl, hashToken, generateToken, revisarSesiones, ana, beto;
const sockets = [];
const tokensUsados = [];

async function request(path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: CONTRASENA } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, contrasena: CONTRASENA };
}
const tokenDe = (cookie) => decodeURIComponent(cookie.split('=').slice(1).join('='));
// Cada login crea una sesion nueva.
async function login(user) {
  const r = await request('/auth/login', { method: 'POST', body: { identificador: user.nombreUsuario, contrasena: user.contrasena } });
  assert.equal(r.status, 200);
  tokensUsados.push(tokenDe(r.cookie));
  return r.cookie;
}
const sesionDe = (cookie) => prisma.sesion.findUnique({ where: { hashToken: hashToken(tokenDe(cookie)) } });

// Espera a que el servidor una el socket a sus rooms.
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(error);
    assert.equal(reply.error.code, 'VALIDATION_ERROR'); resolve();
  }));
}
async function socketFor(cookie) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  socket.terminadas = [];
  socket.eventos = [];
  socket.on('session:ended', (data) => socket.terminadas.push(data));
  socket.onAny((event, data) => socket.eventos.push({ event, data }));
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await ready(socket);
  return socket;
}
function desconexion(socket, ms = 4000) {
  if (socket.disconnected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('el socket no se desconecto')), ms);
    socket.once('disconnect', () => { clearTimeout(timer); resolve(); });
  });
}
const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  ({ hashToken, generateToken } = await import('../src/utils/tokens.js'));
  ({ revisarSesiones } = await import('../src/sockets/emitter.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); beto = await register('beto');
});
beforeEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

test('el socket queda asociado a su sesion sin guardar el token', async () => {
  const cookie = await login(ana);
  const socket = await socketFor(cookie);
  const enServidor = io.sockets.sockets.get(socket.id);
  const sesion = await sesionDe(cookie);
  assert.equal(enServidor.data.auth.idSesion, sesion.id);
  assert(enServidor.rooms.has(`session:${sesion.id}`));
  assert(!JSON.stringify(enServidor.data).includes(tokenDe(cookie)));
});

test('logout desconecta todas las pestanas de esa sesion y conserva las otras sesiones', async () => {
  const cookieA = await login(ana), cookieB = await login(ana);
  const a1 = await socketFor(cookieA), a2 = await socketFor(cookieA);
  const b1 = await socketFor(cookieB), deBeto = await socketFor(await login(beto));

  assert.equal((await request('/auth/logout', { method: 'POST', cookie: cookieA })).status, 204);
  await Promise.all([desconexion(a1), desconexion(a2)]);
  assert.deepEqual(a1.terminadas, [{ motivo: 'LOGOUT' }]);
  assert.deepEqual(a2.terminadas, [{ motivo: 'LOGOUT' }]);

  await Promise.all([ready(b1), ready(deBeto)]);
  assert.deepEqual(b1.terminadas, []);
  assert.deepEqual(deBeto.terminadas, []);
  await assert.rejects(socketFor(cookieA));
});

test('una sesion revocada deja de recibir eventos privados', async () => {
  const cookieA = await login(ana), cookieB = await login(ana);
  const a = await socketFor(cookieA), b = await socketFor(cookieB);
  await request('/auth/logout', { method: 'POST', cookie: cookieA });
  await desconexion(a);

  const r = await request('/users/me', { method: 'PATCH', cookie: cookieB, body: { informacionPersonal: 'Cambio despues del logout' } });
  assert.equal(r.status, 200);
  await ready(b); await pausa(50);
  assert(b.eventos.some((e) => e.event === 'user:updated'));
  assert(!a.eventos.some((e) => e.event === 'user:updated'));
  const sesion = await sesionDe(cookieA);
  assert.equal((await io.in(`session:${sesion.id}`).fetchSockets()).length, 0);
});

test('restablecer la contrasena desconecta todas las sesiones anteriores del usuario', async () => {
  const c1 = await login(ana), c2 = await login(ana);
  const s1 = await socketFor(c1), s2 = await socketFor(c2), deBeto = await socketFor(await login(beto));

  const token = generateToken();
  tokensUsados.push(token);
  await prisma.recuperacionCuenta.create({ data: { idUsuario: ana.id, hashToken: hashToken(token), fechaExpiracion: new Date(Date.now() + 60_000) } });
  const nueva = 'OtraClaveDePrueba456';
  assert.equal((await request('/auth/reset-password', { method: 'POST', body: { token, contrasena: nueva } })).status, 204);
  ana.contrasena = nueva;

  await Promise.all([desconexion(s1), desconexion(s2)]);
  assert.deepEqual(s1.terminadas, [{ motivo: 'CONTRASENA_CAMBIADA' }]);
  assert.deepEqual(s2.terminadas, [{ motivo: 'CONTRASENA_CAMBIADA' }]);
  await ready(deBeto);
  assert.deepEqual(deBeto.terminadas, []);
  await assert.rejects(socketFor(c1));
  await socketFor(await login(ana));
});

test('una sesion que vence se desconecta sin esperar un mensaje del cliente', async () => {
  const cookie = await login(beto);
  await prisma.sesion.update({ where: { hashToken: hashToken(tokenDe(cookie)) }, data: { fechaExpiracion: new Date(Date.now() + 2000) } });
  const socket = await socketFor(cookie);
  await desconexion(socket, 6000);
  assert.deepEqual(socket.terminadas, [{ motivo: 'EXPIRADA' }]);
});

test('el barrido corta una sesion revocada por fuera de la API', async () => {
  const cookie = await login(beto), otra = await login(beto);
  const revocado = await socketFor(cookie), sigue = await socketFor(otra);
  await prisma.sesion.update({ where: { hashToken: hashToken(tokenDe(cookie)) }, data: { fechaRevocacion: new Date() } });
  await revisarSesiones();
  await desconexion(revocado);
  assert.deepEqual(revocado.terminadas, [{ motivo: 'REVOCADA' }]);
  await ready(sigue);
  assert.deepEqual(sigue.terminadas, []);
});

test('no registra tokens ni cookies en la consola', () => {
  const texto = salida.join('\n');
  assert(!texto.includes('dialo_sid='));
  for (const token of tokensUsados) assert(!texto.includes(token));
});
