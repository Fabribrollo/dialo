import { authenticateSocket } from './authenticate.js';
import { initEmitter, rooms } from './emitter.js';
import { prisma } from '../prisma/client.js';
import { registerConversationHandlers } from './conversationsSocket.js';
import { registerChannelHandlers } from './channelsSocket.js';
import { registerChannelMessageHandlers } from './channelMessagesSocket.js';

async function joinRooms(socket) {
  const { id } = socket.data.user;
  await socket.join(rooms.user(id));
  const [conversaciones, membresias] = await Promise.all([
    prisma.conversacionPrivada.findMany({
      where: { OR: [{ idUsuarioA: id }, { idUsuarioB: id }] },
      select: { id: true },
    }),
    prisma.membresia.findMany({ where: { idUsuario: id }, select: { idComunidad: true } }),
  ]);
  await socket.join([
    ...conversaciones.map((c) => rooms.conversation(c.id)),
    ...membresias.map((m) => rooms.community(m.idComunidad)),
  ]);
}

export function initSockets(io) {
  initEmitter(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const ready = joinRooms(socket);
    registerConversationHandlers(socket, ready);
    registerChannelHandlers(socket, ready);
    registerChannelMessageHandlers(socket, ready);
    ready.catch((error) => {
      console.error(error);
      socket.disconnect(true);
    });
  });
}
