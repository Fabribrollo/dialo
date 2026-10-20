import { NavLink } from 'react-router';
export default function CommunityNav({ comunidad }) {
  const base = `/comunidades/${comunidad.id}`;
  return <nav className="community-tabs" aria-label="Secciones de la comunidad">
    <NavLink to={base} end>Resumen</NavLink>
    <NavLink to={`${base}/canales`}>Canales</NavLink>
    <NavLink to={`${base}/integrantes`}>Integrantes</NavLink>
    {['PROPIETARIO', 'ADMIN', 'MODERADOR'].includes(comunidad.miRol) && <NavLink to={`${base}/invitaciones`}>Invitaciones</NavLink>}
  </nav>;
}
