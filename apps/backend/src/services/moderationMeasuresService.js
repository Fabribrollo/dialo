import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { activeSilence } from '../utils/channelPermissions.js';
import { usuarioPublicoSelect, toUsuarioPublico } from '../utils/selects.js';
import { requireCommunityPermission, communityPermissions } from './communityPermissionsService.js';
import { DURACIONES_SILENCIO, protectModerationTarget, vencimiento, etiquetaAlcance, etiquetaDuracion } from '../utils/moderationRules.js';
export { DURACIONES_SILENCIO, DURACIONES_BANEO, protectModerationTarget, etiquetaAlcance, etiquetaDuracion } from '../utils/moderationRules.js';
import { withCommunityAccessChange } from './channelsService.js';
import { emitToCommunity, emitToUser } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

// F-14 / T-50. Medidas manuales: silenciar, expulsar y banear.
// Silenciar limita la participación sin quitar la membresía; expulsar la retira
// (volver requiere invitación); banear además bloquea el reingreso.

const key = (idComunidad, idUsuario) => ({ idComunidad_idUsuario: { idComunidad, idUsuario } });

// La auditoría registra al actor real y la medida concreta, nunca contenido de mensajes.
export async function auditModeration(tx, idComunidad, idActor, texto) {
  await tx.auditoria.create({ data: { idComunidad, idActor, accion: texto.length > 140 ? `${texto.slice(0, 139)}…` : texto } });
}

async function handleOf(tx, idUsuario) {
  const usuario = await tx.usuario.findUnique({ where: { id: idUsuario }, select: { nombreUsuario: true } });
  return usuario ? `@${usuario.nombreUsuario}` : `usuario ${idUsuario}`;
}

// Qué puede hacer el actor y sobre quién. Lo usan la vista previa (T-51) y la ejecución.
export async function checkMeasure(tx, idComunidad, actor, target, medida) {
  const actorPerms = await communityPermissions(idComunidad, actor, tx);
  if (!actorPerms.rol) throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe');
  const admin = ['ADMIN', 'PROPIETARIO'].includes(actorPerms.rol);
  if (medida === 'SILENCIAR' && !actorPerms.permisos.includes('SILENCIAR')) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Tu rol no permite silenciar integrantes');
  if (medida === 'EXPULSAR' && !admin) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Solo la administración puede expulsar integrantes');
  if (medida === 'BANEAR' && !admin) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Solo la administración puede banear integrantes');
  const member = await tx.membresia.findUnique({ where: key(idComunidad, target), select: { rol: true } });
  if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'La persona ya no es integrante de esta comunidad');
  protectModerationTarget(actor, target, actorPerms.rol, member.rol);
  if (medida === 'SILENCIAR' && member.rol === 'ADMIN') throw new AppError(403, 'INSUFFICIENT_ROLE', 'Los administradores no se pueden silenciar');
  return { actorRole: actorPerms.rol, targetRole: member.rol };
}

const timers = new Map();
function scheduleExpiry(idComunidad, idUsuario, fecha) {
  const id = `${idComunidad}:${idUsuario}`;
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (!fecha) return;
  const ms = Math.min(Math.max(fecha.getTime() - Date.now(), 0) + 500, 2 ** 31 - 1);
  const timer = setTimeout(() => {
    timers.delete(id);
    expireSilence(idComunidad, idUsuario).catch(error => console.error(error));
  }, ms);
  timer.unref?.();
  timers.set(id, timer);
}

// Al vencer, se borra el registro y se publican los permisos recuperados.
// El vencimiento también se respeta sin el temporizador: los permisos lo comparan con la hora actual.
async function expireSilence(idComunidad, idUsuario) {
  let removed;
  try {
    removed = await withCommunityAccessChange(idComunidad, tx =>
      tx.silencioComunidad.deleteMany({ where: { idComunidad, idUsuario, fechaVencimiento: { lte: new Date() } } }));
  } catch (error) {
    if (error?.code === 'COMMUNITY_NOT_FOUND') return;
    throw error;
  }
  if (removed?.count) {
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario });
    emitToUser(idUsuario, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario });
  }
}

