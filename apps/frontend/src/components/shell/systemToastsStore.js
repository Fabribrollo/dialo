// Todos los avisos comparten una sola salida abajo al centro.
let avisos = [];
const oyentes = new Set();
const publicar = (lista) => { avisos = lista; oyentes.forEach((fn) => fn()); };
let siguiente = 0;

// tipo: ok | error | cargando | enlace | invitacion. anunciar: false cuando la pantalla ya lo dice en voz alta.
export function avisar({ id, tipo = 'ok', texto, accion, duracion = tipo === 'cargando' ? 0 : 7000, anunciar = true, ...resto }) {
  const key = id ?? `aviso-${++siguiente}`;
  publicar([...avisos.filter((a) => a.key !== key), { key, revision:++siguiente, tipo, texto, accion, duracion, anunciar, ...resto }].slice(-30));
  return key;
}
export const cerrarAviso = (key) => publicar(avisos.filter((a) => a.key !== key));
export const suscribirAvisos = (fn) => { oyentes.add(fn); return () => oyentes.delete(fn); };
export const leerAvisos = () => avisos;
