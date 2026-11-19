import { prisma } from '../prisma/client.js';
import { getChannelPermissions } from './channelsService.js';
import { emitToUser } from '../sockets/emitter.js';
const watching = new Map();
export function watchActivity(socket, scope) {
  if (!scope || socket.connected === false) watching.delete(socket.id);
  else watching.set(socket.id, { user: socket.data.user.id, ...scope });
}
export const clearActivity = (socket) => watching.delete(socket.id);
const active = (user, tipo, referencia) => [...watching.values()].some((s) => s.user === user && s.tipo === tipo && s.referencia === referencia);

export async function notify(user, tipo, referencia, origen) {
  if (active(user, tipo, referencia)) return;
  const owner = await prisma.usuario.findUnique({ where: { id: user }, select: { preferencias: true } });
  if (!owner || owner.preferencias?.silenciarNotificaciones) return;
  const { count } = await prisma.notificacion.createMany({ data: [{ idUsuario: user, tipo, referencia, origen }], skipDuplicates: true });
  if (count) emitToUser(user, 'notifications:changed', {});
}

// Los contadores usan el mismo filtro de permisos que el listado.
async function visibleWhere(user) {
  const refs = await prisma.notificacion.findMany({ where: { idUsuario: user }, distinct: ['tipo', 'referencia'], select: { tipo: true, referencia: true } });
  const allowed = [];
  for (const ref of refs) {
    if (ref.tipo === 'canal') {
      if ((await getChannelPermissions(ref.referencia, user)).includes('VER')) allowed.push(ref);
    } else if (ref.tipo === 'conversacion') {
      if (await prisma.conversacionPrivada.count({ where: { id: ref.referencia, OR: [{ idUsuarioA: user }, { idUsuarioB: user }] } })) allowed.push(ref);
    } else if (ref.tipo === 'amistad') {
      if (await prisma.solicitudAmistad.count({ where: { id: ref.referencia, idReceptor: user, estado: 'PENDIENTE' } })) allowed.push(ref);
    }
  }
  return { idUsuario: user, OR: allowed };
}

export async function listNotifications(user, cursor) {
  const where = await visibleWhere(user);
  const [items, unread] = await Promise.all([
    prisma.notificacion.findMany({ where: { ...where, ...(cursor ? { id: { lt: cursor } } : {}) }, orderBy: { id: 'desc' }, take: 31 }),
    prisma.notificacion.count({ where: { ...where, leida: false } }),
  ]);
  return {
    items: items.slice(0,30).map(({ id, tipo, referencia, leida, fechaCreacion }) => ({ id, tipo, referencia, leida, fechaCreacion })),
    noLeidas: unread, nextCursor: items.length > 30 ? items[29].id : null,
  };
}

export async function readNotifications(user, id) {
  await prisma.notificacion.updateMany({ where: { idUsuario: user, ...(id ? { id } : {}) }, data: { leida: true } });
  emitToUser(user, 'notifications:changed', {});
}

export async function notifyChannelMessage(idCanal, actor, messageId, contenido) {
  const channel = await prisma.canal.findUnique({ where: { id: idCanal }, select: { idComunidad: true } });
  if (!channel) return;
  const members = await prisma.membresia.findMany({ where: { idComunidad: channel.idComunidad, idUsuario: { not: actor } }, select: { idUsuario: true, usuario: { select: { nombreUsuario: true } } } });
  for (const member of members) {
    // Solo avisar a quien aún puede consultar el mensaje.
    if ((await getChannelPermissions(idCanal, member.idUsuario)).includes('VER')) {
      await notify(member.idUsuario, 'canal', idCanal, `mensaje:${messageId}`);
    }
  }
}
