import { requireCommunityPermission } from './communityPermissionsService.js';
import { accessNotices, publishNotices } from './notificationsService.js';
import { CHANNEL_PERMISSIONS } from '../utils/channelPermissions.js';
import { trackEffect } from '../utils/backgroundEffects.js';
import { prisma } from '../prisma/client.js';
import { requireRole } from './communitiesService.js';
import { AppError } from '../utils/AppError.js';
import { canModerateChannel, channelSelect, effectiveChannelPermissions, memberRoleIds, memberSelect, toChannel } from '../utils/channelPermissions.js';
import { closeChannel, emitToCommunity, emitToUser, leaveChannel } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';

const notFound = () => new AppError(404, 'CHANNEL_NOT_FOUND', 'El canal no existe');
const canAdminister = (rol) => rol === 'ADMIN' || rol === 'PROPIETARIO';
export { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';

async function channelContext(db, idCanal, idUsuario) {
  // Prisma puede resolver relaciones en consultas separadas. Una instantánea
  // evita leer el canal y perder su comunidad durante un borrado concurrente.
  if (db === prisma) return prisma.$transaction((tx) => channelContext(tx,idCanal,idUsuario), {isolationLevel:'RepeatableRead'});
  const canal = await db.canal.findUnique({ where: { id: idCanal }, select: channelSelect });
  if (!canal) return null;
  const membresia = await db.membresia.findUnique({
    where: { idComunidad_idUsuario: { idComunidad: canal.idComunidad, idUsuario } }, select: memberSelect,
  });
  const permisos = effectiveChannelPermissions(canal, membresia?.rol, idUsuario, memberRoleIds(membresia));
  return { canal, rol: membresia?.rol, permisos };
}

async function requireChannel(db, idCanal, idUsuario, admin = false) {
  const context = await channelContext(db, idCanal, idUsuario);
  if (!context?.permisos.includes('VER')) throw notFound();
  if (admin && !canAdminister(context.rol) && !context.permisos.includes('GESTIONAR_CANALES')) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Tu rol no permite administrar canales');
  return context;
}

export async function getChannelPermissions(idCanal, idUsuario, db = prisma) {
  return (await channelContext(db, idCanal, idUsuario))?.permisos ?? [];
}

// HTTP y sockets deben consultar esta autorización en cada operación, incluso
// si el socket ya está en la room. El cliente nunca aporta su rol ni permisos.
export async function requireChannelPermission(idCanal, idUsuario, permiso = 'VER', db = prisma) {
  const context = await requireChannel(db, idCanal, idUsuario);
  if (!context.permisos.includes(permiso)) {
    const code = permiso === 'ESCRIBIR' ? 'NO_WRITE_PERMISSION' : 'NO_CHANNEL_PERMISSION';
    throw new AppError(403, code, 'No tenés permiso para realizar esta operación en el canal');
  }
  return context;
}

export async function requireChannelModerator(idCanal, idUsuario, db = prisma) {
  const context = await requireChannelPermission(idCanal, idUsuario, 'VER', db);
  if (!canModerateChannel(context.rol, context.permisos)) {
    throw new AppError(403, 'CANNOT_MODERATE_CHANNEL', 'Tu rol no permite moderar este canal');
  }
  return context;
}

// Coordina comprobación y operación con cambios de acceso/tipo/borrado.
// El callback usa tx para evitar consultar permisos fuera de la transacción.
export async function withChannelPermission(idCanal, idUsuario, permiso, operation, afterCommit) {
  const original = await prisma.canal.findUnique({ where: { id: idCanal }, select: { idComunidad: true } });
  if (!original) throw notFound();
  return withCommunityChannelsLock(original.idComunidad, async (tx) => {
    const context = await requireChannelPermission(idCanal, idUsuario, permiso, tx);
    return operation(tx, context);
  }, notFound, afterCommit);
}

export async function getChannel(idCanal, idUsuario) {
  const { canal, permisos } = await requireChannel(prisma, idCanal, idUsuario);
  return toChannel(canal, permisos);
}

export async function listChannels(idComunidad, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    const idsRoles = memberRoleIds(await tx.membresia.findUnique({
      where: { idComunidad_idUsuario: { idComunidad, idUsuario } }, select: memberSelect,
    }));
    const canales = await tx.canal.findMany({ where: { idComunidad }, orderBy: [{ posicion: 'asc' }, { id: 'asc' }], select: channelSelect });
    const requests = await tx.solicitudAccesoCanal.findMany({where:{idComunidad,idUsuario},select:{idCanal:true,estado:true}});
    const states = new Map(requests.map(q=>[q.idCanal,q.estado]));
    return canales.map((canal) => {
      const permisos = effectiveChannelPermissions(canal, rol, idUsuario, idsRoles);
      return {...toChannel(canal, permisos), solicitud: states.get(canal.id) ?? null};
    });
  });
}

