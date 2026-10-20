import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const base = (process.env.DIALO_TEST_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const prefix = `t23_${randomUUID().slice(0, 8)}`;
const users = [], sockets = [];
let communityId;

async function request(path, { method = 'GET', as, body } = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(suffix) {
  const nombreUsuario = `${prefix}_${suffix}`;
  const result = await request('/auth/register', { method: 'POST', body: {
    nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: `T23${randomUUID()}!`,
  } });
  assert.equal(result.status, 201, 'No se pudo registrar una cuenta de prueba');
  assert.ok(result.cookie, 'El registro no devolvió una sesión');
  const user = { ...result.data.usuario, cookie: result.cookie };
  users.push(user); return user;
}
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(8000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(new Error('El socket no respondió a la comprobación de inicialización'));
    if (reply.error?.code !== 'VALIDATION_ERROR') return reject(new Error('El socket no pudo verificar la sesión'));
    resolve();
  }));
}
async function socketFor(user) {
  const socket = io(base, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true, timeout: 8000 });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', () => reject(new Error('No se pudo conectar el socket de prueba'))); });
  await ready(socket);
  return socket;
}
function capture(socket) {
  const collected = [];
  socket.onAny((event, data) => { if (event.startsWith('channel:') || event === 'channels:reordered') collected.push({ event, data }); });
  return collected;
}