export async function restoreSilenceTimers() {
  const pendientes = await prisma.silencioComunidad.findMany({ where: { fechaVencimiento: { not: null } }, select: { idComunidad: true, idUsuario: true, fechaVencimiento: true } });
  for (const s of pendientes) scheduleExpiry(s.idComunidad, s.idUsuario, s.fechaVencimiento);
}

// `options.inTx` corre dentro de la misma transacción antes de aplicar la medida:
// la confirmación de una propuesta la reclama ahí para que se ejecute una sola vez.
export async function silenceMember(idComunidad, actor, target, { alcance, duracion, motivo = null }, options = {}) {
  if (!Object.hasOwn(DURACIONES_SILENCIO, duracion)) throw new AppError(400, 'VALIDATION_ERROR', 'Duración inválida');
  const saved = await withCommunityAccessChange(idComunidad, async tx => {
    await checkMeasure(tx, idComunidad, actor, target, 'SILENCIAR');
    await options.inTx?.(tx);
    const fechaVencimiento = vencimiento(DURACIONES_SILENCIO, duracion);
    const data = { alcance, motivo: motivo || null, fechaVencimiento, idAutor: actor, fechaCreacion: new Date() };
    await tx.silencioComunidad.upsert({ where: key(idComunidad, target), create: { idComunidad, idUsuario: target, ...data }, update: data });
    await auditModeration(tx, idComunidad, options.auditActor ?? actor,
      `${options.auditPrefix ?? ''}Silenció a ${await handleOf(tx, target)} (${etiquetaAlcance(alcance)}, ${etiquetaDuracion(duracion)})${motivo ? `. Motivo: ${motivo}` : ''}`);
    return { fechaVencimiento };
  }, undefined, ({ fechaVencimiento }) => {
    scheduleExpiry(idComunidad, target, fechaVencimiento);
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario: target });
    emitToUser(target, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario: target });
  });
  return { alcance, duracion, fechaVencimiento: saved.fechaVencimiento };
}

export async function liftSilence(idComunidad, actor, target) {
  const removed = await withCommunityAccessChange(idComunidad, async tx => {
    const existing = await tx.silencioComunidad.findUnique({ where: key(idComunidad, target) });
    if (!existing) return false;
    await requireCommunityPermission(idComunidad, actor, 'SILENCIAR', tx);
    const member = await tx.membresia.findUnique({ where: key(idComunidad, target), select: { rol: true } });
    if (member) {
      const { rol } = await communityPermissions(idComunidad, actor, tx);
      protectModerationTarget(actor, target, rol, member.rol);
    }
    await tx.silencioComunidad.delete({ where: key(idComunidad, target) });
    await auditModeration(tx, idComunidad, actor, `Levantó el silencio de ${await handleOf(tx, target)}`);
    return true;
  }, undefined, done => {
    if (!done) return;
    scheduleExpiry(idComunidad, target, null);
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario: target });
    emitToUser(target, EVENTS.COMMUNITY_MODERATION_CHANGED, { idComunidad, idUsuario: target });
  });
  return removed;
}

// Silencios vigentes de la comunidad, para quien puede gestionarlos.
export async function listSilences(idComunidad, actor) {
  await requireCommunityPermission(idComunidad, actor, 'SILENCIAR');
  const rows = await prisma.silencioComunidad.findMany({
    where: { idComunidad, OR: [{ fechaVencimiento: null }, { fechaVencimiento: { gt: new Date() } }] },
    orderBy: { fechaCreacion: 'desc' },
    select: { alcance: true, motivo: true, fechaVencimiento: true, fechaCreacion: true, usuario: { select: usuarioPublicoSelect }, autor: { select: usuarioPublicoSelect } },
  });
  return rows.filter(r => activeSilence(r)).map(({ usuario, autor, ...r }) => ({ ...r, usuario: toUsuarioPublico(usuario), autor: autor ? toUsuarioPublico(autor) : null }));
}

// El silencio propio, para que la interfaz explique por qué no puede escribir o hablar.
export async function mySilence(idComunidad, idUsuario, db = prisma) {
  const s = await db.silencioComunidad.findUnique({ where: key(idComunidad, idUsuario), select: { alcance: true, fechaVencimiento: true } });
  return activeSilence(s) ? s : null;
}
