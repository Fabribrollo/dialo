import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

// Verificación contra la API en ejecución. Solo utiliza cuentas nuevas de prueba.
const baseUrl = process.env.DIALO_TEST_API_URL || 'http://localhost:3000';
const sockets = [];
const nonce = randomUUID().replaceAll('-', '').slice(0, 12);
const accounts = [];

async function http(path, { as, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(as ? { Cookie: as.cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return { body: result, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

function ack(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
  });
}

async function connect(account) {
  const socket = io(baseUrl, {
    transports: ['websocket'], extraHeaders: { Cookie: account.cookie },
    reconnection: false, forceNew: true, timeout: 5000,
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  // Espera la inicialización de rooms mediante una petición sin efectos.
  const result = await ack(socket, 'message:send', {});
  assert.equal(result.error.code, 'VALIDATION_ERROR');
  return socket;
}

function arrival(socket, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`No llegó ${event}`));
    }, 5000);
    function handler(data) { clearTimeout(timeout); resolve(data); }
    socket.once(event, handler);
  });
}

try {
  for (const suffix of ['a', 'b', 'c']) {
    const nombreUsuario = `t11_${nonce}_${suffix}`;
    const created = await http('/auth/register', {
      method: 'POST', body: {
        nombreUsuario, correo: `${nombreUsuario}@example.test`,
        nombreVisible: `Prueba T11 ${suffix}`, contrasena: randomUUID(),
      },
    });
    accounts.push({ ...created.body.usuario, cookie: created.cookie });
  }
  const [a, b, outsider] = accounts;
  const request = await http('/friends/requests', { as: a, method: 'POST', body: { idReceptor: b.id } });
  await http(`/friends/requests/${request.body.solicitud.id}/accept`, { as: b, method: 'POST' });
  const clients = await Promise.all([connect(a), connect(a), connect(b), connect(outsider)]);
  const foreignEvents = [];
  for (const event of ['message:new', 'message:updated', 'message:deleted']) {
    clients[3].on(event, (data) => foreignEvents.push({ event, data }));
  }
  const created = await http('/conversations', { as: a, method: 'POST', body: { idUsuario: b.id } });
  const chatId = created.body.conversacion.id;
  let received = clients.slice(0, 3).map((s) => arrival(s, 'message:new'));
  const sent = await ack(clients[0], 'message:send', { idConversacion: chatId, contenido: 'Mensaje de prueba T11' });
  assert.equal(sent.ok, true);
  assert.equal(sent.data.mensaje.idAutor, a.id);
  for (const event of await Promise.all(received)) assert.deepEqual(event, sent.data);
  const messageId = sent.data.mensaje.id;
  const denied = await ack(clients[3], 'message:send', { idConversacion: chatId, contenido: 'No permitido' });
  assert.equal(denied.error.code, 'NOT_PARTICIPANT');
  const notAuthor = await ack(clients[2], 'message:edit', { idMensaje: messageId, contenido: 'No permitido', idAutor: a.id });
  assert.equal(notAuthor.error.code, 'NOT_AUTHOR');

  received = clients.slice(0, 3).map((s) => arrival(s, 'message:updated'));
  const edited = await ack(clients[1], 'message:edit', { idMensaje: messageId, contenido: 'Mensaje corregido T11' });
  assert.equal(edited.ok, true);
  assert.ok(edited.data.mensaje.fechaEdicion);
  for (const event of await Promise.all(received)) assert.deepEqual(event, edited.data);

  await http(`/friends/${b.id}`, { as: a, method: 'DELETE' });
  const noFriend = await ack(clients[0], 'message:send', { idConversacion: chatId, contenido: 'Ya no son amigos' });
  assert.equal(noFriend.error.code, 'NOT_FRIENDS');

  received = clients.slice(0, 3).map((s) => arrival(s, 'message:deleted'));
  const deleted = await ack(clients[0], 'message:delete', { idMensaje: messageId });
  assert.deepEqual(deleted, { ok: true, data: { idMensaje: messageId } });
  for (const event of await Promise.all(received)) assert.deepEqual(event, { idMensaje: messageId, idConversacion: chatId });
  const alreadyDeleted = await ack(clients[0], 'message:edit', { idMensaje: messageId, contenido: 'No resucitar' });
  assert.equal(alreadyDeleted.error.code, 'MESSAGE_DELETED');
  const history = await http(`/conversations/${chatId}/messages`, { as: b });
  assert.equal(history.body.items.length, 1);
  assert.equal(history.body.items[0].contenido, null);
  assert.equal(history.body.items[0].eliminado, true);
  const detail = await http(`/conversations/${chatId}`, { as: a });
  assert.equal(detail.body.conversacion.puedeEscribir, false);
  await http('/auth/logout', { as: a, method: 'POST' });
  const expired = await ack(clients[0], 'message:delete', { idMensaje: messageId });
  assert.equal(expired.error.code, 'UNAUTHORIZED');
  assert.deepEqual(foreignEvents, []);
  console.log('T-11 OK: envío, edición, eliminación, varias pestañas, permisos, amistad, historial y logout.');
  console.log(`Conversación de prueba: ${chatId}. Usuarios de prueba: ${accounts.map((a) => a.nombreUsuario).join(', ')}.`);
} catch (error) {
  console.error(`T-11 FALLÓ: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const socket of sockets) socket.disconnect();
  for (const account of accounts) {
    try { await http('/auth/logout', { as: account, method: 'POST' }); } catch { /* Una sesión ya revocada puede devolver 401. */ }
  }
}
