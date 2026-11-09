import CommunityNav from '../components/communities/CommunityNav.jsx';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
import { useSocket } from '../hooks/useSocket.js';
import { useAuth } from '../hooks/useAuth.js';
import { getCommunityMembers } from '../services/communitiesService.js';
import { getCommunityRoles } from '../services/communityRolesService.js';
import MemberRolesDialog, { canManageMember } from '../components/communities/MemberRolesDialog.jsx';
import CommunityBans, { BanMemberDialog, canBanMember, canManageBans } from '../components/communities/CommunityBans.jsx';
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
  const actor = detail.comunidad?.miRol;
  const catalog = useCommunityCollection(id, getCommunityRoles, ['ADMIN', 'PROPIETARIO'].includes(actor));
  const [editing, setEditing] = useState(null), [notice, setNotice] = useState(null);
  const [banning, setBanning] = useState(null);
  const trigger = useRef(null), heading = useRef(null);
  const active = editing?.id === id ? editing.member : null;
  const banTarget = banning?.id === id ? banning.member : null;
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
      <CommunityNav comunidad={detail.comunidad} />
      <header className="page-heading community-page-heading"><div><h1 ref={heading} tabIndex={-1}>Integrantes</h1><p>{detail.comunidad.nombre}</p></div>
        <button className="secondary" disabled={list.refreshing} onClick={() => { detail.reload(); list.reload(); catalog.reload(); }}>Actualizar</button></header>
      {detail.error && <p role="alert" className="notice error">No se pudo actualizar la comunidad. {detail.error.message}</p>}
      {notice?.id === id && <p role="status" className="community-success">{notice.message}</p>}
      {list.error && <p role="alert" className="notice error">{list.error.message} <button className="secondary" onClick={list.reload}>Reintentar</button></p>}
      {list.loading ? <p role="status" className="center-note">Cargando integrantes…</p> : <>
        <p className="community-help">{list.items.length} {list.items.length === 1 ? 'integrante' : 'integrantes'}</p>
        <ul className="community-list community-members">{list.items.map((member) => <li key={member.usuario.id}>
          <div className="community-member-row"><Avatar usuario={member.usuario} />
            <div className="community-row-text"><strong>{member.usuario.nombreVisible}{member.usuario.id === usuario.id ? ' (vos)' : ''}</strong>
              <span>@{member.usuario.nombreUsuario} · {statusNames[member.usuario.disponibilidad] || 'Ausente'}</span></div>
            <div className="community-member-roles">
              <span className="community-role">{COMMUNITY_ROLES[member.rol]}</span>
              {member.rolesPersonalizados?.length > 0 && <ul className="community-role-tags" aria-label="Roles personalizados">
                {member.rolesPersonalizados.map((role) => <li key={role.id}>{role.nombre}</li>)}
              </ul>}
            </div>
            {!list.error && canManageMember(actor, usuario.id, member) && <button type="button" className="secondary"
              aria-label={`Editar roles de ${member.usuario.nombreVisible}`} onClick={(e) => {
                trigger.current = e.currentTarget;
                setNotice(null);
                setEditing({ id, member });
              }}>Editar roles</button>}
            {!list.error && canBanMember(actor, usuario.id, member) && <button type="button" className="secondary"
              aria-label={`Banear a ${member.usuario.nombreVisible}`} onClick={(e) => {
                trigger.current = e.currentTarget;
                setNotice(null);
                setBanning({ id, member });
              }}>Banear</button>}
          </div>
        </li>)}</ul>
        {!list.error && list.items.length === 0 && <p className="center-note">No hay integrantes para mostrar.</p>}
      </>}
      {canManageBans(actor) && <CommunityBans key={id} id={id} />}
      {banTarget && <BanMemberDialog key={`${id}:${banTarget.usuario.id}`} id={id} actor={actor} userId={usuario.id}
        original={banTarget} member={list.items.find((member) => member.usuario.id === banTarget.usuario.id)}
        list={list} returnFocusRef={trigger} fallbackFocusRef={heading}
        onClose={(message) => { setBanning(null); if (message) setNotice({ id, message }); }} />}
      {active && <MemberRolesDialog key={`${id}:${active.usuario.id}`} id={id} actor={actor} userId={usuario.id}
        original={active} member={list.items.find((member) => member.usuario.id === active.usuario.id)}
        catalog={catalog} list={list} detail={detail} returnFocusRef={trigger} fallbackFocusRef={heading}
        onClose={(message) => { setEditing(null); if (message) setNotice({ id, message }); }} />}
    </>}
  </section>;
}
