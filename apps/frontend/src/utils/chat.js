const tiempo = (m) => {
  const t = Date.parse(m.fechaCreacion);
  return Number.isNaN(t) ? 0 : t;
};
const antes = (a, b) => tiempo(a) - tiempo(b) || a.id - b.id;

function ordenada(lista) {
  for (let i = 1; i < lista.length; i++) if (antes(lista[i - 1], lista[i]) > 0) return false;
  return true;
}

export function mergeMessages(current, incoming) {
  const byId = new Map(current.map((m) => [m.id, m]));
  let soloAlFinal = true;
  const ultimo = current[current.length - 1];
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
    if (!old && ultimo && antes(message, ultimo) < 0) soloAlFinal = false;
    byId.set(message.id, {
      ...old,
      ...message,
      ...(message.eliminado && { contenido: null }),
    });
  }
  const lista = [...byId.values()];
  // Caso común: llega un mensaje nuevo o una edición sobre una lista ya ordenada.
  if (soloAlFinal && incoming.length <= 1 && ordenada(current)) return lista;
  const conTiempo = lista.map((m) => [tiempo(m), m]);
  conTiempo.sort((a, b) => a[0] - b[0] || a[1].id - b[1].id);
  return conTiempo.map(([, m]) => m);
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

export function formatListTime(fecha, ahora = new Date()) {
  const d = new Date(fecha);
  const dias = Math.round((new Date(ahora).setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (dias === 0) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (dias === 1) return 'Ayer';
  if (dias < 7) {
    const dia = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
    return dia.charAt(0).toUpperCase() + dia.slice(1, 3);
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

export function formatDay(fecha, ahora = new Date()) {
  const d = new Date(fecha);
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === new Date(ahora).toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// El historial usa una columna invertida (el scroll arranca abajo). Estas dos funciones miden y
// fijan la distancia al último mensaje sin depender de cómo cada navegador numera ese scroll.
const invertida = (n) => getComputedStyle(n).flexDirection === 'column-reverse';
export function distanciaAlFinal(n) {
  return invertida(n) ? Math.abs(n.scrollTop) : n.scrollHeight - n.scrollTop - n.clientHeight;
}
export function fijarDistanciaAlFinal(n, distancia) {
  n.scrollTop = invertida(n) ? -distancia : n.scrollHeight - n.clientHeight - distancia;
}