export function audience(canal, miembros) {
  return new Map(miembros.map((m) => [m.idUsuario, effectiveChannelPermissions(canal, m.rol, m.idUsuario, memberRoleIds(m))]));
}
export const getChannelMembers = (tx, idComunidad) => tx.membresia.findMany({ where: { idComunidad }, select: memberSelect });

// Diferencias de permisos por integrante en un canal.
function channelChanges(canal, before, after) {
  const changes = [];
  for (const idUsuario of new Set([...before.keys(), ...after.keys()])) {
    const antes = before.get(idUsuario) ?? [], despues = after.get(idUsuario) ?? [];
    if (antes.join() !== despues.join()) changes.push({ idComunidad: canal.idComunidad, idCanal: canal.id, idUsuario, antes, despues });
  }
  return changes;
}

const accessListeners = new Set();
// Punto de integracion para cortar fuentes multimedia cuando cambian los permisos (T-40).
export function onChannelAccessChange(listener) {
  accessListeners.add(listener);
  return () => accessListeners.delete(listener);
}
function notifyAccessChanges(changes) {
  if (!changes.length) return;
  for (const listener of accessListeners) {
    try { trackEffect(listener(changes)); } catch (error) { console.error(error); }
  }
}

async function communityAccess(tx, idComunidad) {
  const [canales, miembros] = await Promise.all([
    tx.canal.findMany({ where: { idComunidad }, select: channelSelect }),
    getChannelMembers(tx, idComunidad),
  ]);
  return new Map(canales.map((canal) => [canal.id, { canal, permisos: audience(canal, miembros) }]));
}

// Quien pierde VER sale del canal; quien cambia permisos recibe el canal actualizado.
export function publishAccessDiff(before, after) {
  const changes = [];
  for (const [idCanal, previo] of before) {
    const actual = after.get(idCanal);
    if (!actual) continue;
    for (const change of channelChanges(actual.canal, previo.permisos, actual.permisos)) {
      changes.push(change);
      if (change.antes.includes('VER') && !change.despues.includes('VER')) {
        leaveChannel(idCanal, change.idUsuario);
        emitToUser(change.idUsuario, EVENTS.CHANNEL_ACCESS_LOST, { idComunidad: actual.canal.idComunidad, idCanal });
      } else if (change.despues.includes('VER')) {
        emitToUser(change.idUsuario, EVENTS.CHANNEL_UPDATED, { canal: toChannel(actual.canal, change.despues) });
      }
    }
  }
  notifyAccessChanges(changes);
  if (changes.length) emitToCommunity(changes[0].idComunidad, 'channels:catalog-changed', {idComunidad: changes[0].idComunidad});
  return changes;
}

// Para cambios de roles, asignaciones o membresias (T-29, T-30, T-41): compara los accesos
// antes y despues bajo el bloqueo de la comunidad y publica las diferencias despues del commit.
export async function withCommunityAccessChange(idComunidad, operation, missing, afterCommit) {
  const saved = await withCommunityChannelsLock(idComunidad, async (tx) => {
    const before = await communityAccess(tx, idComunidad);
    const result = await operation(tx);
    const after = await communityAccess(tx, idComunidad);
    const notices = [];
    for (const [id, prev] of before) {
      const next = after.get(id);
      if (next) notices.push(...await accessNotices(tx, next.canal, prev.permisos, next.permisos));
    }
    return { result, before, after, notices };
  }, missing, async (saved) => {
    publishAccessDiff(saved.before, saved.after);
    publishNotices(saved.notices);
    await afterCommit?.(saved.result);
  });
  return saved.result;
}

export function publishChannelChange(canal, before, after, event = EVENTS.CHANNEL_UPDATED) {
  for (const [idUsuario, permisos] of before) if (permisos.includes('VER') && !after.get(idUsuario)?.includes('VER')) {
    leaveChannel(canal.id, idUsuario);
    emitToUser(idUsuario, EVENTS.CHANNEL_ACCESS_LOST, { idComunidad: canal.idComunidad, idCanal: canal.id });
  }
  for (const [idUsuario, permisos] of after) if (permisos.includes('VER')) {
    emitToUser(idUsuario, event, { canal: toChannel(canal, permisos) });
  }
  notifyAccessChanges(channelChanges(canal, before, after));
  emitToCommunity(canal.idComunidad, 'channels:catalog-changed', {idComunidad:canal.idComunidad});
}

export function channelPermissions(tipo, values) {
  const allowed = CHANNEL_PERMISSIONS[tipo] ?? [];
  if (values.some(p => !allowed.includes(p))) throw new AppError(400, 'INVALID_CHANNEL_PERMISSIONS', 'Algún permiso no corresponde al tipo de canal');
  const result = new Set(values);
  result.add('VER');
  return allowed.filter(p=>result.has(p));
}

export const createChannelRecord = (tx, idComunidad, datos) => tx.canal.create({ data: { idComunidad, ...datos }, select: channelSelect });
export const updateChannelRecord = (tx, id, datos) => tx.canal.update({ where: { id }, data: datos, select: channelSelect });
export const deleteChannelRecord = (tx, id) => tx.canal.delete({ where: { id } });

