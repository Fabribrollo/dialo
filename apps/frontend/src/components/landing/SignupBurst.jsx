import { useEffect, useMemo, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import { armarIconos, DURACION_BURST } from './burstLayout.js';
import './glassIcons.css';

// Al tocar "Crear cuenta": el botón se expande, los íconos de vidrio salen a los costados
// y el registro aparece sobre el mismo fondo, sin corte.
export default function SignupBurst({ origen, onTerminar }) {
  const { ancho, alto, boton } = origen;
  const ox = boton.left + boton.width / 2;
  const oy = boton.top + boton.height / 2;
  const iconos = useMemo(() => armarIconos(ancho, alto, ox, oy), [ancho, alto, ox, oy]);

  const terminar = useRef(onTerminar);
  useEffect(() => { terminar.current = onTerminar; }, [onTerminar]);

  useEffect(() => {
    const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => terminar.current(), quieto ? 0 : DURACION_BURST);
    return () => clearTimeout(id);
  }, []);

  const recorte = {
    '--ml': `${Math.round(boton.left)}px`,
    '--mt': `${Math.round(boton.top)}px`,
    '--mr': `${Math.round(ancho - boton.left - boton.width)}px`,
    '--mb': `${Math.round(alto - boton.top - boton.height)}px`,
  };

  return (
    <div className="landing-burst" aria-hidden="true">
      <span className="landing-burst-fondo" style={recorte} />
      {iconos.map((ic) => (
        <span key={ic.id} className="landing-burst-icono" style={ic.estilo}>
          <span className="glass-bob">
            <span className={`landing-gi${ic.redondo ? ' redondo' : ''}${ic.tenido ? ' tenido' : ''}`} style={{ '--sz': `${ic.tam}px` }}>
              <Icon name={ic.tipo} size={Math.round(ic.tam * 0.46)} stroke={2.1} />
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
