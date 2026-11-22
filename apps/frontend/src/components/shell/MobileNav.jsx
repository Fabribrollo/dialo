import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import Icon from '../ui/Icon.jsx';
import { useNotificationsSummary } from './notificationsStore.js';
import './mobileNav.css';

const TABS = [
  ['/', 'Mensajes', 'mensajes'],
  ['/comunidades', 'Comunidades', 'comunidades'],
  ['/amigos', 'Amigos', 'amigos'],
  ['/perfil', 'Perfil', 'perfil'],
];
const FAST = '.34s cubic-bezier(.3,1.25,.5,1)';
const SLOW = '.52s cubic-bezier(.3,1.2,.5,1) .07s';

export function activeTab(pathname) {
  if (pathname.startsWith('/comunidades') || pathname.startsWith('/invitacion')) return 1;
  if (pathname.startsWith('/amigos')) return 2;
  if (pathname.startsWith('/perfil')) return 3;
  return 0;
}

export default function MobileNav() {
  const { pathname } = useLocation();
  const actual = activeTab(pathname);
  const { noLeidas, abrir, expanded } = useNotificationsSummary();
  const previa = useRef(actual);
  const haciaDerecha = actual > previa.current;
  useEffect(() => { previa.current = actual; }, [actual]);
  const lens = {
    left: `calc(5px + (100% - 10px) * ${actual / 4})`,
    right: `calc(5px + (100% - 10px) * ${(3 - actual) / 4})`,
    transition: haciaDerecha ? `right ${FAST}, left ${SLOW}` : `left ${FAST}, right ${SLOW}`,
  };
  return (
    <>
    {pathname !== '/' && !expanded && abrir && (
      <button type="button" className="lg pr m-bell" onClick={abrir} aria-label={`Notificaciones: ${noLeidas} sin leer`}>
        <Icon name="campana" size={20} stroke={2} />
        {noLeidas > 0 && <span className="m-bell-count" aria-hidden="true">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </button>
    )}
    <nav className="lg m-nav" aria-label="Secciones">
      <span className="m-lens" aria-hidden="true" style={lens} />
      {TABS.map(([to, label, icon], i) => (
        <Link key={to} to={to} className={`m-tab pr ${i === actual ? 'm-tab-on' : ''}`} aria-current={i === actual ? 'page' : undefined}>
          <span className="m-tab-ic"><Icon name={icon} size={22} stroke={1.9} />{i === 0 && noLeidas > 0 && <span className="m-dot" aria-hidden="true" />}</span>{label}
          {i === 0 && noLeidas > 0 && <span className="sr-only">, {noLeidas} sin leer</span>}
        </Link>
      ))}
    </nav>
    </>
  );
}
