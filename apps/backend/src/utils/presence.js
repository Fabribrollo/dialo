// Estado de conexiones efímero; no confundirlo con la disponibilidad elegida.
const connections = new Map();
export const isOnline = (id) => (connections.get(id)?.size ?? 0) > 0;
export function connectPresence(id, socketId) {
  const before = isOnline(id);
  if (!connections.has(id)) connections.set(id, new Set());
  connections.get(id).add(socketId);
  return !before;
}
export function disconnectPresence(id, socketId) {
  connections.get(id)?.delete(socketId);
  if (connections.get(id)?.size) return false;
  return connections.delete(id);
}
