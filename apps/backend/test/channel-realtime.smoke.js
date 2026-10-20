import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const base = (process.env.DIALO_TEST_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const prefix = `t26_${randomUUID().slice(0, 8)}`;
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
    nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: `T26${randomUUID()}!`,
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
  socket.onAny((event, data) => { if (event.startsWith('channel-message:')) collected.push({ event, data }); });
  return collected;
}

try {
  const a = await register('a'), b = await register('b'), c = await register('c');
  const created = await request('/communities', { method: 'POST', as: a, body: { nombre: `Mensajes ${prefix}`, tipo: 'PRIVADA' } });
  assert.equal(created.status, 201); communityId = created.data.comunidad.id;
  const invite = await request(`/communities/${communityId}/invitations`, { method: 'POST', as: a, body: { duracionHoras: 1, usosMaximos: 1 } });
  assert.equal(invite.status, 201);
  assert.equal((await request(`/invitations/${invite.data.invitacion.codigo}/accept`, { method: 'POST', as: b })).status, 201);
  const make = await request(`/communities/${communityId}/channels`, { method: 'POST', as: a, body: { nombre: 'mensajes', tipo: 'TEXTO' } });
  assert.equal(make.status, 201); const ch = make.data.canal;
  const clients = await Promise.all([a, a, b, b, c].map(socketFor)), recorded = clients.map(capture);
  const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(20000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
  const join = (socket) => ack(socket, 'channel:subscribe', { idCanal: ch.id });
  const send = (socket, contenido) => ack(socket, 'channel-message:send', { idCanal: ch.id, contenido });
  const edit = (socket, idMensaje, contenido) => ack(socket, 'channel-message:edit', { idMensaje, contenido });
  const remove = (socket, idMensaje) => ack(socket, 'channel-message:delete', { idMensaje });
  const flush = async () => { await Promise.all(clients.filter((s) => s.connected).map(ready)); };
  const messages = (n) => recorded[n].filter((e) => e.event.startsWith('channel-message:'));
  const clear = () => recorded.forEach((r) => r.splice(0));
  const history = async (query = '') => {
    const r = await request(`/channels/${ch.id}/messages${query ? `?${query}` : ''}`, { as: a }); assert.equal(r.status, 200); return r.data;
  };
  const access = async (habilitaciones) => {
    const r = await request(`/channels/${ch.id}/access`, { method: 'PUT', as: a, body: { privado: true, habilitaciones } }); assert.equal(r.status, 200);
  };
  for (const socket of clients.slice(0, 4)) assert.equal((await join(socket)).ok, true);
  assert.equal((await join(clients[4])).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await send(clients[4], 'No permitido')).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await ack(clients[0], 'channel-message:send', { idCanal: ch.id, contenido: 'No suplantar', idAutor: b.id })).error.code, 'VALIDATION_ERROR');
  const first = await send(clients[2], ' Hola canal '); assert.equal(first.ok, true); const m = first.data.mensaje;
  assert.equal(m.autor.id, b.id); assert.equal(m.contenido, 'Hola canal'); assert.equal(m.autor.correo, undefined);
  await flush();
  for (let n = 0; n < 4; n++) assert.equal(messages(n).filter((e) => e.event === 'channel-message:new' && e.data.mensaje.id === m.id).length, 1);
  assert.deepEqual(recorded[4], []);
  const second = await send(clients[0], 'Segundo'), third = await send(clients[0], 'Tercero'); assert(second.ok && third.ok);
  const page1 = await history('limit=2'), page2 = await history(`limit=2&cursor=${page1.nextCursor}`);
  assert.deepEqual([...page1.items, ...page2.items].map((i) => i.id), [third.data.mensaje.id, second.data.mensaje.id, m.id]); assert.equal(page2.nextCursor, null);
  assert.equal((await edit(clients[0], m.id, 'No soy autor')).error.code, 'NOT_AUTHOR');
  assert.equal((await edit(clients[2], m.id, 'Editado por autor')).ok, true);
  assert.equal((await history()).items.find((i) => i.id === m.id).contenido, 'Editado por autor');
  clear(); assert.equal((await remove(clients[0], m.id)).data.eliminadoPorModerador, true);
  await flush();
  for (let n = 0; n < 4; n++) {
    const event = messages(n).find((e) => e.event === 'channel-message:deleted' && e.data.idMensaje === m.id);
    assert(event); assert.equal(event.data.contenido, undefined);
  }
  const tombstone = (await history()).items.find((i) => i.id === m.id); assert.equal(tombstone.contenido, null); assert.equal(tombstone.eliminadoPorModerador, true);
  assert.equal((await edit(clients[2], m.id, 'No resucitar')).error.code, 'MESSAGE_DELETED');
  const own = (await send(clients[2], 'Borrado propio')).data.mensaje;
  assert.equal((await remove(clients[2], own.id)).data.eliminadoPorModerador, false);
  const racing = (await send(clients[0], 'Competencia')).data.mensaje; clear();
  const [edited, deleted] = await Promise.all([edit(clients[0], racing.id, 'Cambio concurrente'), remove(clients[1], racing.id)]);
  assert.equal(deleted.ok, true); assert(edited.ok || edited.error.code === 'MESSAGE_DELETED');
  await flush();
  for (let n = 0; n < 4; n++) {
    const events = messages(n), deletion = events.findIndex((e) => e.event === 'channel-message:deleted' && e.data.idMensaje === racing.id);
    assert(deletion >= 0); assert(!events.slice(deletion + 1).some((e) => e.event === 'channel-message:updated' && e.data.mensaje.id === racing.id));
  }
  const writeTarget = (await send(clients[2], 'Quedará de solo lectura')).data.mensaje;
  await access([{ rol: 'INTEGRANTE', permisos: ['VER'] }]);
  assert.equal((await send(clients[2], 'Bloqueado')).error.code, 'NO_WRITE_PERMISSION');
  assert.equal((await edit(clients[2], writeTarget.id, 'Bloqueado')).error.code, 'NO_WRITE_PERMISSION');
  clear(); assert.equal((await send(clients[0], 'Leen sin escribir')).ok, true); await flush();
  assert.equal(messages(2).length, 1); assert.equal(messages(3).length, 1);
  await access([]); clear(); assert.equal((await send(clients[0], 'Solo dueño')).ok, true); await flush();
  assert.equal(messages(2).length, 0); assert.equal(messages(3).length, 0);
  assert.equal((await send(clients[2], 'Sin VER')).error.code, 'CHANNEL_NOT_FOUND');
  assert.equal((await edit(clients[2], writeTarget.id, 'Sin VER')).error.code, 'MESSAGE_NOT_FOUND');
  await access([{ idUsuario: b.id, permisos: ['VER'] }]);
  for (const socket of clients.slice(2, 4)) assert.equal((await join(socket)).ok, true);
  clear(); await request('/auth/logout', { method: 'POST', as: b });
  assert.equal((await send(clients[0], 'Sin sesiones revocadas')).ok, true);
  for (let n = 0; n < 40 && (clients[2].connected || clients[3].connected); n++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(clients[2].connected, false); assert.equal(clients[3].connected, false);
  assert.equal(messages(2).length, 0); assert.equal(messages(3).length, 0); assert.deepEqual(recorded[4], []);
  console.log('T-26 OK: envío, edición propia, borrado propio/moderado, historial paginado, varias pestañas, concurrencia, permisos, revocación y sesiones receptoras.');
} catch (error) { console.error(`T-26 FALLÓ: ${error.message}`); process.exitCode = 1; }
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
