import { useEffect, useRef, useState } from 'react';
import { useCommunityCollection } from '../../hooks/useCommunityCollection.js';
import { useSocket } from '../../hooks/useSocket.js';
import { EVENTS } from '../../constants/events.js';
import { banCommunityMember, getCommunityBans, removeCommunityBan } from '../../services/communityBansService.js';
import CommunityRoleFormDialog from './CommunityRoleFormDialog.jsx';

const rank = { INTEGRANTE: 1, MODERADOR: 2, ADMIN: 3, PROPIETARIO: 4 };
export const canManageBans = (actor) => rank[actor] >= rank.MODERADOR;
export const canBanMember = (actor, userId, member) =>
  canManageBans(actor) && !!member && member.usuario.id !== userId && rank[actor] > rank[member.rol];

export function BanMemberDialog({ id, actor, userId, original, member, list, onClose, returnFocusRef, fallbackFocusRef }) {
  const [reason, setReason] = useState('');
  const blocked = list.error || !canBanMember(actor, userId, member) ? 'Ya no podés banear a este integrante.' : '';
  return <CommunityRoleFormDialog title={`Banear a ${original.usuario.nombreVisible}`} confirmLabel="Confirmar baneo" destructive
    blocked={blocked} onClose={onClose} returnFocusRef={returnFocusRef} fallbackFocusRef={fallbackFocusRef}
    onSave={async () => {
      await banCommunityMember(id, original.usuario.id, reason.trim());
      list.mutate((items) => items.filter(({ usuario }) => usuario.id !== original.usuario.id));
      list.reload();
      return 'El integrante fue baneado.';
    }}>
    <p>Perderá el acceso a la comunidad y no podrá volver por invitación hasta que levantes el baneo.</p>
    <label>Motivo (opcional)<textarea maxLength={300} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
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
  return <section className="community-bans" aria-label="Baneos">
    <button type="button" ref={toggle} className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Ocultar baneos' : 'Ver baneos'}
    </button>
    {notice && <p role="status" className="community-success">{notice}</p>}
    {open && <>
      {bans.error && <p role="alert" className="notice error">{bans.error.message} <button className="secondary" onClick={bans.reload}>Reintentar</button></p>}
      {bans.loading && <p role="status">Cargando baneos…</p>}
      {!bans.loading && !bans.error && bans.items.length === 0 && <p>No hay baneos para mostrar.</p>}
      <ul className="community-list">{bans.items.map((ban) => <li key={ban.usuario.id}>
        <div className="community-member-row"><div className="community-row-text">
          <strong>{ban.usuario.nombreVisible}</strong><span>@{ban.usuario.nombreUsuario}</span>
          <span>{new Date(ban.fechaCreacion).toLocaleDateString('es-AR')} · {ban.autor?.nombreVisible ?? 'Autor no disponible'}</span>
          {ban.motivo && <p>Motivo: {ban.motivo}</p>}
        </div>
        {!bans.error && <button type="button" className="secondary" aria-label={`Levantar baneo de ${ban.usuario.nombreVisible}`} onClick={(e) => {
          trigger.current = e.currentTarget; setTarget(ban); setNotice('');
        }}>Levantar baneo</button>}</div>
      </li>)}</ul>
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
