import { requireSocketUser, authenticateSocket } from './authenticate.js';
import { initEmitter, revisarSesiones, rooms } from './emitter.js';
import { EVENTS } from './events.js';
import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { registerConversationHandlers } from './conversationsSocket.js';
import { registerChannelHandlers } from './channelsSocket.js';
import { registerChannelMessageHandlers } from './channelMessagesSocket.js';

// setTimeout no admite mas de ~24,8 dias.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const BARRIDO_MS = 60 * 1000;

async function joinRooms(socket) {
  const { id } = socket.data.user;
  const idSesion = socket.data.auth?.idSesion;
  await socket.join([rooms.user(id), ...(idSesion ? [rooms.session(idSesion)] : [])]);
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
  // La sesion pudo revocarse mientras se conectaba.
  await requireSocketUser(socket);
}

function vigilarVencimiento(socket) {
  const vence = socket.data.auth?.fechaExpiracion?.getTime();
  if (!vence) return;
  let timer;
  const programar = () => {
    timer = setTimeout(() => {
      if (Date.now() < vence) return programar();
      socket.emit(EVENTS.SESSION_ENDED, { motivo: 'EXPIRADA' });
      socket.disconnect();
    }, Math.min(Math.max(vence - Date.now(), 0), MAX_TIMEOUT_MS));
  };
  programar();
  socket.on('disconnect', () => clearTimeout(timer));
}

export function initSockets(io) {
  initEmitter(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    vigilarVencimiento(socket);
    const ready = joinRooms(socket);
    registerConversationHandlers(socket, ready);
    registerChannelHandlers(socket, ready);
    registerChannelMessageHandlers(socket, ready);
    ready.catch((error) => {
      if (!(error instanceof AppError)) console.error(error);
      socket.disconnect(true);
    });
  });

  setInterval(() => revisarSesiones().catch((error) => console.error(error)), BARRIDO_MS).unref();
}
