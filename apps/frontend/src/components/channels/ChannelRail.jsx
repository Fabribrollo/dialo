import { Link } from 'react-router';
import Icon from '../ui/Icon.jsx';
import './channelRail.css';

export default function ChannelRail({ items, base, selectedId }) {
  const textos = items.filter((c) => c.tipo === 'TEXTO');
  const voces = items.filter((c) => c.tipo !== 'TEXTO');
  const index = textos.findIndex((c) => c.id === selectedId);

  return (
    <nav className="chr" aria-label="Canales de la comunidad">
      <div className="chr-strip">
        {textos.length > 0 && (
          <div className="lg nr chr-text">
            {index >= 0 && <span className="lens lg dk chr-lens" style={{ transform: `translateX(${index * 104}px)` }} />}
            {textos.map((c) => (
              <Link key={c.id} to={`${base}/${c.id}`} className={`seg chr-seg ${c.id === selectedId ? 'chr-on' : ''}`} aria-label={`Texto ${c.nombre}`} aria-current={c.id === selectedId ? 'page' : undefined}>
                <span className="chr-hash">#</span>{c.nombre}
              </Link>
            ))}
          </div>
        )}
        {textos.length > 0 && voces.length > 0 && <span className="chr-sep" />}
        {voces.map((c) => (
          <Link key={c.id} to={`${base}/${c.id}`} className={`lg pr chr-voice ${c.id === selectedId ? 'chr-voice-on' : ''}`} aria-label={`Voz ${c.nombre}`} aria-current={c.id === selectedId ? 'page' : undefined}>
            <Icon name="canalVoz" size={16} stroke={2} />{c.nombre}
          </Link>
        ))}
      </div>
    </nav>
  );
}
