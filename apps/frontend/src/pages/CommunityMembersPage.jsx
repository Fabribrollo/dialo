import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { ListRow } from '../components/ui/Card.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import '../styles/members.css';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
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
  const [busqueda, setBusqueda] = useState('');
  const visibles = list.items.filter((m) => `${m.usuario.nombreVisible} ${m.usuario.nombreUsuario}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad}>
      <h1 ref={heading} tabIndex={-1} className="sr-only">Integrantes</h1>
      {detail.error && <Notice tone="error" title="No se pudo actualizar la comunidad." actionLabel="Reintentar" onAction={detail.reload} />}
      {notice?.id === id && <Notice tone="exito" title={notice.message} />}
      {list.error && <Notice tone="error" title={list.error.message} actionLabel="Reintentar" onAction={list.reload} />}
      {list.loading ? <span className="cm-state" role="status"><Spinner size={15} />Cargando integrantes…</span> : <>
        <div className="cm-bar">
          <SearchInput className="cm-search" label="Buscar integrante" placeholder="Buscar integrante" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <span className="cm-count">{list.items.length} {list.items.length === 1 ? 'integrante' : 'integrantes'}</span>
        </div>
        {visibles.length > 0 && <Card as="ul">{visibles.map((member) => <ListRow as="li" key={member.usuario.id}>
          <Avatar nombre={member.usuario.nombreVisible} foto={member.usuario.fotoUrl} presence={member.usuario.disponibilidad === 'INVISIBLE' ? 'AUSENTE' : member.usuario.disponibilidad} dark={member.usuario.id === usuario.id} />
          <span className="cm-who"><span className="li-title">{member.usuario.nombreVisible}{member.usuario.id === usuario.id ? ' (vos)' : ''}</span><span className="li-sub">@{member.usuario.nombreUsuario}</span></span>
          <span className="cm-roles">
            <span className="bdg bdg-base">{['PROPIETARIO', 'ADMIN'].includes(member.rol) && <Icon name="corona" size={12} stroke={2} />}{COMMUNITY_ROLES[member.rol]}</span>
            {member.rolesPersonalizados?.map((role) => <span key={role.id} className="bdg bdg-acento">{role.nombre}</span>)}
          </span>
          {!list.error && canManageMember(actor, usuario.id, member) && <Button size="sm" variant="secundario"
            aria-label={`Editar roles de ${member.usuario.nombreVisible}`} onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice(null);
              setEditing({ id, member });
            }}>Editar roles</Button>}
          {!list.error && canBanMember(actor, usuario.id, member) && <button type="button" className="li-quiet cm-ban pr"
            aria-label={`Banear a ${member.usuario.nombreVisible}`} onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice(null);
              setBanning({ id, member });
            }}>Banear</button>}
        </ListRow>)}</Card>}
        {!list.error && list.items.length === 0 && <span className="cm-state">No hay integrantes para mostrar.</span>}
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
  </CommunityShell>;
}
