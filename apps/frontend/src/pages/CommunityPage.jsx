import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { deleteCommunity } from '../services/communitiesService.js';
import CommunityImage from '../components/communities/CommunityImage.jsx';
import DeleteCommunityDialog from '../components/communities/DeleteCommunityDialog.jsx';
import { COMMUNITY_ROLES } from './CommunitiesPage.jsx';

export function CommunityState({ valid, lost, loading, error, comunidad, reload }) {
  if (!valid) return <div className="community-empty"><h1>Comunidad inválida</h1><Link to="/comunidades">Volver a comunidades</Link></div>;
  if (lost) return <p role="status">Volviendo a comunidades…</p>;
  if (loading) return <p role="status" className="center-note">Cargando comunidad…</p>;
  if (!comunidad) return <div className="community-empty">
    <h1>No pudimos abrir la comunidad</h1>
    <p role="alert">{[403, 404].includes(error?.status) ? 'La comunidad no existe o no tenés acceso.' : error?.message || 'No se pudo cargar la comunidad.'}</p>
    <div className="community-actions">{![401, 403, 404].includes(error?.status) && <button type="button" onClick={reload}>Reintentar</button>}
      <Link to="/comunidades">Volver a comunidades</Link></div>
  </div>;
  return null;
}

export function useLostCommunity(lost) {
  const navigate = useNavigate();
  useEffect(() => {
    if (lost) navigate('/comunidades', { replace: true, state: { notice: 'La comunidad ya no está disponible para tu cuenta.' } });
  }, [lost, navigate]);
}

export default function CommunityPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  const { comunidad, error } = detail;
  const { forget } = useCommunities();
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef(null);
  const navigate = useNavigate();
  const { state } = useLocation();
  useLostCommunity(detail.lost);
  useEffect(() => setConfirming(false), [id]);
  const canManage = ['ADMIN', 'PROPIETARIO'].includes(comunidad?.miRol);
  const isOwner = comunidad?.miRol === 'PROPIETARIO';
  return <section className="page-container communities-page">
    <Link className="community-back" to="/comunidades">← Comunidades</Link>
    {!comunidad ? <CommunityState {...detail} /> : <>
      {state?.notice && <p role="status" className="community-success">{state.notice}</p>}
      {error && <p role="alert" className="notice error">No se pudo actualizar la información. {error.message} <button className="secondary" onClick={detail.reload}>Reintentar</button></p>}
      <header className="community-overview">
        <CommunityImage nombre={comunidad.nombre} url={comunidad.imagenUrl} large />
        <div><h1>{comunidad.nombre}</h1><p>{comunidad.tipo === 'PUBLICA' ? 'Pública' : 'Privada'} · {comunidad.cantidadIntegrantes} {comunidad.cantidadIntegrantes === 1 ? 'integrante' : 'integrantes'}</p></div>
      </header>
      <dl className="community-facts">
        <div><dt>Tu rol</dt><dd>{COMMUNITY_ROLES[comunidad.miRol]}</dd></div>
        <div><dt>Creada</dt><dd>{new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date(comunidad.fechaCreacion))}</dd></div>
      </dl>
      {canManage && <div className="community-actions"><Link className="button-link" to={`/comunidades/${id}/editar`}>Editar comunidad</Link></div>}
      {isOwner && <section className="community-danger-zone" aria-labelledby="community-delete-title">
        <h2 id="community-delete-title">Eliminar comunidad</h2>
        <p>Esta acción elimina también los canales, sus mensajes y las invitaciones.</p>
        <button ref={deleteButton} type="button" className="danger-button" onClick={() => setConfirming(true)}>Eliminar comunidad</button>
      </section>}
      {confirming && isOwner && <DeleteCommunityDialog comunidad={comunidad} returnFocusRef={deleteButton} onClose={() => setConfirming(false)} onConfirm={async () => {
        await deleteCommunity(id);
        forget(id);
        navigate('/comunidades', { replace: true, state: { notice: 'Comunidad eliminada.' } });
      }} />}
    </>}
  </section>;
}
