import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const base = (process.env.DIALO_TEST_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const prefix = `t25_${randomUUID().slice(0, 8)}`;
const users = [];
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
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: `T25${randomUUID()}!` } });
  assert.equal(r.status, 201, 'No se pudo registrar una cuenta de prueba'); assert.ok(r.cookie);
  const user = { ...r.data.usuario, cookie: r.cookie }; users.push(user); return user;
}
try {
  const owner = await register('a'), member = await register('b'), outsider = await register('c');
  const created = await request('/communities', { method: 'POST', as: owner, body: { nombre: `Historial ${prefix}`, tipo: 'PRIVADA' } });
  assert.equal(created.status, 201); communityId = created.data.comunidad.id;
  const invite = await request(`/communities/${communityId}/invitations`, { method: 'POST', as: owner, body: { duracionHoras: 1, usosMaximos: 1 } });
  assert.equal(invite.status, 201);
  assert.equal((await request(`/invitations/${invite.data.invitacion.codigo}/accept`, { method: 'POST', as: member })).status, 201);
  const create = async (nombre, tipo = 'TEXTO', privado = false) => {
    const r = await request(`/communities/${communityId}/channels`, { method: 'POST', as: owner, body: { nombre, tipo, privado } });
    assert.equal(r.status, 201); return r.data.canal;
  };
  const ch = await create('historial'), hidden = await create('solo-lectura', 'TEXTO', true);
  const voice = await create('voz', 'VOZ'), video = await create('video', 'VIDEO');
  const history = (canal, as = owner, query = '') => request(`/channels/${canal.id}/messages${query ? `?${query}` : ''}`, { as });
  const configure = async (habilitaciones) => {
    const r = await request(`/channels/${hidden.id}/access`, { method: 'PUT', as: owner, body: { privado: true, habilitaciones } }); assert.equal(r.status, 200);
  };
  assert.equal((await history(ch, null)).status, 401);
  assert.equal((await history(ch, outsider)).status, 404);
  for (const limit of [1, 30, 50]) {
    const r = await history(ch, member, `limit=${limit}`); assert.equal(r.status, 200); assert.deepEqual(r.data, { items: [], nextCursor: null });
  }
  assert.deepEqual((await history(ch)).data, (await history(ch)).data);
  for (const query of ['limit=0', 'limit=51', 'cursor=0', 'cursor=abc', 'idUsuario=1']) {
    const r = await history(ch, owner, query); assert.equal(r.status, 400); assert.equal(r.data.error.code, 'VALIDATION_ERROR');
  }
  assert.equal((await history(ch, owner, 'cursor=2147483647')).data.error.code, 'VALIDATION_ERROR');
  for (const canal of [voice, video]) { const r = await history(canal); assert.equal(r.status, 400); assert.equal(r.data.error.code, 'CHANNEL_NOT_TEXT'); }
  assert.equal((await history(hidden, member)).status, 404);
  await configure([{ rol: 'INTEGRANTE', permisos: ['VER'] }]);
  assert.deepEqual((await history(hidden, member)).data, { items: [], nextCursor: null });
  const detail = await request(`/channels/${hidden.id}`, { as: member }); assert.deepEqual(detail.data.canal.misPermisos, ['VER']);
  await configure([]);
  assert.equal((await history(hidden, member, 'cursor=2147483647')).status, 404);
  await configure([{ idUsuario: member.id, permisos: ['VER'] }]); assert.equal((await history(hidden, member)).status, 200);
  assert.equal((await request(`/communities/${communityId}/leave`, { method: 'POST', as: member })).status, 204);
  assert.equal((await history(ch, member)).status, 404); assert.equal((await history(hidden, member)).status, 404);
  assert.equal((await request(`/channels/${ch.id}`, { method: 'DELETE', as: owner })).status, 204);
  assert.equal((await history(ch)).status, 404);
  console.log('T-25 OK: historial vacío, límites, autorización, solo lectura, tipos, revocación, recuperación, abandono y canal eliminado.');
  console.log('Paginación con mensajes, autores y borrados: cubierta por test:channel-messages en una base exclusiva de pruebas.');
} catch (error) { console.error(`T-25 FALLÓ: ${error.message}`); process.exitCode = 1; }
finally {
  if (communityId && users[0]) {
    try {
      const result = await request(`/communities/${communityId}`, { method: 'DELETE', as: users[0] });
      if (![204, 404].includes(result.status)) { console.error(`No se pudo limpiar la comunidad de prueba ${communityId}.`); process.exitCode = 1; }
    } catch { console.error(`Quedó pendiente limpiar la comunidad de prueba ${communityId}.`); process.exitCode = 1; }
  }
  for (const user of users) { try { await request('/auth/logout', { method: 'POST', as: user }); } catch { /* servidor no disponible */ } }
  if (users.length) console.log(`Cuentas de prueba conservadas: ${users.map((u) => u.nombreUsuario).join(', ')}.`);
}
