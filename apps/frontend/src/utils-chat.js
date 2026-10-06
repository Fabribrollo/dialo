export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const old = byId.get(message.id);
    // Una respuesta HTTP tardía no puede restaurar contenido eliminado/editado.
    if (old?.eliminado) continue;
    if (
      !message.eliminado &&
      old?.fechaEdicion &&
      new Date(old.fechaEdicion) > new Date(message.fechaEdicion || 0)
    )
      continue;
    byId.set(message.id, {
      ...old,
      ...message,
      ...(message.eliminado && { contenido: null }),
    });
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.fechaCreacion) - new Date(b.fechaCreacion) || a.id - b.id,
  );
}
export function sortConversations(items) {
  return [...items].sort(
    (a, b) =>
      new Date(b.ultimoMensaje?.fechaCreacion || b.fechaCreacion) -
        new Date(a.ultimoMensaje?.fechaCreacion || a.fechaCreacion) ||
      b.id - a.id,
  );
}
export function emitWithAck(socket, event, payload) {
  if (!socket?.connected)
    return Promise.reject(
      Object.assign(
        new Error(
          "Sin conexión. Tu texto sigue guardado; reconectá para enviarlo.",
        ),
        { code: "OFFLINE" },
      ),
    );
  return new Promise((resolve, reject) =>
    socket.timeout(8000).emit(event, payload, (error, result) => {
      if (error)
        reject(
          Object.assign(
            new Error(
              "No pudimos confirmar la operación. Revisá el historial antes de reintentar.",
            ),
            { code: "ACK_TIMEOUT" },
          ),
        );
      else if (!result?.ok)
        reject(
          Object.assign(
            new Error(
              result?.error?.message || "No se pudo completar la operación",
            ),
            result?.error,
          ),
        );
      else resolve(result.data);
    }),
  );
}
