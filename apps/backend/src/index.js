import { reconcilePrivateCalls } from './services/privateCallsService.js';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSockets } from './sockets/index.js';
import { iniciarReconciliacion } from './services/callsService.js';
import { restoreSilenceTimers } from './services/moderationMeasuresService.js';

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: env.clientUrl, credentials: true },
});

initSockets(io);
iniciarReconciliacion();
restoreSilenceTimers().catch(console.error);
setInterval(() => reconcilePrivateCalls().catch(console.error), 15000).unref();

httpServer.listen(env.port, () => {
  console.log(`API escuchando en http://localhost:${env.port}`);
});
