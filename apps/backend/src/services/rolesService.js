import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { AppError } from '../utils/AppError.js';
import { requireRole } from './communitiesService.js';
import { audience, getChannelMembers, publishChannelChange } from './channelsService.js';
import { channelSelect } from '../utils/channelPermissions.js';
import { emitToCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

const roleSelect = { id: true, idComunidad: true, nombre: true, fechaCreacion: true };
const notFound = () => new AppError(404, 'ROLE_NOT_FOUND', 'El rol no existe en esta comunidad');

async function requireCustomRole(tx, idComunidad, idRol) {
  const rol = await tx.rolPersonalizado.findFirst({ where: { id: idRol, idComunidad }, select: roleSelect });
  if (!rol) throw notFound();
  return rol;
}

// No se publican asignaciones, permisos ni IDs de canales privados en los eventos de roles.
export function listRoles(idComunidad, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    return tx.rolPersonalizado.findMany({
      where: { idComunidad }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], select: roleSelect,
    });
  });
}

export function getRole(idComunidad, idRol, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    return requireCustomRole(tx, idComunidad, idRol);
  });
}

export function createRole(idComunidad, idUsuario, { nombre }) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    return tx.rolPersonalizado.create({ data: { idComunidad, nombre }, select: roleSelect });
  }, undefined, (rol) => emitToCommunity(idComunidad, EVENTS.COMMUNITY_ROLE_CREATED, { idComunidad, rol }));
}

export function updateRole(idComunidad, idRol, idUsuario, { nombre }) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    await requireCustomRole(tx, idComunidad, idRol);
    return tx.rolPersonalizado.update({ where: { id: idRol }, data: { nombre }, select: roleSelect });
  }, undefined, (rol) => emitToCommunity(idComunidad, EVENTS.COMMUNITY_ROLE_UPDATED, { idComunidad, rol }));
}

export function deleteRole(idComunidad, idRol, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    await requireCustomRole(tx, idComunidad, idRol);
    const canales = await tx.canal.findMany({
      where: { idComunidad, habilitacionesRolPersonalizado: { some: { idRol } } }, select: channelSelect,
    });
    const miembros = await getChannelMembers(tx, idComunidad);
    const before = new Map(canales.map((canal) => [canal.id, audience(canal, miembros)]));
    // Las FK de T-28 limpian asignaciones y habilitaciones dentro de esta transacción.
    await tx.rolPersonalizado.delete({ where: { id: idRol } });
    const actuales = canales.length ? await tx.canal.findMany({
      where: { idComunidad, id: { in: canales.map((canal) => canal.id) } }, select: channelSelect,
    }) : [];
    const miembrosActuales = await getChannelMembers(tx, idComunidad);
    return actuales.map((canal) => ({ canal, before: before.get(canal.id), after: audience(canal, miembrosActuales) }));
  }, undefined, (cambios) => {
    // Se usa el mismo cálculo y retiro de suscripciones que los cambios de acceso.
    // T-31 extenderá channelSelect/getChannelMembers/effectiveChannelPermissions a roles personalizados.
    for (const cambio of cambios) publishChannelChange(cambio.canal, cambio.before, cambio.after);
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_ROLE_DELETED, { idComunidad, idRol });
  });
}
