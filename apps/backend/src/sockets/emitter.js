let io = null;

export const rooms = {
  user: (idUsuario) => `user:${idUsuario}`,
  conversation: (idConversacion) => `conversation:${idConversacion}`,
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
