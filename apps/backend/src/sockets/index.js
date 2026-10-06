import { authenticateSocket } from './authenticate.js';
import { initEmitter, rooms } from './emitter.js';
import { prisma } from '../prisma/client.js';
import { registerConversationHandlers } from './conversationsSocket.js';

async function joinRooms(socket) {
  const { id } = socket.data.user;
  await socket.join(rooms.user(id));
  const conversaciones = await prisma.conversacionPrivada.findMany({
    where: { OR: [{ idUsuarioA: id }, { idUsuarioB: id }] },
    select: { id: true },
  });
  await socket.join(conversaciones.map((c) => rooms.conversation(c.id)));
}

export function initSockets(io) {
  initEmitter(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const ready = joinRooms(socket);
    registerConversationHandlers(socket, ready);
    ready.catch((error) => {
      console.error(error);
      socket.disconnect(true);
    });
  });
}
