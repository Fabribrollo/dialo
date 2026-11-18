import { useEffect, useRef } from 'react';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';

export function SpeakingIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 20 16" aria-hidden="true" style={{ fill: 'currentColor' }}>
      <rect x="0" y="5" width="3" height="6" rx="1.5" /><rect x="5.5" y="1" width="3" height="14" rx="1.5" /><rect x="11" y="4" width="3" height="8" rx="1.5" /><rect x="16.5" y="6" width="3" height="4" rx="1.5" />
    </svg>
  );
}

function Video({ track, label, contain = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const elemento = ref.current;
    if (!track || !elemento) return undefined;
    track.attach(elemento);
    return () => { track.detach(elemento); };
  }, [track]);
  return <video ref={ref} className={contain ? 'ct-contain' : ''} autoPlay playsInline muted aria-label={label} />;
}

export function ScreenTile({ persona, onGrid }) {
  return (
    <figure className="ct ct-screen">
      <Video track={persona.videoPantalla} label={`Pantalla de ${persona.nombre}`} contain />
      <figcaption className="ct-screen-tag"><Icon name="pantalla" size={15} stroke={2} />Pantalla de {persona.nombre}</figcaption>
      <button type="button" className="pr ct-float" onClick={onGrid} aria-label="Ver solo las cámaras"><Icon name="grilla" size={15} stroke={2.2} />Ver cámaras</button>
    </figure>
  );
}

export default function CallTile({ persona, big = false, onScreen }) {
  const nombre = `${persona.nombre}${persona.local ? ' (vos)' : ''}`;
  return (
    <figure className={`ct ${persona.hablando ? 'is-speaking' : ''}`}>
      {persona.video
        ? <Video track={persona.video} label={`Cámara de ${persona.nombre}`} />
        : <Avatar nombre={persona.nombre} foto={persona.foto} size={big ? 64 : 44} dark={persona.local} />}
      <figcaption className="ct-tag">
        {persona.hablando && <span className="ct-speaking"><SpeakingIcon /></span>}
        {nombre}
      </figcaption>
      {persona.microfono === false && <span className="ct-muted" role="img" aria-label="Silenciado"><Icon name="silenciado" size={14} stroke={2.1} /></span>}
      {persona.videoPantalla && onScreen && <button type="button" className="pr ct-see" onClick={onScreen}><Icon name="pantalla" size={13} stroke={2.2} />Ver pantalla</button>}
    </figure>
  );
}

export function MoreTile({ count, onClick }) {
  return (
    <button type="button" className="pr ct ct-more" onClick={onClick}>
      <span className="ct-more-n">+{count}</span>
      <span className="ct-more-l">Ver todos</span>
    </button>
  );
}
