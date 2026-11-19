import { prisma } from '../prisma/client.js';
import { requireRole, getMembership, integranteSelect, toIntegrante } from './communitiesService.js';
import { withCommunityAccessChange } from './channelsService.js';
import { emitToCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';

export async function transferOwnership(id, actor, target) {
  if (actor === target) throw new AppError(400, 'SELF_TRANSFER', 'Elegí otro integrante');
  return withCommunityAccessChange(id, async (tx) => {
    await requireRole(id, actor, 'PROPIETARIO', tx);
    if (!await getMembership(id, target, tx)) throw new AppError(404, 'MEMBER_NOT_FOUND', 'La persona debe integrar la comunidad');
    const anterior = await tx.membresia.update({ where: { idComunidad_idUsuario: { idComunidad: id, idUsuario: actor } }, data: { rol: 'ADMIN' }, select: integranteSelect });
    const nuevo = await tx.membresia.update({ where: { idComunidad_idUsuario: { idComunidad: id, idUsuario: target } }, data: { rol: 'PROPIETARIO' }, select: integranteSelect });
    return [anterior, nuevo].map(toIntegrante);
  }, undefined, (items) => {
    for (const integrante of items) emitToCommunity(id, EVENTS.COMMUNITY_MEMBER_UPDATED, { idComunidad: id, integrante });
  });
}

export async function listBlockedMessages(id, actor, cursor) {
  await requireRole(id, actor, 'MODERADOR');
  const rows = await prisma.bloqueoMensaje.findMany({
    where: { idComunidad: id, ...(cursor ? { id: { lt: cursor } } : {}) },
    select: { id: true, idCanal: true, contenido: true, motivo: true, fechaCreacion: true, autor: { select: { id: true, nombreVisible: true, nombreUsuario: true } } },
    orderBy: { id: 'desc' }, take: 31,
  });
  return { items: rows.slice(0, 30), nextCursor: rows.length > 30 ? rows[29].id : null };
}
