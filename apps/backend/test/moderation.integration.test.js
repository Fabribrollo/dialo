// F-14 (T-50, T-51, T-52): medidas manuales y propuestas de moderación preparadas por IA.
import { drainEffects } from '../src/utils/backgroundEffects.js';
import { resetRateLimits } from '../src/utils/rateLimit.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { applyMigrations } from './migrations.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('Configurá TEST_DATABASE_URL con una base PostgreSQL exclusiva de pruebas');
const schema = `test_f14_${randomUUID().replaceAll('-', '')}`;
const isolated = new URL(databaseUrl);
isolated.searchParams.set('schema', schema);
if (!isolated.searchParams.has('connection_limit')) isolated.searchParams.set('connection_limit', '5');
process.env.DATABASE_URL = isolated.href;
process.env.DIRECT_URL = isolated.href;
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = '';
process.env.CLOUDINARY_URL = '';
process.env.OPENAI_API_KEY = 'test-only';
process.env.OPENAI_GENERATION_MODEL = 'test-model';

const admin = new PrismaClient({ datasourceUrl: databaseUrl });
const originalFetch = globalThis.fetch;
let prisma, io, server, baseUrl, ana, beto, caro, dani, calls, provider;

async function request(path, { method = 'GET', body, as } = {}) {
  const response = await originalFetch(`${baseUrl}/api${path}`, {
    method, headers: { ...(as ? { Cookie: as.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function register(nombreUsuario, nombreVisible = nombreUsuario) {
  const r = await request('/auth/register', { method: 'POST', body: { nombreUsuario, nombreVisible, correo: `${nombreUsuario}@example.test`, contrasena: 'ClaveDePrueba123' } });
  assert.equal(r.status, 201);
  return { ...r.body.usuario, cookie: r.cookie };
}
const providerResponse = (value) => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) });
const ai = (value) => { provider = () => providerResponse({ alcance: 'NINGUNO', duracion: 'PERMANENTE', motivo: '', ...value }); };

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await applyMigrations(admin, schema);
  ({ prisma } = await import('../src/prisma/client.js'));
  const { app } = await import('../src/app.js');
  const { initSockets } = await import('../src/sockets/index.js');
  server = createServer(app); io = new Server(server); initSockets(io);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  ana = await register('ana', 'Ana'); beto = await register('beto', 'Beto Gómez'); caro = await register('caro', 'Caro'); dani = await register('dani', 'Dani');
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.openai.com/v1/responses') { calls.push(JSON.parse(options.body)); return provider(); }
    return originalFetch(url, options);
  };
});
beforeEach(async () => {
  resetRateLimits();
  await prisma.comunidad.deleteMany();
  calls = [];
  ai({ destinatario: 'beto', medida: 'SILENCIAR', alcance: 'TEXTO', duracion: '1_HORA', motivo: 'spam' });
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (io) await new Promise((resolve) => io.close(resolve));
  await drainEffects();
  await prisma?.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
});

const member = (c, user, rol = 'INTEGRANTE') => prisma.membresia.create({ data: { idComunidad: c.id, idUsuario: user.id, rol } });
async function community(owner = ana) {
  const r = await request('/communities', { method: 'POST', as: owner, body: { nombre: 'Club', tipo: 'PRIVADA' } });
  assert.equal(r.status, 201);
  return r.body.comunidad;
}
async function textChannel(c) { return prisma.canal.findFirst({ where: { idComunidad: c.id, tipo: 'TEXTO' } }); }
const silence = (c, user, as = ana, body = { alcance: 'TEXTO', duracion: '1_HORA' }) => request(`/communities/${c.id}/members/${user.id}/silence`, { method: 'PUT', as, body });
const myChannel = async (canal, as) => (await request(`/channels/${canal.id}`, { as })).body.canal;
const audit = (c) => prisma.auditoria.findMany({ where: { idComunidad: c.id }, orderBy: { id: 'asc' } });

test('T-50: silenciar quita escribir desde el servidor, solo en esa comunidad, y se puede levantar', async () => {
  const c = await community(), other = await community();
  await member(c, beto); await member(other, beto);
  const canal = await textChannel(c), otro = await textChannel(other);
  assert.ok((await myChannel(canal, beto)).misPermisos.includes('ESCRIBIR'));

  const r = await silence(c, beto, ana, { alcance: 'TEXTO', duracion: '1_HORA', motivo: 'spam' });
  assert.equal(r.status, 200);
  assert.ok(r.body.fechaVencimiento);
  assert.ok(!(await myChannel(canal, beto)).misPermisos.includes('ESCRIBIR'));
  assert.ok((await myChannel(otro, beto)).misPermisos.includes('ESCRIBIR'));
  assert.equal((await request(`/communities/${c.id}`, { as: beto })).body.comunidad.miSilencio.alcance, 'TEXTO');
  assert.equal((await request(`/communities/${c.id}/silences`, { as: ana })).body.items.length, 1);

  assert.equal((await request(`/communities/${c.id}/members/${beto.id}/silence`, { method: 'DELETE', as: ana })).status, 204);
  assert.ok((await myChannel(canal, beto)).misPermisos.includes('ESCRIBIR'));
  const log = (await audit(c)).map((a) => a.accion);
  assert.ok(log.some((a) => a.startsWith('Silenció a @beto (texto, 1 hora). Motivo: spam')));
  assert.ok(log.includes('Levantó el silencio de @beto'));
  assert.ok((await audit(c)).every((a) => a.idActor === ana.id));
});

