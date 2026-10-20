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
const schema = `test_t26_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, io, server, baseUrl, ana, beto, cata, dani, eli;
const sockets = [];
const events = ['channel-message:new', 'channel-message:updated', 'channel-message:deleted', 'channel:access-lost'];

async function request(path, { method = 'GET', body, as, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const response = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(response.status, 201);
  return { ...response.body.usuario, cookie: response.cookie };
}
async function community(tipo = 'PRIVADA') {
  const result = await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Comunidad canales', tipo } });
  assert.equal(result.status, 201);
  const c = result.body.comunidad;
  for (const [user, rol] of [[beto, 'ADMIN'], [cata, 'MODERADOR'], [dani, 'INTEGRANTE']]) {
    await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
  }
  return c;
}
async function create(c, datos = {}, as = ana) {
  const response = await request(`/communities/${c.id}/channels`, { method: 'POST', as, body: { nombre: 'avisos', tipo: 'TEXTO', ...datos } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.canal;
}
async function list(c, as = ana) {
  const response = await request(`/communities/${c.id}/channels`, { as });
  assert.equal(response.status, 200);
  return response.body.items;
}
function ready(socket) {
  return new Promise((resolve, reject) => socket.timeout(4000).emit('message:send', {}, (error, reply) => {
    if (error) return reject(error);
    assert.equal(reply.error.code, 'VALIDATION_ERROR'); resolve();
  }));
}
async function socketFor(user) {
  const socket = connectSocket(baseUrl, { transports: ['websocket'], extraHeaders: { Cookie: user.cookie }, reconnection: false, forceNew: true });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  await ready(socket);
  return socket;
}
function capture(socket) {
  const output = [];
  socket.onAny((event, data) => { if (events.includes(event)) output.push({ event, data }); });
  return output;
}
async function flush(...clients) { await Promise.all(clients.map(ready)); await new Promise((resolve) => setTimeout(resolve, 20)); }

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); beto = await register('beto'); cata = await register('cata'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => {
  for (const socket of sockets.splice(0)) socket.disconnect();
  await prisma.comunidad.deleteMany();
  for (const user of [ana, beto, cata, dani, eli]) {
    const login = await request('/auth/login', { method: 'POST', body: { identificador: user.nombreUsuario, contrasena: 'ClaveDePrueba123' } });
    assert.equal(login.status, 200); user.cookie = login.cookie;
  }
  await prisma.conversacionPrivada.deleteMany();
});
after(async () => {
  for (const socket of sockets) socket.disconnect();
  if (io) await new Promise((resolve) => io.close(resolve));
  else if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const ack = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(8000).emit(event, payload, (error, reply) => error ? reject(error) : resolve(reply)));
const send = (socket, ch, contenido = 'Hola') => ack(socket, 'channel-message:send', { idCanal: ch.id, contenido });
const edit = (socket, idMensaje, contenido = 'Editado') => ack(socket, 'channel-message:edit', { idMensaje, contenido });
const remove = (socket, idMensaje) => ack(socket, 'channel-message:delete', { idMensaje });
async function subscribe(user, ch) { const socket = await socketFor(user); assert.equal((await ack(socket, 'channel:subscribe', { idCanal: ch.id })).ok, true); return socket; }
const history = async (ch, as = ana) => (await request(`/channels/${ch.id}/messages`, { as })).body;
async function access(ch, habilitaciones, privado = true) {
  const r = await request(`/channels/${ch.id}/access`, { method: 'PUT', as: ana, body: { privado, habilitaciones } }); assert.equal(r.status, 200);
}
const stored = (ch, user = dani, data = {}) => prisma.mensaje.create({ data: { idCanal: ch.id, idAutor: user.id, contenido: 'Original', ...data } });
const messageEvents = (events) => events.filter((e) => e.event.startsWith('channel-message:'));

test('envía con identidad de sesión, persiste y entrega una vez a cada pestaña suscripta', async () => {
  const c = await community(), ch = await create(c);
  const clients = await Promise.all([ana, ana, dani].map((user) => subscribe(user, ch)));
  const quiet = await socketFor(beto), outsider = await socketFor(eli);
  const recorded = [...clients, quiet, outsider].map(capture);
  const reply = await send(clients[0], ch, '  Hola canal  '); assert.equal(reply.ok, true);
  const m = reply.data.mensaje; assert.equal(m.contenido, 'Hola canal'); assert.equal(m.autor.id, ana.id);
  assert.equal(m.idCanal, ch.id); assert.equal(m.idConversacion, undefined); assert.equal(m.autor.correo, undefined);
  assert.equal((await prisma.mensaje.findUnique({ where: { id: m.id } })).idAutor, ana.id);
  await flush(...clients, quiet, outsider);
  for (const events of recorded.slice(0, 3)) assert.deepEqual(messageEvents(events), [{ event: 'channel-message:new', data: { mensaje: m } }]);
  assert.deepEqual(recorded[3], []); assert.deepEqual(recorded[4], []);
  assert.deepEqual((await history(ch)).items[0], m);
});
test('la room no es autorización: un socket ajeno unido por error no recibe contenido', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  const a = await subscribe(ana, ch), outsider = await socketFor(eli), recorded = capture(outsider);
  await io.sockets.sockets.get(outsider.id).join(`channel:${ch.id}`);
  assert.equal((await send(a, ch)).ok, true); await flush(a, outsider);
  assert.deepEqual(recorded, []); assert(!io.sockets.sockets.get(outsider.id).rooms.has(`channel:${ch.id}`));
});
test('payloads estrictos rechazan identidad, campos ajenos, IDs inválidos y contenidos fuera de rango', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch), recorded = capture(a);
  for (const payload of [null, {}, { idCanal: ch.id, contenido: '' }, { idCanal: ch.id, contenido: '  ' }, { idCanal: ch.id, contenido: 'a'.repeat(2001) },
    { idCanal: ch.id, contenido: 42 }, { idCanal: '1', contenido: 'hola' }, { idCanal: 0, contenido: 'hola' }, { idCanal: 2_147_483_648, contenido: 'hola' },
    { idCanal: ch.id, contenido: 'hola', idAutor: beto.id }, { idCanal: ch.id, contenido: 'hola', rol: 'ADMIN' }]) {
    const r = await ack(a, 'channel-message:send', payload); assert.equal(r.error.code, 'VALIDATION_ERROR'); assert(Array.isArray(r.error.details));
  }
  for (const event of ['channel-message:edit', 'channel-message:delete']) {
    for (const payload of [{}, { idMensaje: '1' }, { idMensaje: -1 }, { idMensaje: 1, idUsuario: ana.id }]) {
      assert.equal((await ack(a, event, payload)).error.code, 'VALIDATION_ERROR');
    }
  }
  await flush(a); assert.deepEqual(recorded, []); assert.equal(await prisma.mensaje.count({ where: { idCanal: ch.id } }), 0);
  assert.equal((await send(a, ch, 'a'.repeat(2000))).ok, true);
});
test('solo VER no permite enviar, editar ni eliminar mensajes propios', async () => {
  const c = await community(), ch = await create(c, { privado: true }); const original = await stored(ch);
  await access(ch, [{ rol: 'INTEGRANTE', permisos: ['VER'] }]); const d = await subscribe(dani, ch);
  assert.equal((await send(d, ch)).error.code, 'NO_WRITE_PERMISSION');
  assert.equal((await edit(d, original.id)).error.code, 'NO_WRITE_PERMISSION');
  assert.equal((await remove(d, original.id)).error.code, 'CANNOT_DELETE_MESSAGE');
});
test('voz/video rechazan mensajes y canales ocultos no revelan el tipo', async () => {
  const c = await community(), a = await socketFor(ana), e = await socketFor(eli);
  for (const tipo of ['VOZ', 'VIDEO']) { const ch = await create(c, { tipo }); assert.equal((await send(a, ch)).error.code, 'CHANNEL_NOT_TEXT'); assert.equal((await send(e, ch)).error.code, 'CHANNEL_NOT_FOUND'); }
});
test('solo el autor edita y el DTO del evento coincide con historial sin secretos', async () => {
  const c = await community(), ch = await create(c); const d = await subscribe(dani, ch), a = await subscribe(ana, ch), mod = await subscribe(cata, ch);
  const m = (await send(d, ch)).data.mensaje; const logs = capture(a);
  assert.equal((await edit(a, m.id)).error.code, 'NOT_AUTHOR'); assert.equal((await edit(mod, m.id)).error.code, 'NOT_AUTHOR');
  const r = await edit(d, m.id, ' actualizado '); assert.equal(r.ok, true); assert.equal(r.data.mensaje.contenido, 'actualizado'); assert(r.data.mensaje.fechaEdicion);
  await flush(a, d, mod); assert.equal(messageEvents(logs).length, 1); assert.equal(messageEvents(logs)[0].event, 'channel-message:updated');
  assert.deepEqual((await history(ch)).items[0], r.data.mensaje);
});
test('borrado propio es lógico, conserva auditoría y nunca emite contenido eliminado', async () => {
  const c = await community(), ch = await create(c), d = await subscribe(dani, ch), a = await subscribe(ana, ch);
  const m = (await send(d, ch, 'No divulgar borrado')).data.mensaje; const events = capture(a);
  const r = await remove(d, m.id); assert.equal(r.ok, true); assert.equal(r.data.eliminadoPorModerador, false);
  const row = await prisma.mensaje.findUnique({ where: { id: m.id } }); assert(row.fechaEliminacion); assert.equal(row.idUsuarioEliminacion, dani.id); assert.equal(row.contenido, 'No divulgar borrado');
  await flush(a, d); assert.deepEqual(messageEvents(events), [{ event: 'channel-message:deleted', data: { idMensaje: m.id, idCanal: ch.id, eliminadoPorModerador: false } }]);
  const dto = (await history(ch)).items[0]; assert.equal(dto.contenido, null); assert.equal(dto.eliminado, true); assert.equal(dto.eliminadoPorModerador, false);
  assert.equal((await edit(d, m.id)).error.code, 'MESSAGE_DELETED'); assert.equal((await remove(d, m.id)).error.code, 'MESSAGE_DELETED');
});
test('moderador con VER puede eliminar a un rol menor sin ESCRIBIR y no puede editarlo', async () => {
  const c = await community(), ch = await create(c, { privado: true });
  await access(ch, [{ rol: 'MODERADOR', permisos: ['VER'] }, { rol: 'INTEGRANTE', permisos: ['ESCRIBIR'] }]);
  const d = await subscribe(dani, ch), mod = await subscribe(cata, ch); const m = (await send(d, ch)).data.mensaje;
  assert.equal((await edit(mod, m.id)).error.code, 'NOT_AUTHOR'); assert.equal((await remove(mod, m.id)).ok, true);
  const row = await prisma.mensaje.findUnique({ where: { id: m.id } }); assert.equal(row.idUsuarioEliminacion, cata.id);
  assert.equal((await history(ch)).items[0].eliminadoPorModerador, true);
});
test('moderación exige jerarquía estricta: no alcanza ver/escribir ni tener el mismo rol', async () => {
  const c = await community(), ch = await create(c); const a = await subscribe(ana, ch), adminSocket = await subscribe(beto, ch), mod = await subscribe(cata, ch), d = await subscribe(dani, ch);
  const cases = [[mod, ana, false], [mod, beto, false], [adminSocket, ana, false], [adminSocket, cata, true], [a, beto, true], [d, cata, false]];
  for (const [actor, author, allowed] of cases) { const m = await stored(ch, author); const r = await remove(actor, m.id); assert.equal(r.ok, allowed); if (!allowed) assert.equal(r.error.code, 'CANNOT_DELETE_MESSAGE'); }
  await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: eli.id, rol: 'MODERADOR' } });
  const peerMod = await socketFor(eli); assert.equal((await remove(peerMod, (await stored(ch, cata)).id)).error.code, 'CANNOT_DELETE_MESSAGE');
  await prisma.membresia.update({ where: { idComunidad_idUsuario: { idComunidad: c.id, idUsuario: eli.id } }, data: { rol: 'ADMIN' } });
  assert.equal((await remove(peerMod, (await stored(ch, beto)).id)).error.code, 'CANNOT_DELETE_MESSAGE');
});
test('habilitación individual no concede moderación y moderador sin acceso no opera', async () => {
  const c = await community(), ch = await create(c, { privado: true }); const m = await stored(ch, beto);
  await access(ch, [{ idUsuario: dani.id, permisos: ['VER', 'ESCRIBIR'] }]); const d = await subscribe(dani, ch), mod = await socketFor(cata);
  assert.equal((await remove(d, m.id)).error.code, 'CANNOT_DELETE_MESSAGE'); assert.equal((await remove(mod, m.id)).error.code, 'MESSAGE_NOT_FOUND');
});
test('autor que abandonó puede ser moderado por quien conserva autoridad en el canal', async () => {
  const c = await community(), ch = await create(c), m = await stored(ch), mod = await subscribe(cata, ch);
  await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani }); assert.equal((await remove(mod, m.id)).ok, true);
});
test('IDs inexistentes, de chat privado y de canal oculto no permiten editar/eliminar', async () => {
  const c = await community(), ch = await create(c, { privado: true }), m = await stored(ch);
  const conv = await prisma.conversacionPrivada.create({ data: { idUsuarioA: ana.id, idUsuarioB: beto.id } });
  const privateMessage = await prisma.mensaje.create({ data: { idConversacion: conv.id, idAutor: ana.id, contenido: 'Privado' } });
  const d = await socketFor(dani), a = await socketFor(ana);
  for (const actor of [d, a]) for (const id of [2_147_483_647, privateMessage.id]) { assert.equal((await edit(actor, id)).error.code, 'MESSAGE_NOT_FOUND'); assert.equal((await remove(actor, id)).error.code, 'MESSAGE_NOT_FOUND'); }
  assert.equal((await edit(d, m.id)).error.code, 'MESSAGE_NOT_FOUND'); assert.equal((await remove(d, m.id)).error.code, 'MESSAGE_NOT_FOUND');
  assert.equal((await prisma.mensaje.findUnique({ where: { id: privateMessage.id } })).contenido, 'Privado');
});
test('al perder VER salen todas las pestañas y no reciben operaciones posteriores', async () => {
  const c = await community(), ch = await create(c, { privado: true }); await access(ch, [{ rol: 'INTEGRANTE', permisos: ['ESCRIBIR'] }]);
  const a = await subscribe(ana, ch), d1 = await subscribe(dani, ch), d2 = await subscribe(dani, ch);
  const m = (await send(d1, ch)).data.mensaje, logs = [capture(d1), capture(d2)];
  await access(ch, []); assert.equal((await send(a, ch)).ok, true);
  assert.equal((await send(d1, ch)).error.code, 'CHANNEL_NOT_FOUND'); assert.equal((await edit(d2, m.id)).error.code, 'MESSAGE_NOT_FOUND');
  await flush(a, d1, d2); for (const events of logs) { assert(events.some((e) => e.event === 'channel:access-lost')); assert.deepEqual(messageEvents(events), []); }
  await access(ch, [{ idUsuario: dani.id, permisos: ['VER'] }]);
  assert.equal((await ack(d1, 'channel:subscribe', { idCanal: ch.id })).ok, true); const recovery = capture(d1);
  await send(a, ch); await flush(a, d1); assert.equal(messageEvents(recovery).length, 1);
});
test('retirar solo ESCRIBIR mantiene eventos de lectura y rechaza envíos posteriores', async () => {
  const c = await community(), ch = await create(c, { privado: true }); await access(ch, [{ rol: 'INTEGRANTE', permisos: ['ESCRIBIR'] }]);
  const a = await subscribe(ana, ch), d = await subscribe(dani, ch), logs = capture(d);
  await access(ch, [{ rol: 'INTEGRANTE', permisos: ['VER'] }]); assert.equal((await send(d, ch)).error.code, 'NO_WRITE_PERMISSION');
  await send(a, ch); await flush(a, d); assert.equal(messageEvents(logs).length, 1);
});
test('abandonar impide nuevas operaciones y entregas sin reconectar', async () => {
  const c = await community(), ch = await create(c), d = await subscribe(dani, ch), a = await subscribe(ana, ch), logs = capture(d);
  await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani }); await send(a, ch);
  assert.equal((await send(d, ch)).error.code, 'CHANNEL_NOT_FOUND'); await flush(a, d); assert.deepEqual(messageEvents(logs), []);
});
test('logout del emisor desconecta la sesion sin esperar otra operacion', async () => {
  const c = await community(), ch = await create(c), d = await subscribe(dani, ch);
  await request('/auth/logout', { method: 'POST', as: dani });
  await waitDisconnected(d); assert.equal(await prisma.mensaje.count({ where: { idCanal: ch.id } }), 0);
});
async function waitDisconnected(socket) { for (let n = 0; n < 30 && socket.connected; n++) await new Promise((r) => setTimeout(r, 10)); assert.equal(socket.connected, false); }
test('una sesión receptora vencida no recibe contenido; otra sesión válida del mismo usuario sí', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch), old = await subscribe(beto, ch);
  const login = await request('/auth/login', { method: 'POST', body: { identificador: beto.nombreUsuario, contrasena: 'ClaveDePrueba123' } });
  const current = await subscribe({ ...beto, cookie: login.cookie }, ch), oldLogs = capture(old), currentLogs = capture(current);
  const { hashToken } = await import('../src/utils/tokens.js');
  await prisma.sesion.update({ where: { hashToken: hashToken(beto.cookie.split('=')[1]) }, data: { fechaExpiracion: new Date(0) } });
  assert.equal((await send(a, ch, 'Solo sesiones vigentes')).ok, true); await waitDisconnected(old); await flush(a, current);
  assert.deepEqual(messageEvents(oldLogs), []); assert.equal(messageEvents(currentLogs).length, 1);
});
test('logout de un receptor ya conectado impide contenido incluso sin operar desde su socket', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch), d = await subscribe(dani, ch), logs = capture(d);
  await request('/auth/logout', { method: 'POST', as: dani }); await send(a, ch); await waitDisconnected(d);
  assert.deepEqual(messageEvents(logs), []);
});
test('sesión revocada mientras espera la cola no persiste un envío', async () => {
  const c = await community(), ch = await create(c), d = await socketFor(dani);
  const { withCommunityChannelsLock } = await import('../src/utils/communityChannelsLock.js');
  let release, entered; const gate = new Promise((r) => { release = r; }); const started = new Promise((r) => { entered = r; });
  const hold = withCommunityChannelsLock(c.id, async () => true, undefined, async () => { entered(); await gate; });
  await started;
  // El logout desconecta el socket: el ack puede no llegar.
  const sending = send(d, ch).catch(() => null); await new Promise((r) => setTimeout(r, 30));
  try { await request('/auth/logout', { method: 'POST', as: dani }); } finally { release(); }
  await hold; const reply = await sending; if (reply) assert.equal(reply.error.code, 'UNAUTHORIZED');
  assert.equal(await prisma.mensaje.count({ where: { idCanal: ch.id } }), 0);
});
test('dos eliminaciones concurrentes producen un solo evento y auditoría definitiva', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch), mod = await subscribe(cata, ch), m = await stored(ch), logs = capture(a);
  const results = await Promise.all([remove(a, m.id), remove(mod, m.id)]);
  assert.equal(results.filter((r) => r.ok).length, 1); assert.equal(results.find((r) => !r.ok).error.code, 'MESSAGE_DELETED');
  await flush(a, mod); assert.equal(messageEvents(logs).filter((e) => e.event === 'channel-message:deleted').length, 1);
  assert.equal((await history(ch)).items[0].contenido, null);
});
test('edición y eliminación concurrentes no emiten una edición después del borrado ni resucitan contenido', async () => {
  const c = await community(), ch = await create(c), d1 = await subscribe(dani, ch), d2 = await subscribe(dani, ch), m = await stored(ch), logs = capture(d1);
  const results = await Promise.all([edit(d1, m.id, 'Corrección'), remove(d2, m.id)]);
  assert.equal(results[1].ok, true); assert(results[0].ok || results[0].error.code === 'MESSAGE_DELETED');
  await flush(d1, d2); const events = messageEvents(logs); const deletion = events.findIndex((e) => e.event === 'channel-message:deleted'); assert(deletion >= 0);
  assert(!events.slice(deletion + 1).some((e) => e.event === 'channel-message:updated'));
  const dto = (await history(ch)).items[0]; assert.equal(dto.eliminado, true); assert.equal(dto.contenido, null);
});
test('envío y revocación concurrentes respetan el orden de eventos sin publicar contenido tras access-lost', async () => {
  const c = await community(), ch = await create(c, { privado: true }); await access(ch, [{ idUsuario: dani.id, permisos: ['ESCRIBIR'] }]);
  const d = await subscribe(dani, ch), logs = capture(d);
  const [sent] = await Promise.all([send(d, ch), access(ch, [])]); assert(sent.ok || sent.error.code === 'CHANNEL_NOT_FOUND');
  await flush(d); const loss = logs.findIndex((e) => e.event === 'channel:access-lost'); assert(loss >= 0);
  assert(!logs.slice(loss + 1).some((e) => e.event.startsWith('channel-message:')));
  assert.equal((await send(d, ch)).error.code, 'CHANNEL_NOT_FOUND');
});
test('envío concurrente con cambio de tipo nunca deja un mensaje dentro de VOZ', async () => {
  const c = await community(), ch = await create(c), a = await socketFor(ana);
  const [sent, typed] = await Promise.all([send(a, ch), request(`/channels/${ch.id}`, { method: 'PATCH', as: ana, body: { tipo: 'VOZ' } })]);
  const row = await prisma.canal.findUnique({ where: { id: ch.id } }), count = await prisma.mensaje.count({ where: { idCanal: ch.id } });
  if (sent.ok) { assert.equal(row.tipo, 'TEXTO'); assert.equal(count, 1); assert.equal(typed.status, 409); }
  else { assert.equal(sent.error.code, 'CHANNEL_NOT_TEXT'); assert.equal(row.tipo, 'VOZ'); assert.equal(count, 0); }
});
test('borrar un canal cierra suscripciones y rechaza mensajes posteriores', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch);
  const m = (await send(a, ch)).data.mensaje;
  await request(`/channels/${ch.id}`, { method: 'DELETE', as: ana });
  assert.equal((await send(a, ch)).error.code, 'CHANNEL_NOT_FOUND'); assert.equal((await edit(a, m.id)).error.code, 'MESSAGE_NOT_FOUND');
  assert(!io.sockets.sockets.get(a.id).rooms.has(`channel:${ch.id}`));
});
test('un evento sin ack no interrumpe el servidor y una reconexión recupera el historial persistido', async () => {
  const c = await community(), ch = await create(c), a = await subscribe(ana, ch), d = await subscribe(dani, ch);
  const received = new Promise((resolve) => d.once('channel-message:new', resolve)); a.emit('channel-message:send', { idCanal: ch.id, contenido: 'Sin callback' });
  const { mensaje } = await received; a.disconnect(); const reconnected = await subscribe(ana, ch);
  assert.equal((await history(ch)).items[0].id, mensaje.id); assert.equal((await send(reconnected, ch)).ok, true);
});
