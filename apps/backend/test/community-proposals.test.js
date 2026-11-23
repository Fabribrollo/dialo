import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_community_ai_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl); isolated.searchParams.set('schema', schema);
process.env.DATABASE_URL = isolated.href; process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production'; process.env.OPENAI_API_KEY = 'test-only';
process.env.OPENAI_GENERATION_MODEL = 'test-model'; process.env.RESEND_API_KEY = ''; process.env.CLOUDINARY_URL = '';
const admin = new PrismaClient({ datasourceUrl: databaseUrl });
const originalFetch = globalThis.fetch;
let prisma, io, server, base, ana, beto, calls, provider;
const draft = () => ({ nombre: 'Club de programación', tipo: 'PRIVADA', canales: [
  { nombre: 'consultas', tipo: 'TEXTO', privado: false, permisosGlobales: ['ESCRIBIR'] },
  { nombre: 'estudio', tipo: 'VOZ', privado: false, permisosGlobales: ['HABLAR', 'CAMARA'] },
  { nombre: 'organización', tipo: 'TEXTO', privado: true, permisosGlobales: [] },
], roles: [{ nombre: 'Estudiantes', permisos: ['ESCRIBIR', 'HABLAR'] }] });
const providerResponse = value => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) });
async function request(path, body, user = ana) {
  const response = await originalFetch(`${base}/api/communities${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: user.cookie } : {}) }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function register(name) {
  const r = await originalFetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombreUsuario: name, nombreVisible: name, correo: `${name}@example.test`, contrasena: 'ClaveDePrueba123' }) });
  assert.equal(r.status, 201); return { ...(await r.json()).usuario, cookie: r.headers.get('set-cookie').split(';')[0] };
}
before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana'); beto = await register('beto');
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') { calls.push(JSON.parse(options.body)); return provider(); }
    return originalFetch(url, options);
  };
});
beforeEach(async () => {
  (await import('../src/utils/rateLimit.js')).resetRateLimits();
  await prisma.creacionComunidad.deleteMany(); await prisma.comunidad.deleteMany();
  calls = []; provider = () => providerResponse(draft());
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (io) await new Promise(resolve => io.close(resolve));
  await (await import('../src/utils/backgroundEffects.js')).drainEffects();
  await prisma?.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
});
test('ambas operaciones requieren sesión; validan antes de consultar IA', async () => {
  assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' }, null)).status, 401);
  assert.equal((await request('/from-draft', { clave: randomUUID(), borrador: draft() }, null)).status, 401);
  assert.equal((await request('/suggestion', { proposito: 'corto' })).status, 400);
  assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio', idUsuario: beto.id })).status, 400);
  assert.equal(calls.length, 0);
});
test('generar devuelve un borrador sin escribir comunidad, roles, canales ni recibos', async () => {
  const r = await request('/suggestion', { proposito: 'Estudiar programación con amigos' });
  assert.equal(r.status, 200); assert.deepEqual(r.body.propuesta, draft());
  assert.equal(calls[0].store, false); assert.equal(calls[0].model, 'test-model');
  assert.equal(calls[0].input, JSON.stringify({ proposito: 'Estudiar programación con amigos' }));
  for (const model of ['comunidad', 'rolPersonalizado', 'canal', 'creacionComunidad']) assert.equal(await prisma[model].count(), 0);
});
test('limita las generaciones por cuenta', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 200);
  assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 429);
  assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' }, beto)).status, 200);
});
test('proveedor inválido, privilegios, rechazo, límite y caída no crean datos', async () => {
  const invalid = [ { ...draft(), idPropietario: beto.id }, { ...draft(), roles: [{ nombre: 'Admin', permisos: [] }] },
    { ...draft(), roles: [{ nombre: 'Gestores', permisos: ['EXPULSAR'] }] }, { ...draft(), canales: [] } ];
  for (const value of invalid) {
    (await import('../src/utils/rateLimit.js')).resetRateLimits(); provider = () => providerResponse(value);
    assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 503);
  }
  for (const response of [{ ok: false }, { ok: true, json: async () => ({ status: 'incomplete' }) }, { ok: true, json: async () => ({ output: [{ content: [{ type: 'refusal' }] }] }) }]) {
    (await import('../src/utils/rateLimit.js')).resetRateLimits(); provider = () => response;
    assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 503);
  }
  (await import('../src/utils/rateLimit.js')).resetRateLimits(); provider = () => { throw new Error('timeout'); };
  assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 503);
  assert.equal(await prisma.comunidad.count(), 0);
});
test('sin configuración conserva la creación manual', async () => {
  const { env } = await import('../src/config/env.js'); const saved = env.openaiApiKey; env.openaiApiKey = '';
  try { assert.equal((await request('/suggestion', { proposito: 'Un grupo de estudio' })).status, 503); }
  finally { env.openaiApiKey = saved; }
  const r = await request('', { nombre: 'Manual', tipo: 'PRIVADA' });
  assert.equal(r.status, 201); assert.equal(await prisma.canal.count({ where: { idComunidad: r.body.comunidad.id, nombre: 'general' } }), 1);
});
test('crea exactamente la estructura editada con propietario real y orden revisado', async () => {
  const edited = draft(); edited.nombre = 'Grupo revisado'; edited.tipo = 'PUBLICA'; edited.canales.reverse(); edited.roles.push({ nombre: 'Apoyo', permisos: ['SILENCIAR'] });
  const r = await request('/from-draft', { clave: randomUUID(), borrador: edited });
  assert.equal(r.status, 201); assert.equal(r.body.comunidad.nombre, edited.nombre); assert.equal(r.body.comunidad.idPropietario, ana.id);
  const id = r.body.comunidad.id;
  const channels = await prisma.canal.findMany({ where: { idComunidad: id }, orderBy: { posicion: 'asc' } });
  assert.deepEqual(channels.map(c => c.nombre), edited.canales.map(c => c.nombre));
  assert.deepEqual(channels.map(c => c.posicion), [0, 1, 2]); assert.deepEqual(channels[0].permisosGlobales, ['VER']);
  assert.equal(await prisma.rolPersonalizado.count({ where: { idComunidad: id } }), 2);
  assert.equal(await prisma.membresiaRol.count({ where: { idComunidad: id } }), 0);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: id, rol: 'PROPIETARIO', idUsuario: ana.id } }), 1);
});
test('valida el borrador final, límites, nombres y permisos aun si se manipula el cliente', async () => {
  const invalid = [ { ...draft(), roles: [{ nombre: 'Admin', permisos: [] }] }, { ...draft(), roles: [{ nombre: 'Otro', permisos: ['BANEAR'] }] },
    { ...draft(), canales: [] }, { ...draft(), canales: Array.from({ length: 21 }, (_, i) => ({ ...draft().canales[0], nombre: `c${i}` })) },
    { ...draft(), canales: [draft().canales[0], { ...draft().canales[0], nombre: 'CONSULTAS' }] },
    { ...draft(), canales: [{ ...draft().canales[0], permisosGlobales: ['HABLAR'] }] },
    { ...draft(), canales: [{ ...draft().canales[0], privado: true }] }, { ...draft(), idPropietario: beto.id } ];
  for (const borrador of invalid) assert.equal((await request('/from-draft', { clave: randomUUID(), borrador })).status, 400);
  assert.equal(await prisma.comunidad.count(), 0);
});
test('doble envío concurrente y reintento devuelven una sola comunidad; clave distinta por cuenta', async () => {
  const input = { clave: randomUUID(), borrador: draft() };
  const results = await Promise.all(Array.from({ length: 5 }, () => request('/from-draft', input)));
  assert.equal(results.filter(r => r.status === 201).length, 1); assert.equal(results.filter(r => r.status === 200).length, 4);
  assert.equal(new Set(results.map(r => r.body.comunidad.id)).size, 1); assert.equal(await prisma.comunidad.count(), 1);
  assert.equal((await request('/from-draft', { ...input, borrador: { ...draft(), nombre: 'Otro contenido' } })).status, 409);
  const other = await request('/from-draft', input, beto); assert.equal(other.status, 201); assert.equal(other.body.comunidad.idPropietario, beto.id);
});
test('una comunidad borrada no reaparece al repetir el envío', async () => {
  const input = { clave: randomUUID(), borrador: draft() }; const r = await request('/from-draft', input);
  await prisma.comunidad.delete({ where: { id: r.body.comunidad.id } });
  assert.equal((await request('/from-draft', input)).status, 409); assert.equal(await prisma.comunidad.count(), 0);
});
test('un fallo al guardar roles revierte comunidad, membresía, canales y recibo', async () => {
  await prisma.$executeRawUnsafe(`CREATE FUNCTION "${schema}".fail_role() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER test_role_failure BEFORE INSERT ON "${schema}".rol_personalizado FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_role()`);
  try {
    assert.equal((await request('/from-draft', { clave: randomUUID(), borrador: draft() })).status, 500);
    for (const model of ['comunidad', 'membresia', 'canal', 'rolPersonalizado', 'creacionComunidad']) assert.equal(await prisma[model].count(), 0);
  } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER test_role_failure ON "${schema}".rol_personalizado`); await prisma.$executeRawUnsafe(`DROP FUNCTION "${schema}".fail_role()`); }
});
