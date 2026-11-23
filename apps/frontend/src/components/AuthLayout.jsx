import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Logo } from './shell/BootScreen.jsx';
import Icon from './ui/Icon.jsx';
import { armarIconos } from './landing/burstLayout.js';
import './landing/glassIcons.css';
import './auth.css';

function medida() {
  return typeof window === 'undefined' ? { w: 1440, h: 900 } : { w: window.innerWidth, h: window.innerHeight };
}

// Acceso y registro sobre el mismo escenario con que termina la animación de "Crear cuenta":
// fondo violeta claro, íconos de vidrio flotando a los costados y la tarjeta de vidrio al centro.
export default function AuthLayout() {
  const { state } = useLocation();
  // Si se llega desde la landing, los íconos ya están en su lugar; si no, salen desde el centro.
  const [llegada] = useState(() => Boolean(state?.desdeInicio));
  const [{ w, h }, setMedida] = useState(medida);
  useEffect(() => {
    const alCambiar = () => setMedida(medida());
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  const iconos = useMemo(() => armarIconos(w, h), [w, h]);

  return (
    <div className={`auth-stage${llegada ? ' desde-inicio' : ''}`}>
      <span className="auth-stage-glow uno" aria-hidden="true" />
      <span className="auth-stage-glow dos" aria-hidden="true" />
      <div className="auth-stage-iconos" aria-hidden="true">
        {iconos.map((ic) => (
          <span key={ic.id} className="landing-burst-icono auth-stage-icono" style={ic.estilo}>
            <span className="glass-bob" style={llegada ? { animationDelay: `calc(${ic.estilo['--fdl']} - 1.25s)` } : undefined}>
              <span className={`landing-gi${ic.redondo ? ' redondo' : ''}${ic.tenido ? ' tenido' : ''}`} style={{ '--sz': `${ic.tam}px` }}>
                <Icon name={ic.tipo} size={Math.round(ic.tam * 0.46)} stroke={2.1} />
              </span>
            </span>
          </span>
        ))}
      </div>
      <Link to="/inicio" className="btn sm lg pr auth-stage-volver"><Icon name="chevron" size={16} stroke={2.2} />Volver</Link>
      <main className="win auth-stage-card">
        <span className="auth-stage-logo"><Logo /><span className="dsp">dialo</span></span>
        <Outlet />
      </main>
    </div>
  );
}
