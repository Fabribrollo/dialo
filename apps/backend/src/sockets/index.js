import { authenticateSocket } from './authenticate.js';
import { initEmitter, rooms } from './emitter.js';

export function initSockets(io) {
  initEmitter(io);
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(rooms.user(user.id));
  });
}
