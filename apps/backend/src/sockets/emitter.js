import { requireSocketUser } from './authenticate.js';
import { getChannelPermissions } from '../services/channelsService.js';
import { AppError } from '../utils/AppError.js';
let io = null;

export const rooms = {
  user: (idUsuario) => `user:${idUsuario}`,
  conversation: (idConversacion) => `conversation:${idConversacion}`,
  community: (idComunidad) => `community:${idComunidad}`,
  channel: (idCanal) => `channel:${idCanal}`,
};

export function initEmitter(server) {
  io = server;
}

export function emitToUser(idUsuario, evento, payload) {
  io?.to(rooms.user(idUsuario)).emit(evento, payload);
}

export function emitToConversation(idConversacion, evento, payload) {
  io?.to(rooms.conversation(idConversacion)).emit(evento, payload);
}

// Las rooms indican qué pestañas tienen el canal abierto, no su autorización.
// T-15 puede retirar sesiones de forma proactiva; aquí igualmente se verifican
// sesión y VER actuales antes de cada entrega, sin reutilizar el handshake.
export async function emitToChannel(idCanal, evento, payload) {
  if (!io) return;
  const room = rooms.channel(idCanal);
  const sockets = await io.in(room).fetchSockets();
  const permissions = new Map();
  for (const socket of sockets) {
    try {
      const user = await requireSocketUser(socket);
      if (!permissions.has(user.id)) permissions.set(user.id, await getChannelPermissions(idCanal, user.id));
      if (!permissions.get(user.id).includes('VER')) { await socket.leave(room); continue; }
      await requireSocketUser(socket);
      if (socket.rooms.has(room)) socket.emit(evento, payload);
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      // Fallar cerrado también si no se pudo comprobar la credencial.
      socket.disconnect(true);
    }
  }
}

export function joinConversation(idConversacion, idsUsuarios) {
  if (!io) return;
  for (const idUsuario of idsUsuarios) {
    io.in(rooms.user(idUsuario)).socketsJoin(rooms.conversation(idConversacion));
  }
}

export function emitToCommunity(idComunidad, evento, payload) {
  io?.to(rooms.community(idComunidad)).emit(evento, payload);
}

export function joinCommunity(idComunidad, idsUsuarios) {
  if (!io) return;
  for (const idUsuario of idsUsuarios) {
    io.in(rooms.user(idUsuario)).socketsJoin(rooms.community(idComunidad));
  }
}

export function closeCommunity(idComunidad, idsCanales) {
  if (!io) return;
  for (const room of [rooms.community(idComunidad), ...idsCanales.map(rooms.channel)]) {
    io.in(room).socketsLeave(room);
  }
}

export function leaveCommunity(idComunidad, idUsuario, idsCanales) {
  io?.in(rooms.user(idUsuario)).socketsLeave([rooms.community(idComunidad), ...idsCanales.map(rooms.channel)]);
}

export function leaveChannel(idCanal, idUsuario) {
  io?.in(rooms.user(idUsuario)).socketsLeave(rooms.channel(idCanal));
}

export function closeChannel(idCanal) {
  io?.in(rooms.channel(idCanal)).socketsLeave(rooms.channel(idCanal));
}
