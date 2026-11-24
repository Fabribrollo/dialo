import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { kickCommunityMember, getCommunitySilences } from '../services/communityModerationService.js';
import { ModerationAssistant, SilenceMemberDialog, LiftSilenceDialog, canSilence, canSilenceMember, canUseAssistant, silenceLabel } from '../components/communities/MemberModeration.jsx';
import CommunityActionDialog from '../components/communities/CommunityActionDialog.jsx';
import OwnershipTransfer from '../components/communities/OwnershipTransfer.jsx';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import Button from '../components/ui/Button.jsx';
import Card, { ListRow } from '../components/ui/Card.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Icon from '../components/ui/Icon.jsx';
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
  const permissions=detail.comunidad?.misPermisos??[];
  const [kicking,setKicking]=useState(null);
  const catalog = useCommunityCollection(id, getCommunityRoles, (['ADMIN','PROPIETARIO'].includes(actor)||permissions.includes('GESTIONAR_ROLES')));
  const [editing, setEditing] = useState(null), [notice, setNotice] = useState(null);
  const [banning, setBanning] = useState(null), [silencing, setSilencing] = useState(null);
  const silences = useCommunityCollection(id, getCommunitySilences, canSilence(actor, permissions));
  const silenceOf = new Map(silences.items.map((s) => [s.usuario.id, s]));
  const trigger = useRef(null), heading = useRef(null);
  const active = editing?.id === id ? editing.member : null;
  const banTarget = banning?.id === id ? banning.member : null;
  useLostCommunity(detail.lost);
  useEffect(() => {
    if (!socket) return;
    const update = () => list.reload();
    const moderation = ({ idComunidad }) => { if (idComunidad === id) silences.reload(); };
    socket.on(EVENTS.USER_UPDATED, update);
    socket.on(EVENTS.COMMUNITY_MODERATION_CHANGED, moderation);
    return () => { socket.off(EVENTS.USER_UPDATED, update); socket.off(EVENTS.COMMUNITY_MODERATION_CHANGED, moderation); };
  }, [socket, id, list.reload, silences.reload]);
  const [busqueda, setBusqueda] = useState('');
  const visibles = list.items.filter((m) => `${m.usuario.nombreVisible} ${m.usuario.nombreUsuario}`.toLowerCase().includes(busqueda.trim().toLowerCase()));
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad}>
      <h1 ref={heading} tabIndex={-1} className="sr-only">Integrantes</h1>
      {detail.error && <Notice tone="error" title="No se pudo actualizar la comunidad." actionLabel="Reintentar" onAction={detail.reload} />}
      {notice?.id === id && <Notice tone="exito" title={notice.message} />}
      {list.error && <Notice tone="error" title={list.error.message} actionLabel="Reintentar" onAction={list.reload} />}
      {canUseAssistant(actor, permissions) && <ModerationAssistant id={id} onApplied={() => { list.reload(); silences.reload(); }} />}
      {list.loading ? <SkeletonRows rows={5} avatar={40} action label="Cargando integrantes…" /> : <>
        <div className="cm-bar">
          <SearchInput className="cm-search" label="Buscar integrante" placeholder="Buscar integrante" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <span className="cm-count">{list.items.length} {list.items.length === 1 ? 'integrante' : 'integrantes'}</span>
        </div>
        {visibles.length > 0 && <Card as="ul" className="member-list">{visibles.map((member) => <ListRow as="li" key={member.usuario.id}>
          <Avatar idUsuario={member.usuario.id} nombre={member.usuario.nombreVisible} foto={member.usuario.fotoUrl} color={member.usuario.colorAvatar} presence={member.usuario.disponibilidad === 'INVISIBLE' ? 'AUSENTE' : member.usuario.disponibilidad} dark={member.usuario.id === usuario.id} />
          <span className="cm-who"><span className="li-title">{member.usuario.nombreVisible}{member.usuario.id === usuario.id ? ' (vos)' : ''}</span><span className="li-sub">@{member.usuario.nombreUsuario}</span></span>
          <span className="cm-roles">
            <span className="bdg bdg-base">{['PROPIETARIO', 'ADMIN'].includes(member.rol) && <Icon name="corona" size={12} stroke={2} />}{COMMUNITY_ROLES[member.rol]}</span>
            {member.rolesPersonalizados?.map((role) => <span key={role.id} className="bdg bdg-acento member-role-chip" title={role.nombre}><span className="member-role-dot"/>{role.nombre}</span>)}
            {silenceOf.has(member.usuario.id) && <span className="bdg bdg-silencio" title={silenceLabel(silenceOf.get(member.usuario.id))}><Icon name="silenciado" size={12} stroke={2} />Silenciado</span>}
          </span>
          <span className="member-actions">
          {!list.error && canManageMember(actor, usuario.id, member,permissions) && <Button size="sm" variant="secundario"
            aria-label={`Editar roles de ${member.usuario.nombreVisible}`} onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice(null);
              setEditing({ id, member });
            }}>Editar roles</Button>}
          {!list.error && canBanMember(actor, usuario.id, member,permissions) && <button type="button" className="li-quiet cm-ban pr"
            aria-label={`Banear a ${member.usuario.nombreVisible}`} onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice(null);
              setBanning({ id, member });
            }}>Banear</button>}
          {!list.error && canSilenceMember(actor, usuario.id, member, permissions) && <button type="button" className="li-quiet pr"
            aria-label={`${silenceOf.has(member.usuario.id) ? 'Quitar el silencio de' : 'Silenciar a'} ${member.usuario.nombreVisible}`} onClick={(e) => {
              trigger.current = e.currentTarget;
              setNotice(null);
              setSilencing({ id, member, silencio: silenceOf.get(member.usuario.id) ?? null });
            }}>{silenceOf.has(member.usuario.id) ? 'Quitar silencio' : 'Silenciar'}</button>}
          {member.usuario.id!==usuario.id&&member.rol!=='PROPIETARIO'&&(member.rol!=='ADMIN'||actor==='PROPIETARIO')&&['ADMIN','PROPIETARIO'].includes(actor)&&<button type="button" className="li-quiet cm-ban pr" onClick={e=>{trigger.current=e.currentTarget;setKicking(member);}}>Echar</button>}
          </span>
        </ListRow>)}</Card>}
        {!list.error && list.items.length === 0 && <span className="cm-state">No hay integrantes para mostrar.</span>}
      </>}
      {detail.comunidad && !list.loading && !list.error && <OwnershipTransfer comunidad={detail.comunidad} members={list.items} onDone={() => { detail.reload(); list.reload(); }} />}
      {canManageBans(actor,permissions) && <CommunityBans key={id} id={id} />}
      {banTarget && <BanMemberDialog key={`${id}:${banTarget.usuario.id}`} id={id} actor={actor} permissions={permissions} userId={usuario.id}
        original={banTarget} member={list.items.find((member) => member.usuario.id === banTarget.usuario.id)}
        list={list} returnFocusRef={trigger} fallbackFocusRef={heading}
        onClose={(message) => { setBanning(null); if (message) setNotice({ id, message }); }} />}
      {kicking&&<CommunityActionDialog title={`¿Echar a ${kicking.usuario.nombreVisible}?`} description="Perderá su membresía, roles y permisos. Podrá volver con una invitación válida." confirmLabel="Echar integrante" returnFocusRef={trigger} onClose={()=>setKicking(null)} onConfirm={async()=>{await kickCommunityMember(id,kicking.usuario.id);setKicking(null);list.reload();}}/>}
      {silencing?.id === id && (silencing.silencio
        ? <LiftSilenceDialog id={id} member={silencing.member} silencio={silencing.silencio} returnFocusRef={trigger} fallbackFocusRef={heading}
            onDone={silences.reload} onClose={(message) => { setSilencing(null); if (message) setNotice({ id, message }); }} />
        : <SilenceMemberDialog id={id} member={silencing.member} returnFocusRef={trigger} fallbackFocusRef={heading}
            blocked={list.error || !canSilenceMember(actor, usuario.id, list.items.find((m) => m.usuario.id === silencing.member.usuario.id), permissions) ? 'Ya no podés silenciar a este integrante.' : ''}
            onDone={silences.reload} onClose={(message) => { setSilencing(null); if (message) setNotice({ id, message }); }} />)}
      {active && <MemberRolesDialog key={`${id}:${active.usuario.id}`} id={id} actor={actor} permissions={permissions} userId={usuario.id}
        original={active} member={list.items.find((member) => member.usuario.id === active.usuario.id)}
        catalog={catalog} list={list} detail={detail} returnFocusRef={trigger} fallbackFocusRef={heading}
        onClose={(message) => { setEditing(null); if (message) setNotice({ id, message }); }} />}
  </CommunityShell>;
}
