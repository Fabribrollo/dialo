import { emitWithAck } from '../utils-chat.js';

// Serializar las altas/bajas de una misma room conserva el orden A → B → A
// incluso si el primer ack llega después de desmontar su vista.
const queues = new WeakMap();
export function channelSubscription(socket, event, idCanal) {
  let rooms = queues.get(socket);
  if (!rooms) { rooms = new Map(); queues.set(socket, rooms); }
  const previous = rooms.get(idCanal) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(() => emitWithAck(socket, event, { idCanal }));
  rooms.set(idCanal, operation);
  operation.finally(() => { if (rooms.get(idCanal) === operation) rooms.delete(idCanal); }).catch(() => {});
  return operation;
}
