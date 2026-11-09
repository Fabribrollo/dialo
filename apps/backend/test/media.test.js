import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { AccessToken } from 'livekit-server-sdk';

// No usa base de datos ni una cuenta de LiveKit: el proveedor se simula o apunta a un puerto cerrado.
const KEY = 'clave-de-prueba';
const SECRET = 'secreto-de-prueba-con-largo-suficiente-para-firmar';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:9';
process.env.LIVEKIT_API_KEY = KEY;
process.env.LIVEKIT_API_SECRET = SECRET;
process.env.DATABASE_URL ??= 'postgresql://usuario:clave@127.0.0.1:9/sin_base';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const { crearAdaptadorMedia, onMediaEvent, TOKEN_TTL_SEGUNDOS } = await import('../src/services/mediaService.js');
let server, baseUrl;

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const adaptador = (roomService) => crearAdaptadorMedia({ url: 'ws://127.0.0.1:9', apiKey: KEY, apiSecret: SECRET, roomService });
async function firmar(cuerpo, secreto = SECRET) {
  const token = new AccessToken(KEY, secreto);
  token.sha256 = createHash('sha256').update(cuerpo).digest('base64');
  return token.toJwt();
}
const evento = (tipo) => JSON.stringify({
  event: tipo, id: 'EV_1', createdAt: '1790000000',
  room: { name: 'canal-3' },
  participant: { identity: 'usuario-7', metadata: JSON.stringify({ ingreso: 'abc' }) },
});

before(async () => {
  const { app } = await import('../src/app.js');
  server = createServer(app);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('sin configuracion las llamadas quedan deshabilitadas con un error controlado', async () => {
  const sinConfigurar = crearAdaptadorMedia({});
  assert.deepEqual(await sinConfigurar.verificarDisponibilidad(), { disponible: false, motivo: 'NO_CONFIGURADO' });
  await assert.rejects(sinConfigurar.crearToken({ idUsuario: 1, idCanal: 1 }), { code: 'MEDIA_UNAVAILABLE' });
});

test('el token identifica al usuario y la sala, vence pronto y limita las fuentes', async () => {
  const { token, sala, ingreso, expiraEn } = await adaptador().crearToken({ idUsuario: 7, nombre: 'Ana', idCanal: 3, fuentes: ['microfono'] });
  const c = claims(token);
  assert.equal(sala, 'canal-3');
  assert.equal(c.sub, 'usuario-7');
  assert.equal(c.name, 'Ana');
  assert.equal(c.video.room, 'canal-3');
  assert.equal(c.video.roomJoin, true);
  assert.equal(c.video.canSubscribe, true);
  assert.equal(c.video.canPublish, true);
  assert.equal(c.video.canPublishData, false);
  assert.deepEqual(c.video.canPublishSources, ['microphone']);
  assert.equal(c.exp - c.nbf, TOKEN_TTL_SEGUNDOS);
  assert.equal(expiraEn, TOKEN_TTL_SEGUNDOS);
  assert.equal(JSON.parse(c.metadata).ingreso, ingreso);
});

test('solo VER permite escuchar y ver sin publicar; TRANSMITIR habilita camara y pantalla', async () => {
  const oyente = claims((await adaptador().crearToken({ idUsuario: 7, idCanal: 3 })).token);
  assert.equal(oyente.video.canPublish, false);
  assert.equal(oyente.video.canSubscribe, true);
  const transmite = claims((await adaptador().crearToken({ idUsuario: 7, idCanal: 3, fuentes: ['camara', 'pantalla'] })).token);
  assert.deepEqual(transmite.video.canPublishSources.sort(), ['camera', 'screen_share', 'screen_share_audio']);
});

test('cada ingreso tiene un identificador distinto para poder invalidar tokens anteriores', async () => {
  const a = await adaptador().crearToken({ idUsuario: 7, idCanal: 3 });
  const b = await adaptador().crearToken({ idUsuario: 7, idCanal: 3 });
  assert.notEqual(a.ingreso, b.ingreso);
});

test('una caida del proveedor da un error controlado y no cuelga al backend', async () => {
  const caido = adaptador({
    listRooms: () => Promise.reject(new Error('ECONNREFUSED')),
    removeParticipant: () => new Promise(() => {}),
    listParticipants: () => Promise.reject(new Error('ECONNREFUSED')),
  });
  assert.deepEqual(await caido.verificarDisponibilidad(), { disponible: false, motivo: 'SIN_CONEXION' });
  const inicio = Date.now();
  await assert.rejects(caido.sacarParticipante(3, 7), { code: 'MEDIA_UNAVAILABLE' });
  assert(Date.now() - inicio < 5000);
  await assert.rejects(caido.listarParticipantes(3), { code: 'MEDIA_UNAVAILABLE' });
});

test('sacar a alguien que ya no esta no es un error', async () => {
  const llamadas = [];
  const ok = adaptador({ removeParticipant: (sala, identidad) => { llamadas.push([sala, identidad]); return Promise.resolve(); } });
  assert.equal(await ok.sacarParticipante(3, 7), true);
  assert.deepEqual(llamadas, [['canal-3', 'usuario-7']]);
  const ausente = adaptador({ removeParticipant: () => Promise.reject(Object.assign(new Error('no'), { code: 'not_found' })) });
  assert.equal(await ausente.sacarParticipante(3, 7), false);
});

test('los eventos de LiveKit se aceptan solo con firma valida', async () => {
  const cuerpo = evento('participant_joined');
  const recibido = await adaptador().recibirEvento(cuerpo, await firmar(cuerpo));
  assert.deepEqual(recibido, { tipo: 'participant_joined', sala: 'canal-3', idUsuario: 7, ingreso: 'abc', id: 'EV_1', fecha: 1790000000 });
  await assert.rejects(adaptador().recibirEvento(cuerpo, await firmar(cuerpo, 'otro-secreto-con-largo-suficiente-para-firmar')), { code: 'INVALID_WEBHOOK' });
  await assert.rejects(adaptador().recibirEvento(evento('participant_left'), await firmar(cuerpo)), { code: 'INVALID_WEBHOOK' });
  await assert.rejects(adaptador().recibirEvento(cuerpo, undefined), { code: 'INVALID_WEBHOOK' });
});

test('HTTP: la ruta de disponibilidad responde 503 si el proveedor no contesta y el resto de la API sigue', async () => {
  const salud = await fetch(`${baseUrl}/api/media/health`);
  assert.equal(salud.status, 503);
  assert.equal((await salud.json()).error.code, 'MEDIA_UNAVAILABLE');
  assert.deepEqual(await (await fetch(`${baseUrl}/api/health`)).json(), { status: 'ok' });
});

test('HTTP: el webhook firmado llega a los oyentes y uno sin firma se rechaza', async () => {
  const recibidos = [];
  const quitar = onMediaEvent((e) => recibidos.push(e));
  try {
    const cuerpo = evento('participant_left');
    const ok = await fetch(`${baseUrl}/api/media/webhook`, {
      method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/webhook+json', Authorization: await firmar(cuerpo) },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(recibidos.map((e) => [e.tipo, e.idUsuario, e.sala]), [['participant_left', 7, 'canal-3']]);
    const falso = await fetch(`${baseUrl}/api/media/webhook`, {
      method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/webhook+json', Authorization: 'falso' },
    });
    assert.equal(falso.status, 401);
    assert.equal(recibidos.length, 1);
  } finally { quitar(); }
});
