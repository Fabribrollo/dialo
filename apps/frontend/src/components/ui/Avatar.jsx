import './avatar.css';

const presenceLabels = { DESCONECTADO: 'Desconectado', EN_LINEA: 'En línea', AUSENTE: 'Ausente', NO_MOLESTAR: 'No molestar', INVISIBLE: 'Invisible' };

// Elige letra blanca o negra según el color de fondo, para que la inicial siempre se lea.
export function textoSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const canal = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
  return 1.05 / (L + 0.05) >= 4.5 ? '#fff' : '#131316';
}

export function initials(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export default function Avatar({ nombre, foto, size = 40, presence, color, dark = false, className = '' }) {
  return (
    <span className={`av ${dark ? 'av-dk' : ''} ${className}`} style={{ '--av': `${size}px`, ...(color && { background: color, color: textoSobre(color) }) }}>
      {foto ? <img src={foto} alt="" /> : initials(nombre).slice(0, 1)}
      {presence && <span className={`pres pres-${presence}`} role="img" aria-label={presenceLabels[presence]} />}
    </span>
  );
}

export function AvatarGroup({ people, max = 3, size = 24 }) {
  const rest = people.length - max;
  return (
    <span className="avg">
      {people.slice(0, max).map((p) => <Avatar key={p.id} nombre={p.nombre} foto={p.foto} size={size} />)}
      {rest > 0 && <span className="av av-dk" style={{ '--av': `${size}px` }}>+{rest}</span>}
    </span>
  );
}
