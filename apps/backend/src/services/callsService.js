import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import { findAuthUserBySessionId } from './authService.js';
import { getChannelPermissions, requireChannelPermission, withChannelPermission } from './channelsService.js';
import { idCanalDeSala, media, onMediaEvent, TOKEN_TTL_SEGUNDOS } from './mediaService.js';
import { emitToChannel } from '../sockets/emitter.js';
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

async function sigueAutorizado(participante) {
  if (participante.idSesion && !(await findAuthUserBySessionId(participante.idSesion))) return false;
  return (await getChannelPermissions(participante.idCanal, participante.idUsuario)).includes('VER');
}

async function alEntrar(idCanal, { idUsuario, ingreso }) {
  const participante = await prisma.participanteLlamada.findUnique({ where: { idUsuario } });
  const valido = participante && participante.ingreso === ingreso && participante.idCanal === idCanal && await sigueAutorizado(participante);
  if (!valido) {
    // Token viejo, ajeno o sin permiso actual: se lo saca en el momento.
    await media.sacarParticipante(idCanal, idUsuario).catch(() => {});
    return;
  }
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

// Compara la base con lo que realmente hay en LiveKit, por si se perdio algun evento.
export async function reconciliarLlamadas() {
  if (!media.configurado) return;
  // Autorizaciones que nunca se usaron antes de que venciera el token.
  await prisma.participanteLlamada.deleteMany({
    where: { conectado: false, fechaAutorizacion: { lt: new Date(Date.now() - TOKEN_TTL_SEGUNDOS * 1000) } },
  });
  const registros = await prisma.participanteLlamada.findMany({ select: { idUsuario: true, idCanal: true, ingreso: true, conectado: true } });
  for (const idCanal of new Set(registros.map((r) => r.idCanal))) {
    let enSala;
    try { enSala = await media.listarParticipantes(idCanal); } catch { return; }
    const delCanal = registros.filter((r) => r.idCanal === idCanal);
    const clave = (p) => `${p.idUsuario}:${p.ingreso}`;
    const presentes = new Set(enSala.map(clave));
    const autorizados = new Set(delCanal.map(clave));
    for (const r of delCanal) if (r.conectado && !presentes.has(clave(r))) await alSalir(idCanal, r);
    for (const p of enSala) if (!autorizados.has(clave(p))) await media.sacarParticipante(idCanal, p.idUsuario).catch(() => {});
  }
}

export function iniciarReconciliacion(intervaloMs = 60 * 1000) {
  setInterval(() => reconciliarLlamadas().catch((error) => console.error(error)), intervaloMs).unref();
}
