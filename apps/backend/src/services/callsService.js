import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import { findAuthUserBySessionId } from './authService.js';
import { getChannelPermissions, onChannelAccessChange, requireChannelPermission, withChannelPermission } from './channelsService.js';
import { cerrarSalas, cortarLlamadas } from './callCleanup.js';
import { idCanalDeSala, media, onMediaEvent, TOKEN_TTL_SEGUNDOS } from './mediaService.js';
import { emitToChannel, onSessionEnded } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

const TIPOS_LLAMADA = ['VOZ', 'VIDEO'];
const noDisponible = () => new AppError(503, 'MEDIA_UNAVAILABLE', 'Las llamadas no estan disponibles en este momento');

// Fuentes que el token permite publicar: microfono con HABLAR, camara y pantalla con TRANSMITIR.
export function fuentesPermitidas(permisos) {
  return [
    ...(permisos.includes('HABLAR') ? ['microfono'] : []),
    ...(permisos.includes('TRANSMITIR') ? ['camara', 'pantalla'] : []),
  ];
}

const participanteSelect = { idUsuario: true, fechaConexion: true, usuario: { select: usuarioPublicoSelect } };
const toParticipante = (p) => ({ usuario: toUsuarioPublico(p.usuario), desde: p.fechaConexion });
const avisar = (idCanal, evento, payload) => emitToChannel(idCanal, evento, payload).catch((error) => console.error(error));

export async function joinCall(idCanal, usuario, idSesion) {
  if (!media.configurado) throw noDisponible();
  const ingreso = randomUUID();
  const { permisos } = await withChannelPermission(idCanal, usuario.id, 'VER', async (tx, context) => {
    if (!TIPOS_LLAMADA.includes(context.canal.tipo)) {
      throw new AppError(400, 'NOT_A_CALL_CHANNEL', 'Este canal no admite llamadas');
    }
    const actual = await tx.participanteLlamada.findUnique({ where: { idUsuario: usuario.id } });
    if (actual?.conectado && actual.idCanal !== idCanal) {
      throw new AppError(409, 'ALREADY_IN_CALL', 'Ya estas en otra llamada', [{ campo: 'idCanal', message: 'Llamada activa', idCanal: actual.idCanal }]);
    }
    // Un ingreso nuevo invalida el anterior: un token viejo ya no coincide.
    const datos = { idCanal, ingreso, idSesion, conectado: false, fechaAutorizacion: new Date(), fechaConexion: null };
    await tx.participanteLlamada.upsert({ where: { idUsuario: usuario.id }, create: { idUsuario: usuario.id, ...datos }, update: datos });
    return context;
  });
  const { url, token, sala, expiraEn } = await media.crearToken({
    idUsuario: usuario.id, nombre: usuario.nombreVisible, idCanal, fuentes: fuentesPermitidas(permisos), ingreso,
  });
  return { url, token, sala, expiraEn, misPermisos: permisos };
}

export async function leaveCall(idCanal, idUsuario) {
  const { count } = await prisma.participanteLlamada.deleteMany({ where: { idUsuario, idCanal } });
  if (!count) return;
  // Si LiveKit no responde, la reconciliacion lo saca despues.
  await media.sacarParticipante(idCanal, idUsuario).catch(() => {});
  avisar(idCanal, EVENTS.CALL_PARTICIPANT_LEFT, { idCanal, idUsuario });
}

export async function listCallParticipants(idCanal, idUsuario) {
  await requireChannelPermission(idCanal, idUsuario, 'VER');
  const lista = await prisma.participanteLlamada.findMany({
    where: { idCanal, conectado: true }, orderBy: [{ fechaConexion: 'asc' }, { idUsuario: 'asc' }], select: participanteSelect,
  });
  return lista.map(toParticipante);
}

// Permisos actuales del participante, o null si su sesion ya no sirve o perdio VER.
async function permisosVigentes(participante) {
  if (participante.idSesion && !(await findAuthUserBySessionId(participante.idSesion))) return null;
  const permisos = await getChannelPermissions(participante.idCanal, participante.idUsuario);
  return permisos.includes('VER') ? permisos : null;
}

async function alEntrar(idCanal, { idUsuario, ingreso }) {
  const participante = await prisma.participanteLlamada.findUnique({ where: { idUsuario } });
  const permisos = participante && participante.ingreso === ingreso && participante.idCanal === idCanal
    ? await permisosVigentes(participante) : null;
  if (!permisos) {
    // Token viejo, ajeno o sin permiso actual: se lo saca en el momento.
    await media.sacarParticipante(idCanal, idUsuario).catch(() => {});
    return;
  }
  // Un token anterior puede traer fuentes que ya se quitaron: se aplican los permisos de ahora.
  await media.actualizarPermisos(idCanal, idUsuario, fuentesPermitidas(permisos)).catch(() => {});
  const { count } = await prisma.participanteLlamada.updateMany({
    where: { idUsuario, ingreso, conectado: false }, data: { conectado: true, fechaConexion: new Date() },
  });
  if (!count) return;
  const actual = await prisma.participanteLlamada.findUnique({ where: { idUsuario }, select: participanteSelect });
  avisar(idCanal, EVENTS.CALL_PARTICIPANT_JOINED, { idCanal, participante: toParticipante(actual) });
}

