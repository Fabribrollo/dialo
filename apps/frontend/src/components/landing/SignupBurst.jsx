import { useEffect, useMemo, useRef } from 'react';
import Icon from '../ui/Icon.jsx';

const TIPOS = ['mensajes', 'microfono', 'perfil', 'comunidades'];
const DURACION = 1250;

function aleatorio(semilla) {
  let s = semilla;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function armarIconos(ancho, alto, ox, oy) {
  const rnd = aleatorio(7);
  const total = 16;
  const filas = total / 2;
  return Array.from({ length: total }, (_, i) => {
    const izquierda = i % 2 === 0;
    const fila = Math.floor(i / 2);
    const [desde, hasta] = izquierda ? [0.03, 0.25] : [0.75, 0.97];
    const x = ancho * (desde + rnd() * (hasta - desde));
    const y = alto * (0.1 + ((fila + 0.2 + rnd() * 0.6) / filas) * 0.82);
    const tipo = TIPOS[(i + fila) % TIPOS.length];
    return {
      id: i,
      tipo,
      redondo: tipo === 'perfil',
      tenido: rnd() > 0.62,
      tam: rnd() > 0.55 ? 96 : 68,
      estilo: {
        left: `${ox}px`,
        top: `${oy}px`,
        '--tx': `${Math.round(x - ox)}px`,
        '--ty': `${Math.round(y - oy)}px`,
        '--s': (0.85 + rnd() * 0.35).toFixed(2),
        '--r': `${Math.round((rnd() - 0.5) * 30)}deg`,
        animationDelay: `${(0.18 + fila * 0.04 + rnd() * 0.04).toFixed(3)}s`,
      },
    };
  });
}

// Al tocar "Crear cuenta": el botón se expande, los íconos de vidrio salen a los costados y sigue el registro.
export default function SignupBurst({ origen, onTerminar }) {
  const { ancho, alto, boton } = origen;
  const ox = boton.left + boton.width / 2;
  const oy = boton.top + boton.height / 2;
  const iconos = useMemo(() => armarIconos(ancho, alto, ox, oy), [ancho, alto, ox, oy]);

  const terminar = useRef(onTerminar);
  useEffect(() => { terminar.current = onTerminar; }, [onTerminar]);

  useEffect(() => {
    const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => terminar.current(), quieto ? 0 : DURACION);
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
          <span className={`landing-gi${ic.redondo ? ' redondo' : ''}${ic.tenido ? ' tenido' : ''}`} style={{ '--sz': `${ic.tam}px` }}>
            <Icon name={ic.tipo} size={Math.round(ic.tam * 0.46)} stroke={2.1} />
          </span>
        </span>
      ))}
    </div>
  );
}
