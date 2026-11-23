import { SkeletonRows } from '../components/ui/Skeleton.jsx';
import { hasCommunityPermission } from '../utils/permissionCatalog.js';
import { CommunityShell } from '../components/communities/CommunityNav.jsx';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import Button from '../components/ui/Button.jsx';
import Card, { ListRow } from '../components/ui/Card.jsx';
import Field from '../components/ui/Field.jsx';
import Icon from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import '../styles/members.css';
import '../styles/invitations.css';
import CopyInvitationLink from '../components/communities/CopyInvitationLink.jsx';
import CommunityActionDialog from '../components/communities/CommunityActionDialog.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import * as service from '../services/invitationsService.js';
import { invitationPath, invitationStatus } from '../utils/invitations.js';
const STATES = { ACTIVA: 'Activa', REVOCADA: 'Revocada', VENCIDA: 'Vencida', AGOTADA: 'Agotada' };
function InvitationRow({ invitacion, idComunidad, onRevoked }) {
  const [confirm, setConfirm] = useState(false);
  const trigger = useRef(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!invitacion.fechaExpiracion) return;
    const delay = new Date(invitacion.fechaExpiracion).getTime() - Date.now();
    if (delay <= 0) { setNow(Date.now()); return; }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 20, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [invitacion.fechaExpiracion]);
  const status = invitationStatus(invitacion, now);
  const sub = [
    `${window.location.host}${invitationPath(invitacion.codigo)}`,
    invitacion.usosMaximos === null ? `${invitacion.usos} usos` : `${invitacion.usos} de ${invitacion.usosMaximos} usos`,
    invitacion.fechaExpiracion ? `Vence ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(invitacion.fechaExpiracion))}` : 'Sin vencimiento',
  ].join(' · ');
  return <ListRow as="li" className="ci-row">
    <span className="ci-ic"><Icon name="enlace" size={18} stroke={2} /></span>
    <span className="ci-text"><span className="ci-code">{invitacion.codigo}</span><span className="li-sub">{sub}</span></span>
    {status !== 'ACTIVA' && <span className="bdg bdg-base">{STATES[status]}</span>}
    <CopyInvitationLink codigo={invitacion.codigo} disabled={status !== 'ACTIVA'} />
    {status === 'ACTIVA' && <button ref={trigger} type="button" className="li-quiet ci-revoke pr" aria-label="Revocar invitación" onClick={() => setConfirm(true)}>Revocar</button>}
    {confirm && <CommunityActionDialog title="¿Revocar esta invitación?" description="El enlace dejará de permitir nuevos ingresos. Las personas que ya ingresaron conservarán su membresía."
      confirmLabel="Revocar invitación" returnFocusRef={trigger} onClose={() => setConfirm(false)} onConfirm={async () => {
        await service.revokeInvitation(idComunidad, invitacion.id);
        if (alive.current) onRevoked(invitacion.id);
      }} />}
  </ListRow>;
}
export default function CommunityInvitationsPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  const permitted = hasCommunityPermission(detail.comunidad,'GESTIONAR_INVITACIONES');
  const list = useCommunityCollection(id, service.getInvitations, permitted);
  const [duration, setDuration] = useState('24'), [uses, setUses] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [usesError, setUsesError] = useState('');
  const pending = useRef(false), alive = useRef(false), operation = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { operation.current++; pending.current = false; setBusy(false); setError(''); setNotice(''); setDuration('24'); setUses(''); }, [id]);
  useLostCommunity(detail.lost);
  async function create(event) {
    event.preventDefault();
    if (pending.current || !permitted) return;
    const usosMaximos = uses === '' ? null : Number(uses);
    if (usosMaximos !== null && (!Number.isInteger(usosMaximos) || usosMaximos < 1 || usosMaximos > 100)) {
      setUsesError('La cantidad máxima de usos debe estar entre 1 y 100.'); return;
    }
    pending.current = true; setBusy(true); setError(''); setUsesError(''); setNotice('');
    const version = operation.current;
    try {
      const { invitacion } = await service.createInvitation(id, { duracionHoras: duration === '' ? null : Number(duration), usosMaximos });
      if (!alive.current || version !== operation.current) return;
      list.mutate((old) => [invitacion, ...old.filter((item) => item.id !== invitacion.id)]);
      setNotice('Invitación creada.');
    } catch (e) { if (alive.current && version === operation.current) setError(e.message); }
    finally { if (version === operation.current) { pending.current = false; if (alive.current) setBusy(false); } }
  }
  if (!detail.comunidad) return <div className="page"><div className="page-body"><CommunityState {...detail} /></div></div>;
  return <CommunityShell comunidad={detail.comunidad}>
      {!permitted ? <Notice tone="error" title="Tu rol no permite administrar invitaciones." /> : <>
        {detail.error && <Notice tone="error" title="No se pudo actualizar la comunidad." actionLabel="Reintentar" onAction={detail.reload} />}
        <Card as="form" className="ci-new" onSubmit={create} aria-busy={busy} noValidate>
          <h2 className="page-h2 ci-h2">Nueva invitación</h2>
          <div className="ci-fields">
            <Field label="Máximo de usos" type="number" min="1" max="100" step="1" placeholder="Sin límite" value={uses} disabled={busy} onChange={(e) => setUses(e.target.value)} error={usesError} />
            <Field as="select" label="Vence" value={duration} disabled={busy} onChange={(e) => setDuration(e.target.value)}>
              <option value="1">En 1 hora</option><option value="24">En 24 horas</option><option value="168">En 7 días</option><option value="">Sin vencimiento</option>
            </Field>
            <Button type="submit" loading={busy}>{busy ? 'Creando…' : 'Crear invitación'}</Button>
          </div>
          {error && <Notice tone="error" title={error} />}
          {notice && <Notice tone="exito" title={notice} />}
        </Card>
        <h2 className="page-h2 page-h2-gap">Activas</h2>
        {list.error && <Notice tone="error" title={list.error.message} actionLabel="Reintentar" onAction={list.reload} />}
        {list.loading ? <SkeletonRows rows={3} avatar={0} action label="Cargando invitaciones…" /> :
          list.items.length > 0 && <Card as="ul">{list.items.map((inv) => <InvitationRow key={inv.id} invitacion={inv} idComunidad={id}
            onRevoked={(revoked) => {
              list.mutate((old) => old.map((item) => item.id === revoked ? { ...item, estado: 'REVOCADA' } : item));
              setNotice('Invitación revocada.');
            }} />)}</Card>}
        {!list.loading && !list.error && list.items.length === 0 && <span className="cm-state">No hay invitaciones creadas.</span>}
      </>}
  </CommunityShell>;
}
