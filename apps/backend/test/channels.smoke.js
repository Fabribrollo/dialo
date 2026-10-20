import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const base = (process.env.DIALO_TEST_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const prefix = `t22_${randomUUID().slice(0, 8)}`;
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
    nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: `T22${randomUUID()}!`,
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
  const created = await request('/communities', { method: 'POST', as: a, body: { nombre: `Canales ${prefix}`, tipo: 'PRIVADA' } });
  assert.equal(created.status, 201); communityId = created.data.comunidad.id;
  const path = `/communities/${communityId}/channels`;
  const invitation = await request(`/communities/${communityId}/invitations`, { method: 'POST', as: a, body: { duracionHoras: 1, usosMaximos: 1 } });
  assert.equal(invitation.status, 201);
  assert.equal((await request(`/invitations/${invitation.data.invitacion.codigo}/accept`, { method: 'POST', as: b })).status, 201);
  const clients = await Promise.all([a, a, b, c].map(socketFor));
  const recorded = clients.map(capture);
  const make = async (nombre, tipo = 'TEXTO', privado = false) => {
    const response = await request(path, { method: 'POST', as: a, body: { nombre, tipo, privado } });
    assert.equal(response.status, 201, `Falló crear canal ${nombre}`);
    return response.data.canal;
  };
  const visible = await make('avisos'), hidden = await make('privado', 'TEXTO', true);
  const voice = await make('charla', 'VOZ'), video = await make('reunion', 'VIDEO');
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, { as: c })).status, 404);
  assert.equal((await request(`/channels/${hidden.id}`, { as: b })).status, 404);
  assert.equal((await request(path, { method: 'POST', as: b, body: { nombre: 'no', tipo: 'TEXTO' } })).status, 403);
  const memberList = await request(path, { as: b });
  assert.equal(memberList.status, 200); assert(!memberList.data.items.some((i) => i.id === hidden.id));
  assert.deepEqual(memberList.data.items.find((i) => i.id === voice.id).misPermisos, ['VER', 'HABLAR']);
  assert.equal((await request(`/channels/${visible.id}`, { method: 'PATCH', as: a, body: { nombre: 'actualizado' } })).status, 200);
  assert.equal((await request(`/channels/${visible.id}`, { as: a })).data.canal.nombre, 'actualizado');
  assert.equal((await request(`/channels/${voice.id}`, { method: 'PATCH', as: a, body: { tipo: 'VIDEO' } })).status, 200);
  const parallel = await Promise.all(Array.from({ length: 4 }, (_, n) => make(`paralelo-${n}`)));
  assert.equal(new Set(parallel.map((i) => i.posicion)).size, 4, 'Las creaciones concurrentes repitieron posición');
  const ids = (await request(path, { as: a })).data.items.map((i) => i.id);
  const order = [...ids].reverse();
  assert.equal((await request(`${path}/order`, { method: 'PUT', as: a, body: { orden: order } })).status, 204);
  const listed = (await request(path, { as: a })).data.items;
  assert.deepEqual(listed.map((i) => i.id), order);
  assert.deepEqual(listed.map((i) => i.posicion), order.map((_, n) => n));
  const invalid = await request(`${path}/order`, { method: 'PUT', as: a, body: { orden: [ids[0], ids[0]] } });
  assert.equal(invalid.status, 400); assert.equal(invalid.data.error.code, 'INVALID_ORDER');
  const rotated = [...ids.slice(1), ids[0]];
  const concurrentOrders = await Promise.all([order, rotated].map((orden) => request(`${path}/order`, { method: 'PUT', as: a, body: { orden } })));
  assert(concurrentOrders.every((result) => result.status === 204), 'Falló un reordenamiento concurrente');
  const finalOrder = (await request(path, { as: a })).data.items;
  assert([JSON.stringify(order), JSON.stringify(rotated)].includes(JSON.stringify(finalOrder.map((i) => i.id))), 'Los órdenes concurrentes quedaron mezclados');
  const [extra, racingOrder] = await Promise.all([
    make('crear-durante-orden'),
    request(`${path}/order`, { method: 'PUT', as: a, body: { orden: order } }),
  ]);
  assert([204, 400].includes(racingOrder.status), 'La creación simultánea produjo un error de orden inesperado');
  if (racingOrder.status === 400) assert.equal(racingOrder.data.error.code, 'INVALID_ORDER');
  const afterRace = (await request(path, { as: a })).data.items;
  assert(afterRace.some((item) => item.id === extra.id));
  assert.equal(new Set(afterRace.map((item) => item.posicion)).size, afterRace.length, 'La creación y el orden simultáneos repitieron posiciones');
  await Promise.all(clients.map(ready));
  for (let n = 0; n < 3; n++) assert(recorded[n].some((e) => e.event === 'channel:created' && e.data.canal.id === visible.id));
  assert(!recorded[2].some((e) => e.data.canal?.id === hidden.id));
  assert(!recorded[2].find((e) => e.event === 'channels:reordered').data.orden.includes(hidden.id));
  assert.deepEqual(recorded[3], []);
  recorded.forEach((r) => r.splice(0));
  await request(`/channels/${visible.id}`, { method: 'PATCH', as: a, body: { privado: true } });
  await Promise.all(clients.map(ready));
  assert(recorded[2].some((e) => e.event === 'channel:access-lost' && e.data.idCanal === visible.id));
  assert.equal((await request(`/channels/${visible.id}`, { as: b })).status, 404);
  assert.equal((await request(`/channels/${video.id}`, { method: 'DELETE', as: a })).status, 204);
  assert.equal((await request(`/channels/${video.id}`, { as: a })).status, 404);
  assert.equal((await request(`/communities/${communityId}/leave`, { method: 'POST', as: b })).status, 204);
  assert.equal((await request(path, { as: b })).status, 404);
  console.log('T-22 OK: tipos, CRUD, persistencia, permisos, canales privados, posiciones concurrentes, orden completo, eventos, varias pestañas y abandono.');
} catch (error) { console.error(`T-22 FALLÓ: ${error.message}`); process.exitCode = 1; }
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
