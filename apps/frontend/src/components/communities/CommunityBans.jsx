import { SkeletonRows } from '../ui/Skeleton.jsx';
import Field from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import Card, { ListRow, RowText } from '../ui/Card.jsx';
import Notice from '../ui/Notice.jsx';
import { useEffect, useRef, useState } from 'react';
import { useCommunityCollection } from '../../hooks/useCommunityCollection.js';
import { useSocket } from '../../hooks/useSocket.js';
import { EVENTS } from '../../constants/events.js';
import { banCommunityMember, getCommunityBans, removeCommunityBan } from '../../services/communityBansService.js';
import CommunityRoleFormDialog from './CommunityRoleFormDialog.jsx';

const rank = { INTEGRANTE: 1, MODERADOR: 2, ADMIN: 3, PROPIETARIO: 4 };
export const canManageBans = (actor,permissions=[]) => ['ADMIN','PROPIETARIO'].includes(actor);
export const canBanMember = (actor, userId, member,permissions=[]) =>
  canManageBans(actor,permissions) && !!member && member.usuario.id !== userId && member.rol!=='PROPIETARIO'&&(member.rol!=='ADMIN'||actor==='PROPIETARIO');

export function BanMemberDialog({ id, actor, permissions=[], userId, original, member, list, onClose, returnFocusRef, fallbackFocusRef }) {
  const [reason, setReason] = useState(''),[duration,setDuration]=useState('PERMANENTE');
  const blocked = list.error || !canBanMember(actor, userId, member,permissions) ? 'Ya no podés banear a este integrante.' : '';
  return <CommunityRoleFormDialog title={`Banear a ${original.usuario.nombreVisible}`} confirmLabel="Confirmar baneo" destructive
    blocked={blocked} onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
    onSave={async () => {
      await banCommunityMember(id, original.usuario.id, reason.trim(),duration);
      list.mutate((items) => items.filter(({ usuario }) => usuario.id !== original.usuario.id));
      list.reload();
      return 'El integrante fue baneado.';
    }}>
    <p>Perderá el acceso a la comunidad y no podrá volver por invitación hasta que levantes el baneo.</p>
    <Field as="select" label="Duración del baneo" value={duration} onChange={e=>setDuration(e.target.value)}><option value="30_MIN">30 minutos</option><option value="5_HORAS">5 horas</option><option value="PERMANENTE">Permanente</option></Field>
    <Field as="textarea" label="Motivo (opcional)" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
  </CommunityRoleFormDialog>;
}

export default function CommunityBans({ id }) {
  const [open, setOpen] = useState(false), [target, setTarget] = useState(null), [notice, setNotice] = useState('');
  const bans = useCommunityCollection(id, getCommunityBans, open);
  const socket = useSocket(), trigger = useRef(null), toggle = useRef(null);
  useEffect(() => {
    const update = ({ idComunidad }) => { if (idComunidad === id) bans.reload(); };
    socket?.on(EVENTS.COMMUNITY_BANS_CHANGED, update);
    return () => socket?.off(EVENTS.COMMUNITY_BANS_CHANGED, update);
  }, [socket, id, bans.reload]);
  return <section className="cb" aria-label="Baneos">
    <Button ref={toggle} variant="secundario" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Ocultar baneos' : 'Ver baneos'}
    </Button>
    {notice && <Notice tone="exito" title={notice} />}
    {open && <>
      {bans.error && <Notice tone="error" title={bans.error.message} actionLabel="Reintentar" onAction={bans.reload} />}
      {bans.loading && <SkeletonRows rows={3} avatar={40} action label="Cargando baneos…" />}
      {!bans.loading && !bans.error && bans.items.length === 0 && <span className="cm-state">No hay baneos para mostrar.</span>}
      {bans.items.length > 0 && <Card as="ul">{bans.items.map((ban) => <ListRow as="li" key={ban.usuario.id}>
        <RowText title={ban.usuario.nombreVisible}>
          @{ban.usuario.nombreUsuario} · {new Date(ban.fechaCreacion).toLocaleDateString('es-AR')} · {ban.autor?.nombreVisible ?? 'Autor no disponible'}
          <span className="li-sub">{ban.fechaVencimiento?`Hasta ${new Date(ban.fechaVencimiento).toLocaleString('es-AR')}`:'Permanente'}</span>{ban.motivo && <span className="cb-reason">Motivo: {ban.motivo}</span>}
        </RowText>
        {!bans.error && <Button size="sm" variant="secundario" aria-label={`Levantar baneo de ${ban.usuario.nombreVisible}`} onClick={(e) => {
          trigger.current = e.currentTarget; setTarget(ban); setNotice('');
        }}>Levantar baneo</Button>}
      </ListRow>)}</Card>}
    </>}
    {target && <CommunityRoleFormDialog title={`Levantar baneo de ${target.usuario.nombreVisible}`} confirmLabel="Confirmar desbloqueo"
      returnFocusRef={trigger} fallbackFocusRef={toggle}
      blocked={bans.error ? 'No se pudo verificar la lista de baneos.' : ''}
      onClose={(message) => { setTarget(null); if (message) setNotice(message); }}
      onSave={async () => {
        await removeCommunityBan(id, target.usuario.id);
        bans.mutate((items) => items.filter(({ usuario }) => usuario.id !== target.usuario.id));
        bans.reload();
        return 'Se levantó el baneo.';
      }}>
      <p>Podrá ingresar con una invitación válida. Sus roles y permisos anteriores no se restauran.</p>
    </CommunityRoleFormDialog>}
  </section>;
}