test('T-50: un silencio vencido ya no limita, aunque el temporizador no haya corrido', async () => {
  const c = await community(); await member(c, beto);
  await prisma.silencioComunidad.create({ data: { idComunidad: c.id, idUsuario: beto.id, alcance: 'AMBOS', fechaVencimiento: new Date(Date.now() - 1000) } });
  assert.ok((await myChannel(await textChannel(c), beto)).misPermisos.includes('ESCRIBIR'));
});

test('T-50: jerarquía y permisos de cada medida', async () => {
  const c = await community();
  await member(c, beto, 'MODERADOR'); await member(c, caro, 'ADMIN'); await member(c, dani);
  // Un moderador sin el permiso SILENCIAR no puede silenciar.
  assert.equal((await silence(c, dani, beto)).status, 403);
  const rol = await prisma.rolPersonalizado.create({ data: { idComunidad: c.id, nombre: 'Guardia', permisos: ['SILENCIAR'] } });
  await prisma.membresiaRol.create({ data: { idComunidad: c.id, idUsuario: beto.id, idRol: rol.id } });
  assert.equal((await silence(c, dani, beto)).status, 200);
  assert.equal((await silence(c, caro, beto)).status, 403); // admin
  assert.equal((await silence(c, ana, caro)).status, 403); // propietario
  assert.equal((await silence(c, caro, ana)).status, 403); // administrador no se silencia
  // Expulsar y banear son de administración.
  assert.equal((await request(`/communities/${c.id}/members/${dani.id}/kick`, { method: 'POST', as: beto, body: {} })).status, 403);
  assert.equal((await request(`/communities/${c.id}/bans/${beto.id}`, { method: 'PUT', as: caro, body: {} })).status, 204);
});

test('T-50: expulsar permite volver con invitación; banear lo impide mientras siga vigente', async () => {
  const c = await community(); await member(c, beto); await member(c, caro);
  const inv = (await request(`/communities/${c.id}/invitations`, { method: 'POST', as: ana, body: { usosMaximos: 5 } })).body.invitacion;
  assert.equal((await request(`/communities/${c.id}/members/${beto.id}/kick`, { method: 'POST', as: ana, body: { motivo: 'insultos' } })).status, 204);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id, idUsuario: beto.id } }), 0);
  assert.ok([200, 201].includes((await request(`/invitations/${inv.codigo}/accept`, { method: 'POST', as: beto })).status));

  assert.equal((await request(`/communities/${c.id}/bans/${caro.id}`, { method: 'PUT', as: ana, body: { motivo: 'spam' } })).status, 204);
  assert.equal((await request(`/invitations/${inv.codigo}/accept`, { method: 'POST', as: caro })).status, 403);
  const log = (await audit(c)).map((a) => a.accion);
  assert.ok(log.includes('Expulsó a @beto. Motivo: insultos'));
  assert.ok(log.includes('Baneó a @caro (sin vencimiento). Motivo: spam'));
});

const propose = (c, body, as = ana) => request(`/communities/${c.id}/moderation/proposals`, { method: 'POST', as, body });
const confirm = (c, id, as = ana) => request(`/communities/${c.id}/moderation/proposals/${id}/confirm`, { method: 'POST', as, body: {} });
const cancel = (c, id, as = ana) => request(`/communities/${c.id}/moderation/proposals/${id}/cancel`, { method: 'POST', as, body: {} });

test('T-51: la vista previa identifica persona, medida, comunidad y efectos sin aplicar nada', async () => {
  const c = await community(); await member(c, beto);
  const r = await propose(c, { pedido: 'Silenciá a beto en el chat por una hora, hace spam' });
  assert.equal(r.status, 200);
  assert.equal(r.body.estado, 'LISTA'); assert.equal(r.body.confirmable, true);
  const p = r.body.propuesta;
  assert.equal(p.destinatario.id, beto.id); assert.equal(p.medida, 'SILENCIAR'); assert.equal(p.alcance, 'TEXTO');
  assert.equal(p.comunidad.id, c.id); assert.ok(p.efectos.length > 2); assert.ok(p.venceEn);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].input, JSON.stringify({ pedido: 'Silenciá a beto en el chat por una hora, hace spam' }));
  assert.equal(await prisma.silencioComunidad.count(), 0);
  assert.equal(await prisma.auditoria.count({ where: { idComunidad: c.id } }), 0);
});

