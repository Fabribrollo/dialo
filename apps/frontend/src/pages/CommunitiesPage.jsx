import { Link, useLocation } from 'react-router';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import CommunityImage from '../components/communities/CommunityImage.jsx';

export const COMMUNITY_ROLES = { PROPIETARIO: 'Propietario', ADMIN: 'Administrador', MODERADOR: 'Moderador', INTEGRANTE: 'Integrante' };

export default function CommunitiesPage() {
  const { items, loading, error, reload } = useCommunities();
  const { state } = useLocation();
  return <section className="page-container communities-page" aria-labelledby="communities-title">
    <header className="page-heading community-page-heading">
      <div><h1 id="communities-title">Comunidades</h1><p>Las comunidades a las que pertenecés.</p></div>
      <Link className="button-link" to="/comunidades/nueva">Crear comunidad</Link>
    </header>
    {state?.notice && <p role="status" className="community-success">{state.notice}</p>}
    {error && <p role="alert" className="notice error">{error} <button type="button" className="secondary" onClick={reload}>Reintentar</button></p>}
    {loading ? <p role="status" className="center-note">Cargando comunidades…</p> : items.length === 0 && !error ?
      <div className="community-empty"><h2>No pertenecés a ninguna comunidad</h2><p>Podés crear una desde el botón «Crear comunidad».</p></div> :
      <ul className="community-list">{items.map((comunidad) => <li key={comunidad.id}>
        <Link className="community-row" to={`/comunidades/${comunidad.id}`}>
          <CommunityImage nombre={comunidad.nombre} url={comunidad.imagenUrl} />
          <span className="community-row-text"><strong>{comunidad.nombre}</strong><span>
            {comunidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'} · {comunidad.cantidadIntegrantes} {comunidad.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}
          </span></span>
          <span className="community-role">{COMMUNITY_ROLES[comunidad.miRol]}</span>
        </Link>
      </li>)}</ul>}
  </section>;
}
