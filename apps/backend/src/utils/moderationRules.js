import { AppError } from './AppError.js';

// Reglas puras de F-14 (sin base de datos): duraciones, etiquetas y jerarquía.
export const DURACIONES_SILENCIO = { '15_MIN': 15 * 60, '1_HORA': 60 * 60, '24_HORAS': 24 * 60 * 60, '7_DIAS': 7 * 24 * 60 * 60, PERMANENTE: null };
export const DURACIONES_BANEO = { '30_MIN': 30 * 60, '5_HORAS': 5 * 60 * 60, PERMANENTE: null };
const ETIQUETA_DURACION = { '15_MIN': '15 minutos', '1_HORA': '1 hora', '24_HORAS': '24 horas', '7_DIAS': '7 días', '30_MIN': '30 minutos', '5_HORAS': '5 horas', PERMANENTE: 'sin vencimiento' };
const ETIQUETA_ALCANCE = { TEXTO: 'texto', VOZ: 'voz', AMBOS: 'texto y voz' };
export const etiquetaDuracion = d => ETIQUETA_DURACION[d] ?? d;
export const etiquetaAlcance = a => ETIQUETA_ALCANCE[a] ?? a;
export const vencimiento = (tabla, duracion) => tabla[duracion] == null ? null : new Date(Date.now() + tabla[duracion] * 1000);

// Jerarquía común a las tres medidas: nadie actúa sobre sí mismo ni sobre el propietario,
// solo el propietario actúa sobre administradores y solo administración actúa sobre moderadores.
export function protectModerationTarget(actor, target, actorRole, targetRole) {
  if (actor === target) throw new AppError(403, 'INSUFFICIENT_ROLE', 'No podés aplicarte una medida a vos');
  if (targetRole === 'PROPIETARIO' || (targetRole === 'ADMIN' && actorRole !== 'PROPIETARIO')) throw new AppError(403, 'INSUFFICIENT_ROLE', 'Solo el propietario puede aplicar medidas a un administrador');
  if (targetRole === 'MODERADOR' && !['ADMIN', 'PROPIETARIO'].includes(actorRole)) {
    throw new AppError(403, 'INSUFFICIENT_ROLE', 'Solo la administración puede aplicar medidas a un moderador');
  }
}


export const MEDIDAS = ['SILENCIAR', 'EXPULSAR', 'BANEAR'];
export const SIN_DURACION = 'NO_APLICA';

// Un proveedor que ignore el esquema tampoco puede colar valores fuera de catálogo.
export function normalizeInterpretation(raw) {
  const medida = MEDIDAS.includes(raw?.medida) ? raw.medida : null;
  const destinatario = typeof raw?.destinatario === 'string' ? raw.destinatario.trim().slice(0, 80) : '';
  const motivo = typeof raw?.motivo === 'string' && raw.motivo.trim() ? raw.motivo.trim().slice(0, 200) : null;
  if (!medida) return { medida: null, destinatario, motivo, alcance: null, duracion: SIN_DURACION };
  if (medida === 'SILENCIAR') {
    return { medida, destinatario, motivo, alcance: ['TEXTO', 'VOZ', 'AMBOS'].includes(raw.alcance) ? raw.alcance : 'AMBOS', duracion: Object.hasOwn(DURACIONES_SILENCIO, raw.duracion) ? raw.duracion : '1_HORA' };
  }
  if (medida === 'BANEAR') return { medida, destinatario, motivo, alcance: null, duracion: Object.hasOwn(DURACIONES_BANEO, raw.duracion) ? raw.duracion : 'PERMANENTE' };
  return { medida, destinatario, motivo, alcance: null, duracion: SIN_DURACION };
}

export const plain = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/^@/, '').trim();

// Busca a la persona solo entre los integrantes actuales; nunca adivina entre varias coincidencias.
export function resolveTarget(nombre, members) {
  const q = plain(nombre ?? '');
  if (!q) return [];
  const byHandle = members.filter(m => plain(m.usuario.nombreUsuario) === q);
  if (byHandle.length) return byHandle;
  const byName = members.filter(m => plain(m.usuario.nombreVisible) === q);
  if (byName.length) return byName;
  return members.filter(m => plain(m.usuario.nombreUsuario).includes(q) || plain(m.usuario.nombreVisible).includes(q));
}

export function describeEffects({ medida, alcance, duracion }) {
  const efectos = [];
  if (medida === 'SILENCIAR') {
    if (alcance !== 'VOZ') efectos.push('No podrá escribir, reaccionar ni votar en los canales de texto.');
    if (alcance !== 'TEXTO') efectos.push('No podrá usar micrófono, cámara ni pantalla en los canales de voz; si está en una llamada, se le corta al confirmar.');
    efectos.push('Sigue siendo integrante y puede leer los canales.');
    efectos.push(duracion === 'PERMANENTE' ? 'No vence: dura hasta que alguien lo levante.' : `Vence en ${etiquetaDuracion(duracion)}.`);
  } else {
    efectos.push('Pierde la membresía, sus roles y el acceso a los canales; si está en una llamada, sale de ella.');
    if (medida === 'EXPULSAR') efectos.push('Puede volver con una invitación válida.');
    else efectos.push(duracion === 'PERMANENTE' ? 'No podrá volver, ni con invitación, hasta que se levante el baneo.' : `No podrá volver, ni con invitación, durante ${etiquetaDuracion(duracion)}.`);
  }
  efectos.push('Solo afecta a esta comunidad.');
  return efectos;
}

export const tituloMedida = ({ medida, alcance }) => medida === 'SILENCIAR' ? `Silenciar (${etiquetaAlcance(alcance)})` : medida === 'EXPULSAR' ? 'Expulsar' : 'Banear';