test('T-51: destino ambiguo, inexistente, fuera de permisos o respuesta inválida no son confirmables', async () => {
  const c = await community(); await member(c, beto); await member(c, caro, 'ADMIN'); await member(c, dani);
  const extra = await register('beto2', 'Beto Ruiz'); await member(c, extra);
  ai({ destinatario: 'Bet', medida: 'EXPULSAR' });
  let r = await propose(c, { pedido: 'Echá a Bet' });
  assert.equal(r.body.estado, 'AMBIGUO'); assert.equal(r.body.confirmable, false);
  assert.deepEqual(r.body.candidatos.map((u) => u.id).sort(), [beto.id, extra.id].sort());
  r = await propose(c, { pedido: 'Echá a Bet', idDestinatario: extra.id });
  assert.equal(r.body.estado, 'LISTA'); assert.equal(r.body.propuesta.destinatario.id, extra.id);

  ai({ destinatario: 'pedro', medida: 'BANEAR' });
  assert.equal((await propose(c, { pedido: 'Baneá a pedro' })).status, 422);
  ai({ destinatario: 'caro', medida: 'BANEAR' });
  r = await propose(c, { pedido: 'Baneá a caro' }, dani);
  assert.equal(r.body.estado, 'NO_PERMITIDA'); assert.equal(r.body.confirmable, false); assert.equal(r.body.propuesta.id, null);
  ai({ destinatario: 'beto', medida: 'NINGUNA' });
  assert.equal((await propose(c, { pedido: 'Borrá todos los mensajes' })).status, 422);
  provider = () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: 'no es json' }] }] }) });
  assert.equal((await propose(c, { pedido: 'Silenciá a beto' })).status, 503);
  assert.equal(await prisma.propuestaModeracion.count({ where: { idDestinatario: caro.id } }), 0);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id } }), 5);
});

test('T-52: confirmar aplica una sola vez la medida revisada y la audita', async () => {
  const c = await community(); await member(c, beto);
  const { propuesta } = (await propose(c, { pedido: 'Silenciá a beto en el chat por una hora' })).body;
  const [a, b] = await Promise.all([confirm(c, propuesta.id), confirm(c, propuesta.id)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.ok(!(await myChannel(await textChannel(c), beto)).misPermisos.includes('ESCRIBIR'));
  const row = await prisma.propuestaModeracion.findUnique({ where: { id: propuesta.id } });
  assert.equal(row.estado, 'CONFIRMADA'); assert.equal(row.idConfirmador, ana.id); assert.equal(row.idSolicitante, ana.id); assert.ok(row.fechaResolucion);
  const log = (await audit(c)).map((x) => x.accion);
  assert.equal(log.filter((x) => x.startsWith('Con IA: Silenció a @beto')).length, 1);
});

test('T-52: cancelar, vencer, perder permisos o que confirme otra persona impide ejecutar', async () => {
  const c = await community(); await member(c, beto); await member(c, caro, 'ADMIN'); await member(c, dani);
  ai({ destinatario: 'dani', medida: 'EXPULSAR' });
  let { propuesta } = (await propose(c, { pedido: 'Echá a dani' }, caro)).body;
  assert.equal((await confirm(c, propuesta.id, ana)).status, 404); // solo quien la preparó
  assert.equal((await cancel(c, propuesta.id, caro)).status, 200);
  assert.equal((await confirm(c, propuesta.id, caro)).status, 409);

  ({ propuesta } = (await propose(c, { pedido: 'Echá a dani' }, caro)).body);
  await prisma.propuestaModeracion.update({ where: { id: propuesta.id }, data: { fechaVencimiento: new Date(Date.now() - 1000) } });
  assert.equal((await confirm(c, propuesta.id, caro)).status, 410);

  ({ propuesta } = (await propose(c, { pedido: 'Echá a dani' }, caro)).body);
  await prisma.membresia.update({ where: { idComunidad_idUsuario: { idComunidad: c.id, idUsuario: caro.id } }, data: { rol: 'INTEGRANTE' } });
  assert.equal((await confirm(c, propuesta.id, caro)).status, 403);
  assert.equal((await prisma.propuestaModeracion.findUnique({ where: { id: propuesta.id } })).estado, 'PENDIENTE');
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id, idUsuario: dani.id } }), 1);
});

test('T-52: confirmar un baneo corta el acceso de la persona', async () => {
  const c = await community(); await member(c, beto);
  ai({ destinatario: '@beto', medida: 'BANEAR', duracion: '5_HORAS', motivo: 'amenazas' });
  const { propuesta } = (await propose(c, { pedido: 'Baneá a @beto 5 horas por amenazas' })).body;
  assert.equal((await confirm(c, propuesta.id)).status, 200);
  assert.equal(await prisma.membresia.count({ where: { idComunidad: c.id, idUsuario: beto.id } }), 0);
  const ban = await prisma.comunidadBaneo.findUnique({ where: { idComunidad_idUsuario: { idComunidad: c.id, idUsuario: beto.id } } });
  assert.ok(ban.fechaVencimiento > new Date()); assert.equal(ban.motivo, 'amenazas'); assert.equal(ban.idAutor, ana.id);
  assert.equal((await request(`/channels/${(await textChannel(c)).id}`, { as: beto })).status, 404);
});
