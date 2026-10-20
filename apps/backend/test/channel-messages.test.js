import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_t25_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = ''; process.env.CLOUDINARY_URL = '';
const admin = new PrismaClient({ datasourceUrl: databaseUrl });
let prisma, app, server, baseUrl, ana, beto, cata, dani, eli;
async function request(path, { method = 'GET', body, as, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible: nombreUsuario, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(r.status, 201); return { ...r.body.usuario, cookie: r.cookie };
}
async function community() {
  const c = (await request('/communities', { method: 'POST', as: ana, body: { nombre: 'Historial', tipo: 'PRIVADA' } })).body.comunidad;
  for (const [user, rol] of [[beto, 'ADMIN'], [cata, 'MODERADOR'], [dani, 'INTEGRANTE']]) await prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
  return c;
}
async function channel(c, datos = {}) {
  const r = await request(`/communities/${c.id}/channels`, { method: 'POST', as: ana, body: { nombre: 'avisos', tipo: 'TEXTO', ...datos } });
  assert.equal(r.status, 201); return r.body.canal;
}
const message = (ch, data = {}) => prisma.mensaje.create({ data: { idCanal: ch.id, idAutor: ana.id, contenido: 'contenido', ...data } });
const history = (ch, query = '', as = ana) => request(`/channels/${ch.id}/messages${query ? `?${query}` : ''}`, { as });
async function access(ch, habilitaciones, privado = true) {
  const r = await request(`/channels/${ch.id}/access`, { method: 'PUT', as: ana, body: { privado, habilitaciones } });
  assert.equal(r.status, 200); return r;
}
async function start() {
  server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening'); baseUrl = `http://127.0.0.1:${server.address().port}`;
}
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js')); ({ app } = await import('../src/app.js'));
  await start();
  ana = await register('ana'); beto = await register('beto'); cata = await register('cata'); dani = await register('dani'); eli = await register('eli');
});
beforeEach(async () => { await prisma.comunidad.deleteMany(); await prisma.conversacionPrivada.deleteMany(); });
after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await prisma?.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
});

