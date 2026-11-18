import { initials } from './Avatar.jsx';
import './avatar.css';

export default function CommunityTile({ nombre, imagen, size = 40 }) {
  return (
    <span className="av avc" style={{ '--av': `${size}px`, borderRadius: { 40: 14, 42: 14, 64: 20 }[size] ?? Math.round(size * .33) }}>
      {imagen ? <img src={imagen} alt="" /> : initials(nombre)}
    </span>
  );
}