try {
  const a = await register('a'), b = await register('b'), c = await register('c');
  const created = await request('/communities', { method: 'POST', as: a, body: { nombre: `Acceso ${prefix}`, tipo: 'PRIVADA' } });
  assert.equal(created.status, 201); communityId = created.data.comunidad.id;
  const invite = await request(`/communities/${communityId}/invitations`, { method: 'POST', as: a, body: { duracionHoras: 1, usosMaximos: 1 } });
  assert.equal(invite.status, 201);
  assert.equal((await request(`/invitations/${invite.data.invitacion.codigo}/accept`, { method: 'POST', as: b })).status, 201);
  const made = await request(`/communities/${communityId}/channels`, { method: 'POST', as: a, body: { nombre: 'prueba-acceso', tipo: 'TEXTO', privado: true } });
  assert.equal(made.status, 201);
  const ch = made.data.canal, path = `/channels/${ch.id}`, accessPath = `${path}/access`;
  const set = (habilitaciones, privado = true, as = a) => request(accessPath, { method: 'PUT', as, body: { privado, habilitaciones } });
  const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(8000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
  const join = (socket) => ack(socket, 'channel:subscribe', { idCanal: ch.id });
  const clients = await Promise.all([a, b, b, c].map(socketFor)), recorded = clients.map(capture);
  assert.equal((await request(accessPath)).status, 401);
  assert.equal((await request(accessPath, { as: c })).status, 404);
  assert.equal((await join(clients[1])).error.code, 'CHANNEL_NOT_FOUND');
  const configured = await set([{ rol: 'INTEGRANTE', permisos: ['VER'] }]);
  assert.equal(configured.status, 200);
  assert.deepEqual((await request(accessPath, { as: a })).data.acceso, configured.data.acceso);
  assert.equal((await request(accessPath, { as: b })).status, 403);
  assert.equal((await set([], true, b)).status, 403);
  assert.equal((await set([{ idUsuario: c.id, permisos: ['VER'] }])).data.error.code, 'MEMBER_NOT_FOUND');
  assert.equal((await set([{ rol: 'ADMIN', permisos: ['VER'] }])).status, 400);
  assert.equal((await set([{ idUsuario: b.id, permisos: ['VER', 'VER'] }])).status, 400);
  for (const client of clients.slice(1, 3)) {
    const joined = await join(client);
    assert.equal(joined.ok, true); assert.deepEqual(joined.data.canal.misPermisos, ['VER']);
  }
  const upgraded = await set([{ rol: 'INTEGRANTE', permisos: ['VER'] }, { idUsuario: b.id, permisos: ['ESCRIBIR'] }]);
  assert.equal(upgraded.status, 200);
  const personal = upgraded.data.acceso.habilitaciones.find((g) => g.usuario);
  assert.deepEqual(personal.permisos, ['VER', 'ESCRIBIR']); assert.equal(personal.usuario.id, b.id); assert.equal(personal.usuario.correo, undefined);
  assert.deepEqual((await request(path, { as: b })).data.canal.misPermisos, ['VER', 'ESCRIBIR']);
  assert.equal((await set([{ rol: 'INTEGRANTE', permisos: ['VER'] }])).status, 200);
  assert.deepEqual((await join(clients[1])).data.canal.misPermisos, ['VER']);
  recorded.forEach((events) => events.splice(0));
  assert.equal((await set([])).status, 200);
  await Promise.all(clients.map(ready));
  for (let n = 1; n < 3; n++) {
    assert(recorded[n].some((e) => e.event === 'channel:access-lost' && e.data.idCanal === ch.id));
    assert.equal((await join(clients[n])).error.code, 'CHANNEL_NOT_FOUND');
  }
  assert.equal((await request(path, { as: b })).status, 404);
  assert(!(await request(`/communities/${communityId}/channels`, { as: b })).data.items.some((i) => i.id === ch.id));
  recorded.forEach((events) => events.splice(0));
  await set([{ idUsuario: b.id, permisos: ['VER'] }]);
  await Promise.all(clients.map(ready));
  for (let n = 1; n < 3; n++) {
    assert(recorded[n].some((e) => e.event === 'channel:updated' && e.data.canal.id === ch.id));
    assert.equal((await join(clients[n])).ok, true);
  }
  assert.deepEqual(recorded[3], []);
  assert.equal((await ack(clients[1], 'channel:unsubscribe', { idCanal: ch.id })).ok, true);
  // Competencia real de solicitudes: el resultado persistido debe ser un reemplazo completo.
  const configs = [[{ rol: 'INTEGRANTE', permisos: ['VER'] }], [{ idUsuario: b.id, permisos: ['ESCRIBIR'] }]];
  assert((await Promise.all(configs.map((grants) => set(grants)))).every((r) => r.status === 200));
  const final = (await request(accessPath, { as: a })).data.acceso.habilitaciones;
  assert.equal(final.length, 1, 'Se mezclaron dos reemplazos concurrentes');
  assert(final[0].rol === 'INTEGRANTE' || final[0].usuario?.id === b.id);
  await set([{ idUsuario: b.id, permisos: ['VER'] }]);
  await Promise.all([set([]), join(clients[1])]);
  assert.equal((await join(clients[1])).error.code, 'CHANNEL_NOT_FOUND');
  // Permisos de futuras llamadas, sin iniciar voz/video.
  const voice = await request(`/communities/${communityId}/channels`, { method: 'POST', as: a, body: { nombre: 'voz-acceso', tipo: 'VOZ', privado: true } });
  assert.equal(voice.status, 201);
  assert.equal((await request(`/channels/${voice.data.canal.id}/access`, { method: 'PUT', as: a, body: { privado: true, habilitaciones: [{ idUsuario: b.id, permisos: ['TRANSMITIR'] }] } })).status, 200);
  assert.deepEqual((await request(`/channels/${voice.data.canal.id}`, { as: b })).data.canal.misPermisos, ['VER', 'TRANSMITIR']);
  await set([{ idUsuario: b.id, permisos: ['VER'] }]);
  assert.equal((await request(`/communities/${communityId}/leave`, { method: 'POST', as: b })).status, 204);
  assert.equal((await join(clients[2])).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await request(accessPath, { as: a })).data.acceso.habilitaciones.length, 0);
  assert.equal((await request('/auth/logout', { method: 'POST', as: c })).status, 204);
  for (let n = 0; n < 40 && clients[3].connected; n++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(clients[3].connected, false);
  console.log('T-23 OK: configuración, validación, solo lectura, unión rol/usuario, permisos de voz, revocación y recuperación en varias pestañas, concurrencia, abandono y sesión.');
} catch (error) { console.error(`T-23 FALLÓ: ${error.message}`); process.exitCode = 1; }
finally {
  for (const socket of sockets) socket.disconnect();
  if (communityId && users[0]) {
    try {
      const result = await request(`/communities/${communityId}`, { method: 'DELETE', as: users[0] });
      if (![204, 404].includes(result.status)) { console.error(`No se pudo limpiar la comunidad de prueba ${communityId}.`); process.exitCode = 1; }
    } catch { console.error(`Quedó pendiente limpiar la comunidad de prueba ${communityId}.`); process.exitCode = 1; }
  }
  for (const user of users) { try { await request('/auth/logout', { method: 'POST', as: user }); } catch { /* servidor no disponible */ } }
  if (users.length) console.log(`Cuentas de prueba conservadas: ${users.map((u) => u.nombreUsuario).join(', ')}.`);
}
