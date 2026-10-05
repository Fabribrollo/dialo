export function initSockets(io) {
  io.on('connection', (socket) => {
    console.log(`socket conectado: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`socket desconectado: ${socket.id}`);
    });
  });
}