test('requiere sesión real y no acepta suplantación por header en producción', async () => {
  const c = await community(), ch = await channel(c); await message(ch);
  for (const headers of [{}, { 'x-dev-user-id': String(ana.id) }, { Cookie: 'dialo_sid=falso' }]) {
    assert.equal((await request(`/channels/${ch.id}/messages`, { headers })).status, 401);
  }
});
test('valida IDs, cursor, límite y campos ajenos a la consulta', async () => {
  const c = await community(), ch = await channel(c);
  for (const id of ['0', '-1', 'abc', '1.5', '2147483648']) assert.equal((await request(`/channels/${id}/messages`, { as: ana })).status, 400);
  for (const query of ['cursor=0', 'cursor=-1', 'cursor=abc', 'cursor=1.5', 'cursor=2147483648', 'cursor=',
    'limit=0', 'limit=-1', 'limit=51', 'limit=abc', 'limit=1.5', 'limit=', 'limit=1&limit=2', 'cursor=1&cursor=2', 'idUsuario=1']) {
    const r = await history(ch, query); assert.equal(r.status, 400, query); assert.equal(r.body.error.code, 'VALIDATION_ERROR');
  }
});
test('canal vacío devuelve items vacíos y cursor null, también con VER sin ESCRIBIR', async () => {
  const c = await community(), ch = await channel(c, { privado: true });
  await access(ch, [{ rol: 'INTEGRANTE', permisos: ['VER'] }]);
  assert.deepEqual((await history(ch, '', dani)).body, { items: [], nextCursor: null });
});
test('propietario y administrador acceden a canales privados; moderador necesita VER explícito', async () => {
  const c = await community(), ch = await channel(c, { privado: true }); await message(ch);
  for (const user of [ana, beto]) assert.equal((await history(ch, '', user)).status, 200);
  for (const user of [cata, dani, eli]) { const r = await history(ch, '', user); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'CHANNEL_NOT_FOUND'); }
  await access(ch, [{ rol: 'MODERADOR', permisos: ['VER'] }]); assert.equal((await history(ch, '', cata)).status, 200);
});
test('rechaza voz/video solo después de autorizar y no revela el tipo a terceros', async () => {
  const c = await community();
  for (const tipo of ['VOZ', 'VIDEO']) {
    const ch = await channel(c, { tipo, privado: true });
    const r = await history(ch); assert.equal(r.status, 400); assert.equal(r.body.error.code, 'CHANNEL_NOT_TEXT');
    assert.equal((await history(ch, '', eli)).status, 404);
  }
});
test('límite por defecto 30, máximo 50 y nextCursor solo cuando hay otra página', async () => {
  const c = await community(), ch = await channel(c);
  const date = new Date('2026-01-01T10:00:00Z');
  await prisma.mensaje.createMany({ data: Array.from({ length: 51 }, (_, n) => ({ idCanal: ch.id, idAutor: ana.id, contenido: String(n), fechaCreacion: date })) });
  const first = await history(ch); assert.equal(first.status, 200); assert.equal(first.body.items.length, 30); assert.equal(first.body.nextCursor, first.body.items.at(-1).id);
  const max = (await history(ch, 'limit=50')).body; assert.equal(max.items.length, 50); assert.equal(max.nextCursor, max.items.at(-1).id);
  const end = (await history(ch, `limit=50&cursor=${max.nextCursor}`)).body; assert.equal(end.items.length, 1); assert.equal(end.nextCursor, null);
  assert.equal((await history(ch, 'limit=1')).body.items.length, 1);
});
test('recorre todas las páginas con fechas empatadas sin omisiones ni repetidos', async () => {
  const c = await community(), ch = await channel(c);
  const rows = [];
  for (let n = 0; n < 17; n++) rows.push(await message(ch, { fechaCreacion: new Date(`2026-01-0${n % 3 + 1}T10:00:00Z`), contenido: `mensaje ${n}` }));
  const expected = [...rows].sort((a, b) => b.fechaCreacion - a.fechaCreacion || b.id - a.id).map((m) => m.id);
  for (const limit of [1, 4, 17, 50]) {
    const found = []; let cursor;
    for (let page = 0; page < 25; page++) {
      const r = await history(ch, `limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`); assert.equal(r.status, 200);
      found.push(...r.body.items.map((m) => m.id)); cursor = r.body.nextCursor; if (cursor === null) break;
    }
    assert.deepEqual(found, expected); assert.equal(new Set(found).size, rows.length);
  }
});
test('la fecha determina el orden aunque los IDs se hayan creado en otro orden cronológico', async () => {
  const c = await community(), ch = await channel(c);
  const newest = await message(ch, { fechaCreacion: new Date('2026-02-03T00:00:00Z') });
  const oldest = await message(ch, { fechaCreacion: new Date('2026-02-01T00:00:00Z') });
  const middle = await message(ch, { fechaCreacion: new Date('2026-02-02T00:00:00Z') });
  assert.deepEqual((await history(ch)).body.items.map((m) => m.id), [newest.id, middle.id, oldest.id]);
  assert.deepEqual((await history(ch, `cursor=${newest.id}`)).body.items.map((m) => m.id), [middle.id, oldest.id]);
});
test('cursor inexistente, de otro canal o de chat privado no permite acceder al contenido ajeno', async () => {
  const c = await community(), ch = await channel(c), other = await channel(c, { privado: true });
  const elsewhere = await message(other, { contenido: 'secreto ajeno' });
  const conversation = await prisma.conversacionPrivada.create({ data: { idUsuarioA: ana.id, idUsuarioB: beto.id } });
  const privateMessage = await prisma.mensaje.create({ data: { idConversacion: conversation.id, idAutor: ana.id, contenido: 'privado' } });
  for (const cursor of [2_147_483_647, elsewhere.id, privateMessage.id]) {
    const r = await history(ch, `cursor=${cursor}`); assert.equal(r.status, 400); assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert(!JSON.stringify(r.body).includes('secreto ajeno')); assert.equal(r.body.error.details[0].campo, 'cursor');
  }
  assert.equal((await history(other, `cursor=${elsewhere.id}`, dani)).status, 404);
  assert.equal((await history(other, 'cursor=2147483647', dani)).status, 404);
});
test('aísla mensajes entre canales, comunidades y conversaciones privadas', async () => {
  const c = await community(), ch = await channel(c), other = await channel(c), otherC = await community(), otherCh = await channel(otherC);
  const own = await message(ch), foreign = await message(other), foreignC = await message(otherCh);
  const r = await history(ch, '', dani); assert.equal(r.status, 200); assert.deepEqual(r.body.items.map((m) => m.id), [own.id]);
  assert(!r.body.items.some((m) => [foreign.id, foreignC.id].includes(m.id)));
});
test('DTO seguro de autores, edición y borrados propios o moderados sin contenido ni auditoría interna', async () => {
  const c = await community(), ch = await channel(c);
  await prisma.usuario.update({ where: { id: cata.id }, data: { disponibilidad: 'INVISIBLE', informacionPersonal: 'Perfil público' } });
  const edited = await message(ch, { idAutor: cata.id, contenido: 'editado', fechaEdicion: new Date('2026-03-01T10:00:00Z') });
  const ownDeleted = await message(ch, { idAutor: dani.id, contenido: 'original propio', fechaEliminacion: new Date(), idUsuarioEliminacion: dani.id });
  const moderated = await message(ch, { idAutor: dani.id, contenido: 'original moderado', fechaEliminacion: new Date(), idUsuarioEliminacion: cata.id });
  const legacy = await message(ch, { contenido: 'original antiguo', fechaEliminacion: new Date(), idUsuarioEliminacion: null });
  const r = await history(ch); assert.equal(r.status, 200);
  const byId = new Map(r.body.items.map((m) => [m.id, m]));
  assert.equal(byId.get(edited.id).contenido, 'editado'); assert.equal(byId.get(edited.id).fechaEdicion, edited.fechaEdicion.toISOString());
  assert.equal(byId.get(edited.id).autor.disponibilidad, 'AUSENTE'); assert.equal(byId.get(edited.id).autor.informacionPersonal, 'Perfil público');
  for (const m of r.body.items) {
    assert.deepEqual(Object.keys(m).sort(), ['autor', 'contenido', 'eliminado', 'eliminadoPorModerador', 'fechaCreacion', 'fechaEdicion', 'id', 'idCanal']);
    assert.deepEqual(Object.keys(m.autor).sort(), ['disponibilidad', 'fotoUrl', 'id', 'informacionPersonal', 'nombreUsuario', 'nombreVisible']);
    assert.equal(m.idCanal, ch.id); assert(!JSON.stringify(m).includes('original'));
  }
  for (const id of [ownDeleted.id, moderated.id, legacy.id]) { assert.equal(byId.get(id).contenido, null); assert.equal(byId.get(id).eliminado, true); }
  assert.equal(byId.get(ownDeleted.id).eliminadoPorModerador, false); assert.equal(byId.get(moderated.id).eliminadoPorModerador, true); assert.equal(byId.get(legacy.id).eliminadoPorModerador, false);
});
test('autores conservados tras abandonar y datos públicos actualizados en nuevas consultas', async () => {
  const c = await community(), ch = await channel(c); const m = await message(ch, { idAutor: dani.id });
  assert.equal((await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani })).status, 204);
  await prisma.usuario.update({ where: { id: dani.id }, data: { nombreVisible: 'Nombre actual' } });
  const r = await history(ch); assert.equal(r.body.items[0].id, m.id); assert.equal(r.body.items[0].autor.nombreVisible, 'Nombre actual');
});
test('el cursor eliminado sigue siendo válido y el último cursor termina en página vacía', async () => {
  const c = await community(), ch = await channel(c);
  const old = await message(ch, { fechaCreacion: new Date('2026-01-01T00:00:00Z') });
  const deleted = await message(ch, { fechaCreacion: new Date('2026-01-02T00:00:00Z'), fechaEliminacion: new Date() });
  await message(ch, { fechaCreacion: new Date('2026-01-03T00:00:00Z') });
  assert.deepEqual((await history(ch, `cursor=${deleted.id}`)).body.items.map((m) => m.id), [old.id]);
  assert.deepEqual((await history(ch, `cursor=${old.id}`)).body, { items: [], nextCursor: null });
});
test('insertar un mensaje más nuevo entre páginas no repite ni omite los mensajes anteriores', async () => {
  const c = await community(), ch = await channel(c); const date = new Date('2026-01-01T10:00:00Z');
  const rows = []; for (let n = 0; n < 5; n++) rows.push(await message(ch, { fechaCreacion: date }));
  const first = (await history(ch, 'limit=2')).body;
  const added = await message(ch, { fechaCreacion: new Date('2026-01-02T10:00:00Z') });
  const next = (await history(ch, `limit=50&cursor=${first.nextCursor}`)).body;
  assert.deepEqual([...first.items, ...next.items].map((m) => m.id), rows.map((m) => m.id).reverse());
  assert.equal((await history(ch)).body.items[0].id, added.id);
});
test('revocar VER bloquea la siguiente página aunque se conozca un cursor válido', async () => {
  const c = await community(), ch = await channel(c, { privado: true });
  await access(ch, [{ rol: 'INTEGRANTE', permisos: ['VER'] }]); const m = await message(ch);
  assert.equal((await history(ch, '', dani)).status, 200);
  await access(ch, []);
  const denied = await history(ch, `cursor=${m.id}`, dani); assert.equal(denied.status, 404); assert.equal(denied.body.error.code, 'CHANNEL_NOT_FOUND');
  await access(ch, [{ idUsuario: dani.id, permisos: ['VER'] }]); assert.equal((await history(ch, '', dani)).status, 200);
});
test('abandonar la comunidad impide consultar mensajes de sus canales públicos', async () => {
  const c = await community(), ch = await channel(c); const m = await message(ch);
  assert.equal((await history(ch, '', dani)).status, 200);
  await request(`/communities/${c.id}/leave`, { method: 'POST', as: dani });
  assert.equal((await history(ch, `cursor=${m.id}`, dani)).status, 404);
});
test('borrar el canal o la comunidad deja de resolver historiales y cursores conocidos', async () => {
  for (const scope of ['canal', 'comunidad']) {
    const c = await community(), ch = await channel(c); const m = await message(ch);
    const path = scope === 'canal' ? `/channels/${ch.id}` : `/communities/${c.id}`;
    assert.equal((await request(path, { method: 'DELETE', as: ana })).status, 204);
    assert.equal((await history(ch, `cursor=${m.id}`)).status, 404);
  }
});
test('página y revocación concurrentes se serializan; ninguna consulta posterior conserva acceso', async () => {
  const c = await community(), ch = await channel(c, { privado: true }); await message(ch);
  await access(ch, [{ idUsuario: dani.id, permisos: ['VER'] }]);
  const [page] = await Promise.all([history(ch, '', dani), access(ch, [])]);
  assert([200, 404].includes(page.status)); assert.equal((await history(ch, '', dani)).status, 404);
});
test('el historial persiste tras reiniciar el servidor HTTP', async () => {
  const c = await community(), ch = await channel(c); await message(ch, { contenido: 'persistido' });
  const before = (await history(ch)).body;
  await new Promise((resolve) => server.close(resolve)); await start();
  assert.deepEqual((await history(ch)).body, before);
});
