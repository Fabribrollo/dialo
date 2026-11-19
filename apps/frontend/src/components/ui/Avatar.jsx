import './avatar.css';

const presenceLabels = { DESCONECTADO: 'Desconectado', EN_LINEA: 'En línea', AUSENTE: 'Ausente', NO_MOLESTAR: 'No molestar', INVISIBLE: 'Invisible' };

export function initials(nombre = '') {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export default function Avatar({ nombre, foto, size = 40, presence, color, dark = false, className = '' }) {
  return (
    <span className={`av ${dark ? 'av-dk' : ''} ${className}`} style={{ '--av': `${size}px`, ...(color && { background: color, color: '#fff' }) }}>
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
