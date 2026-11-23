// Tema de la interfaz: claro, oscuro o el del sistema. Se guarda por navegador.
const KEY = 'dialo:tema';
export const TEMAS = ['claro', 'oscuro', 'sistema'];
const oyentes = new Set();
const sistemaOscuro = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export function leerTema() {
  try { const t = localStorage.getItem(KEY); return TEMAS.includes(t) ? t : 'sistema'; } catch { return 'sistema'; }
}
export function temaEfectivo(tema = leerTema()) {
  return tema === 'sistema' ? (sistemaOscuro() ? 'oscuro' : 'claro') : tema;
}
export function aplicarTema(tema = leerTema()) {
  const efectivo = temaEfectivo(tema);
  document.documentElement.dataset.theme = efectivo;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', efectivo === 'oscuro' ? '#17151f' : '#7042ff');
}
export function guardarTema(tema) {
  try { localStorage.setItem(KEY, tema); } catch { /* sin almacenamiento: vale solo para esta pestaña */ }
  aplicarTema(tema);
  oyentes.forEach((fn) => fn(tema));
}
export function suscribirTema(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

// Sigue los cambios del sistema y de otras pestañas mientras la app está abierta.
export function seguirTema() {
  const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const alSistema = () => { if (leerTema() === 'sistema') aplicarTema('sistema'); };
  const alStorage = (e) => { if (e.key === KEY) { aplicarTema(); oyentes.forEach((fn) => fn(leerTema())); } };
  media?.addEventListener?.('change', alSistema);
  window.addEventListener('storage', alStorage);
  aplicarTema();
  return () => { media?.removeEventListener?.('change', alSistema); window.removeEventListener('storage', alStorage); };
}
