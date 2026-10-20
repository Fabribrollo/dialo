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