async function alSalir(idCanal, { idUsuario, ingreso }) {
  const { count } = await prisma.participanteLlamada.deleteMany({ where: { idUsuario, idCanal, ingreso } });
  if (count) avisar(idCanal, EVENTS.CALL_PARTICIPANT_LEFT, { idCanal, idUsuario });
}

// Eventos firmados de LiveKit (los verifica mediaService). Repetirlos no cambia el resultado.
export async function procesarEventoMedia(evento) {
  const idCanal = idCanalDeSala(evento.sala);
  if (!idCanal || !evento.idUsuario) return;
  if (evento.tipo === 'participant_joined') await alEntrar(idCanal, evento);
  else if (evento.tipo === 'participant_left') await alSalir(idCanal, evento);
}
onMediaEvent(procesarEventoMedia);

const esCanalDeLlamada = async (idCanal) =>
  TIPOS_LLAMADA.includes((await prisma.canal.findUnique({ where: { id: idCanal }, select: { tipo: true } }))?.tipo);

// Cambios de permisos, roles, baneos y canales (T-31): sin VER se corta la llamada;
// con VER se ajustan en vivo las fuentes que puede publicar.
export async function aplicarCambiosDeAcceso(cambios) {
  const porCanal = Map.groupBy(cambios, (cambio) => cambio.idCanal);
  for (const [idCanal, lista] of porCanal) {
    if (!(await esCanalDeLlamada(idCanal))) {
      // Canal borrado o que dejo de ser de voz o video: se cierra la sala entera.
      await cortarLlamadas({ idCanal });
      await cerrarSalas([idCanal]);
      continue;
    }
    const registros = await prisma.participanteLlamada.findMany({ where: { idCanal, idUsuario: { in: lista.map((c) => c.idUsuario) } } });
    for (const registro of registros) {
      const { despues } = lista.find((c) => c.idUsuario === registro.idUsuario);
      if (!despues.includes('VER')) await cortarLlamadas({ idUsuario: registro.idUsuario, idCanal });
      else if (registro.conectado) await media.actualizarPermisos(idCanal, registro.idUsuario, fuentesPermitidas(despues)).catch(() => {});
    }
  }
}
onChannelAccessChange((cambios) => aplicarCambiosDeAcceso(cambios).catch((error) => console.error(error)));

// Logout corta solo las llamadas de esa sesion; cambiar la contrasena, las de todas las sesiones del usuario.
onSessionEnded(({ idSesion, idUsuario }) => {
  const where = idSesion ? { idSesion } : { idUsuario, idSesion: { not: null } };
  cortarLlamadas(where).catch((error) => console.error(error));
});

// Compara la base con LiveKit por si se perdio algun evento o fallo una revocacion.
// Tambien corta sesiones vencidas o revocadas por fuera y reaplica los permisos actuales.
export async function reconciliarLlamadas() {
  if (!media.configurado) return;
  // Autorizaciones que nunca se usaron antes de que venciera el token.
  await prisma.participanteLlamada.deleteMany({
    where: { conectado: false, fechaAutorizacion: { lt: new Date(Date.now() - TOKEN_TTL_SEGUNDOS * 1000) } },
  });
  let salas;
  try { salas = await media.listarSalas(); } catch { return; }
  const registros = await prisma.participanteLlamada.findMany();
  for (const idCanal of new Set([...registros.map((r) => r.idCanal), ...salas])) {
    if (!(await esCanalDeLlamada(idCanal))) {
      await cortarLlamadas({ idCanal });
      await cerrarSalas([idCanal]);
      continue;
    }
    let enSala;
    try { enSala = await media.listarParticipantes(idCanal); } catch { return; }
    const delCanal = registros.filter((r) => r.idCanal === idCanal);
    const clave = (p) => `${p.idUsuario}:${p.ingreso}`;
    const presentes = new Set(enSala.map(clave));
    const autorizados = new Set(delCanal.map(clave));
    for (const r of delCanal) {
      if (r.conectado && !presentes.has(clave(r))) { await alSalir(idCanal, r); continue; }
      if (!r.conectado) continue;
      const permisos = await permisosVigentes(r);
      if (!permisos) await cortarLlamadas({ idUsuario: r.idUsuario, idCanal });
      else await media.actualizarPermisos(idCanal, r.idUsuario, fuentesPermitidas(permisos)).catch(() => {});
    }
    for (const p of enSala) if (!autorizados.has(clave(p))) await media.sacarParticipante(idCanal, p.idUsuario).catch(() => {});
  }
}

export function iniciarReconciliacion(intervaloMs = 60 * 1000) {
  setInterval(() => reconciliarLlamadas().catch((error) => console.error(error)), intervaloMs).unref();
}
