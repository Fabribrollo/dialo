import { prisma } from '../prisma/client.js';
import { Prisma } from '@prisma/client';
import { requireRole } from './communitiesService.js';
import { AppError } from '../utils/AppError.js';
import { channelSelect, effectiveChannelPermissions, toChannel } from '../utils/channelPermissions.js';
import { closeChannel, emitToUser, leaveChannel } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

const notFound = () => new AppError(404, 'CHANNEL_NOT_FOUND', 'El canal no existe');
const canAdminister = (rol) => rol === 'ADMIN' || rol === 'PROPIETARIO';
// Prisma califica sus consultas, pero $queryRaw no adopta automáticamente el
// schema de DATABASE_URL. Escapar el identificador conserva el aislamiento.
const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
const communityTable = Prisma.raw(`"${schema.replaceAll('"', '""')}"."comunidad"`);

// Una fila de comunidad coordina todas las escrituras de sus canales, también
// entre procesos. T-23 debe reutilizar este bloqueo al cambiar las habilitaciones.
export function withCommunityChannelsLock(idComunidad, operation, missing = () => new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe')) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id_comunidad FROM ${communityTable} WHERE id_comunidad = ${idComunidad} FOR UPDATE`;
    if (!rows.length) throw missing();
    return operation(tx);
  }, { maxWait: 10000, timeout: 30000 });
}

async function channelContext(db, idCanal, idUsuario) {
  const canal = await db.canal.findUnique({ where: { id: idCanal }, select: channelSelect });
  if (!canal) return null;
  const membresia = await db.membresia.findUnique({
    where: { idComunidad_idUsuario: { idComunidad: canal.idComunidad, idUsuario } }, select: { rol: true },
  });
  const permisos = effectiveChannelPermissions(canal, membresia?.rol, idUsuario);
  return { canal, rol: membresia?.rol, permisos };
}

async function requireChannel(db, idCanal, idUsuario, admin = false) {
  const context = await channelContext(db, idCanal, idUsuario);
  if (!context?.permisos.includes('VER')) throw notFound();
  if (admin && !canAdminister(context.rol)) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Tu rol no permite administrar canales');
  return context;
}

export async function getChannelPermissions(idCanal, idUsuario, db = prisma) {
  return (await channelContext(db, idCanal, idUsuario))?.permisos ?? [];
}

export async function getChannel(idCanal, idUsuario) {
  const { canal, permisos } = await requireChannel(prisma, idCanal, idUsuario);
  return toChannel(canal, permisos);
}

export async function listChannels(idComunidad, idUsuario) {
  const { rol } = await requireRole(idComunidad, idUsuario);
  const canales = await prisma.canal.findMany({ where: { idComunidad }, orderBy: [{ posicion: 'asc' }, { id: 'asc' }], select: channelSelect });
  return canales.flatMap((canal) => {
    const permisos = effectiveChannelPermissions(canal, rol, idUsuario);
    return permisos.includes('VER') ? [toChannel(canal, permisos)] : [];
  });
}

function audience(canal, miembros) {
  return new Map(miembros.map((m) => [m.idUsuario, effectiveChannelPermissions(canal, m.rol, m.idUsuario)]));
}
const getMembers = (tx, idComunidad) => tx.membresia.findMany({ where: { idComunidad }, select: { idUsuario: true, rol: true } });

export function publishChannelChange(canal, before, after, event = EVENTS.CHANNEL_UPDATED) {
  for (const [idUsuario, permisos] of before) if (permisos.includes('VER') && !after.get(idUsuario)?.includes('VER')) {
    leaveChannel(canal.id, idUsuario);
    emitToUser(idUsuario, EVENTS.CHANNEL_ACCESS_LOST, { idComunidad: canal.idComunidad, idCanal: canal.id });
  }
  for (const [idUsuario, permisos] of after) if (permisos.includes('VER')) {
    emitToUser(idUsuario, event, { canal: toChannel(canal, permisos) });
  }
}

export async function createChannel(idComunidad, idUsuario, datos) {
  const saved = await withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    const last = await tx.canal.aggregate({ where: { idComunidad }, _max: { posicion: true } });
    const canal = await tx.canal.create({ data: { idComunidad, ...datos, posicion: (last._max.posicion ?? -1) + 1 }, select: channelSelect });
    return { canal, rol, after: audience(canal, await getMembers(tx, idComunidad)) };
  });
  publishChannelChange(saved.canal, new Map(), saved.after, EVENTS.CHANNEL_CREATED);
  return toChannel(saved.canal, effectiveChannelPermissions(saved.canal, saved.rol, idUsuario));
}

async function mutateChannel(idCanal, idUsuario, operation) {
  const original = await prisma.canal.findUnique({ where: { id: idCanal }, select: { idComunidad: true } });
  if (!original) throw notFound();
  return withCommunityChannelsLock(original.idComunidad, async (tx) => {
    const context = await requireChannel(tx, idCanal, idUsuario, true);
    const miembros = await getMembers(tx, original.idComunidad);
    return operation(tx, context, miembros);
  }, notFound);
}

export async function updateChannel(idCanal, idUsuario, cambios) {
  const saved = await mutateChannel(idCanal, idUsuario, async (tx, { canal: previous, rol }, miembros) => {
    if (previous.tipo === 'TEXTO' && cambios.tipo && cambios.tipo !== 'TEXTO' && await tx.mensaje.count({ where: { idCanal } })) {
      throw new AppError(409, 'CHANNEL_HAS_MESSAGES', 'No podés cambiar el tipo de un canal de texto que tiene mensajes');
    }
    const canal = await tx.canal.update({ where: { id: idCanal }, data: cambios, select: channelSelect });
    return { canal, rol, before: audience(previous, miembros), after: audience(canal, miembros) };
  });
  publishChannelChange(saved.canal, saved.before, saved.after);
  return toChannel(saved.canal, effectiveChannelPermissions(saved.canal, saved.rol, idUsuario));
}

export async function deleteChannel(idCanal, idUsuario) {
  const saved = await mutateChannel(idCanal, idUsuario, async (tx, { canal }, miembros) => {
    const before = audience(canal, miembros);
    await tx.canal.delete({ where: { id: idCanal } });
    return { canal, before };
  });
  closeChannel(idCanal);
  for (const [id, permisos] of saved.before) if (permisos.includes('VER')) {
    emitToUser(id, EVENTS.CHANNEL_DELETED, { idComunidad: saved.canal.idComunidad, idCanal });
  }
}

export async function reorderChannels(idComunidad, idUsuario, orden) {
  const saved = await withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: channelSelect });
    const ids = new Set(canales.map((c) => c.id));
    if (new Set(orden).size !== orden.length || orden.length !== ids.size || orden.some((id) => !ids.has(id))) {
      throw new AppError(400, 'INVALID_ORDER', 'Incluí todos los canales de esta comunidad una sola vez');
    }
    for (const [posicion, id] of orden.entries()) await tx.canal.update({ where: { id }, data: { posicion } });
    return { canales, miembros: await getMembers(tx, idComunidad) };
  });
  // No difundir IDs de canales privados a integrantes que no pueden verlos.
  for (const member of saved.miembros) {
    const visible = new Set(saved.canales.filter((c) => effectiveChannelPermissions(c, member.rol, member.idUsuario).includes('VER')).map((c) => c.id));
    emitToUser(member.idUsuario, EVENTS.CHANNELS_REORDERED, { idComunidad, orden: orden.filter((id) => visible.has(id)) });
  }
}