export async function createChannel(idComunidad, idUsuario, datos) {
  const saved = await withCommunityChannelsLock(idComunidad, async (tx) => {
    const actor=await requireCommunityPermission(idComunidad,idUsuario,'GESTIONAR_CANALES',tx);
    const {rol}=actor;
    const last = await tx.canal.aggregate({ where: { idComunidad }, _max: { posicion: true } });
    const defaults = datos.tipo === 'TEXTO' ? ['VER','ESCRIBIR'] : ['VER','HABLAR'];
    const permisosGlobales = channelPermissions(datos.tipo, datos.privado ? [] : datos.permisosGlobales ?? defaults);
    if(!canAdminister(rol)&&permisosGlobales.some(p=>!['VER','ESCRIBIR','HABLAR'].includes(p)&&!actor.permisos.includes(p)))throw new AppError(403,'ROLE_PRIVILEGE_ESCALATION','No podés otorgar permisos que no tenés');
    const canal = await createChannelRecord(tx, idComunidad, { ...datos, permisosGlobales, posicion: (last._max.posicion ?? -1) + 1 });
    return { canal, rol, after: audience(canal, await getChannelMembers(tx, idComunidad)) };
  }, undefined, (saved) => publishChannelChange(saved.canal, new Map(), saved.after, EVENTS.CHANNEL_CREATED));
  return toChannel(saved.canal, saved.after.get(idUsuario) ?? []);
}

export async function mutateChannel(idCanal, idUsuario, operation, afterCommit) {
  const original = await prisma.canal.findUnique({ where: { id: idCanal }, select: { idComunidad: true } });
  if (!original) throw notFound();
  return withCommunityChannelsLock(original.idComunidad, async (tx) => {
    const context = await requireChannel(tx, idCanal, idUsuario, true);
    const miembros = await getChannelMembers(tx, original.idComunidad);
    const result = await operation(tx, context, miembros);
    if (result?.before && result?.after) result.notices = await accessNotices(tx, result.canal, result.before, result.after);
    return result;
  }, notFound, async (result) => { publishNotices(result?.notices); await afterCommit?.(result); });
}

export async function updateChannel(idCanal, idUsuario, cambios) {
  const saved = await mutateChannel(idCanal, idUsuario, async (tx, { canal: previous, rol }, miembros) => {
    if ('privado' in cambios || 'tipo' in cambios) throw new AppError(400,'CHANNEL_TYPE_IMMUTABLE','El tipo y la privacidad del canal se definen al crearlo');
    const canal = await updateChannelRecord(tx, idCanal, cambios);
    return { canal, rol, before: audience(previous, miembros), after: audience(canal, miembros) };
  }, (saved) => publishChannelChange(saved.canal, saved.before, saved.after));
  return toChannel(saved.canal, saved.after.get(idUsuario) ?? []);
}

export async function deleteChannel(idCanal, idUsuario) {
  await mutateChannel(idCanal, idUsuario, async (tx, { canal }, miembros) => {
    const before = audience(canal, miembros);
    await deleteChannelRecord(tx, idCanal);
    return { canal, before };
  }, (saved) => publishDeletedChannel(saved.canal, saved.before));
}

export function publishDeletedChannel(canal, before) {
  closeChannel(canal.id);
  emitToCommunity(canal.idComunidad, 'channels:catalog-changed', {idComunidad:canal.idComunidad});
  notifyAccessChanges(channelChanges(canal, before, new Map()));
  for (const [id, permisos] of before) if (permisos.includes('VER')) {
    emitToUser(id, EVENTS.CHANNEL_DELETED, {idComunidad:canal.idComunidad,idCanal:canal.id});
  }
}

export async function reorderChannels(idComunidad, idUsuario, orden) {
  await withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireCommunityPermission(idComunidad,idUsuario,'GESTIONAR_CANALES',tx);
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: channelSelect });
    const ids = new Set(canales.map((c) => c.id));
    if (new Set(orden).size !== orden.length || orden.length !== ids.size || orden.some((id) => !ids.has(id))) {
      throw new AppError(400, 'INVALID_ORDER', 'Incluí todos los canales de esta comunidad una sola vez');
    }
    for (const [posicion, id] of orden.entries()) await tx.canal.update({ where: { id }, data: { posicion } });
    return { canales, miembros: await getChannelMembers(tx, idComunidad) };
  }, undefined, (saved) => {
    // No difundir IDs de canales privados a integrantes que no pueden verlos.
    for (const member of saved.miembros) {
      const visible = new Set(saved.canales.filter((c) => effectiveChannelPermissions(c, member.rol, member.idUsuario, memberRoleIds(member)).includes('VER')).map((c) => c.id));
      emitToUser(member.idUsuario, EVENTS.CHANNELS_REORDERED, { idComunidad, orden: orden.filter((id) => visible.has(id)) });
    }
  });
}
