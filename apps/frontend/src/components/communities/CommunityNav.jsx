import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import CommunityTile from '../ui/CommunityTile.jsx';
import Icon from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import { COMMUNITY_ROLES } from '../../pages/CommunitiesPage.jsx';
import '../../styles/page.css';
import './communityNav.css';

export function CommunityHeader({ comunidad, collapsible = false }) {
  const [abierto, setAbierto] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const base = `/comunidades/${comunidad.id}`;
  const rol = comunidad.miRol;
  const tabs = [
    { value: base, label: 'Resumen' },
    { value: `${base}/canales`, label: 'Canales' },
    { value: `${base}/integrantes`, label: 'Integrantes' },
    { value: `${base}/roles`, label: 'Roles' },
    ...(['PROPIETARIO', 'ADMIN', 'MODERADOR'].includes(rol) ? [{ value: `${base}/invitaciones`, label: 'Invitaciones' }] : []),
    ...(['PROPIETARIO', 'ADMIN', 'MODERADOR'].includes(rol) ? [{ value: `${base}/moderacion`, label: 'Moderación' }] : []),
  ];
  const actual = tabs.slice(1).find((t) => pathname.startsWith(t.value))?.value ?? base;

  return (
    <>
      <header className={`cn-head ${collapsible ? 'cn-head-sm' : ''}`}>
        {collapsible ? (
          <button type="button" className="pr cn-toggle" aria-expanded={abierto} aria-controls="cn-secciones" onClick={() => setAbierto((v) => !v)}>
            <CommunityTile nombre={comunidad.nombre} imagen={comunidad.imagenUrl} size={40} />
            <span className="dsp cn-toggle-name">{comunidad.nombre}</span>
            <span className={`cn-chev ${abierto ? 'is-open' : ''}`}><Icon name="chevron" size={16} stroke={2.2} /></span>
          </button>
        ) : <CommunityTile nombre={comunidad.nombre} imagen={comunidad.imagenUrl} size={64} />}
        {!collapsible && <div className="cn-title">
          <h1 className="dsp">{comunidad.nombre}</h1>
          <span className="cn-badges">
            <Badge kind={comunidad.tipo === 'PUBLICA' ? 'publica' : 'privado'} />
            <span className="bdg bdg-base">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18h16M5 15l-1-8 4.5 3.5L12 5l3.5 5.5L20 7l-1 8z" /></svg>
              Tu rol: {COMMUNITY_ROLES[rol]}
            </span>
          </span>
        </div>}
        {(!collapsible || abierto) && ['ADMIN', 'PROPIETARIO'].includes(rol) && (
          <Button variant="secundario" onClick={() => navigate(`${base}/editar`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z" /></svg>
            Editar comunidad
          </Button>
        )}
      </header>
      {(!collapsible || abierto) && <div id="cn-secciones" className="page-tabs cn-tabs">
        <Segmented dark className="cn-seg" options={tabs} value={actual} onChange={(to) => navigate(to)} label="Secciones de la comunidad" />
      </div>}
    </>
  );
}

export function CommunityShell({ comunidad, collapsible = false, children }) {
  return (
    <div className="page">
      {comunidad && <CommunityHeader key={String(collapsible)} comunidad={comunidad} collapsible={collapsible} />}
      <div className="page-body cn-body">{children}</div>
    </div>
  );
}

export default CommunityHeader;
