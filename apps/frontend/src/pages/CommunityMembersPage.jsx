import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
import { useSocket } from '../hooks/useSocket.js';
import { useAuth } from '../hooks/useAuth.js';
import { getCommunityMembers } from '../services/communitiesService.js';
import { EVENTS } from '../constants/events.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import { COMMUNITY_ROLES } from './CommunitiesPage.jsx';
import Avatar, { statusNames } from '../components/Avatar.jsx';

export default function CommunityMembersPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  const list = useCommunityCollection(id, getCommunityMembers, Boolean(detail.comunidad));
  const socket = useSocket(), { usuario } = useAuth();
  useLostCommunity(detail.lost);
  useEffect(() => {
    if (!socket) return;
    const update = () => list.reload();
    socket.on(EVENTS.USER_UPDATED, update);
    return () => socket.off(EVENTS.USER_UPDATED, update);
  }, [socket, list.reload]);
  return <section className="page-container communities-page">
    <Link className="community-back" to={detail.valid ? `/comunidades/${id}` : '/comunidades'}>← Volver a la comunidad</Link>
    {!detail.comunidad ? <CommunityState {...detail} /> : <>
      <header className="page-heading community-page-heading"><div><h1>Integrantes</h1><p>{detail.comunidad.nombre}</p></div>
        <button className="secondary" disabled={list.refreshing} onClick={() => { detail.reload(); list.reload(); }}>Actualizar</button></header>
      {detail.error && <p role="alert" className="notice error">No se pudo actualizar la comunidad. {detail.error.message}</p>}
      {list.error && <p role="alert" className="notice error">{list.error.message} <button className="secondary" onClick={list.reload}>Reintentar</button></p>}
      {list.loading ? <p role="status" className="center-note">Cargando integrantes…</p> : <>
        <p className="community-help">{list.items.length} {list.items.length === 1 ? 'integrante' : 'integrantes'}</p>
        <ul className="community-list community-members">{list.items.map((member) => <li key={member.usuario.id}>
          <div className="community-member-row"><Avatar usuario={member.usuario} />
            <div className="community-row-text"><strong>{member.usuario.nombreVisible}{member.usuario.id === usuario.id ? ' (vos)' : ''}</strong>
              <span>@{member.usuario.nombreUsuario} · {statusNames[member.usuario.disponibilidad] || 'Ausente'}</span></div>
            <span className="community-role">{COMMUNITY_ROLES[member.rol]}</span>
          </div>
        </li>)}</ul>
        {!list.error && list.items.length === 0 && <p className="center-note">No hay integrantes para mostrar.</p>}
      </>}
    </>}
  </section>;
}
