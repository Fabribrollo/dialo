import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import FormField from '../components/FormField.jsx';
import CopyInvitationLink from '../components/communities/CopyInvitationLink.jsx';
import CommunityActionDialog from '../components/communities/CommunityActionDialog.jsx';
import { useCommunity } from '../hooks/useCommunity.js';
import { useCommunityCollection } from '../hooks/useCommunityCollection.js';
import { CommunityState, useLostCommunity } from './CommunityPage.jsx';
import * as service from '../services/invitationsService.js';
import { invitationStatus } from '../utils-invitations.js';

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
  return <li className="invitation-row">
    <div className="invitation-row-heading"><strong>{STATES[status]}</strong><span className="community-help">
      {invitacion.usos} {invitacion.usosMaximos === null ? 'usos · sin límite' : `de ${invitacion.usosMaximos} usos`}
    </span></div>
    <p className="community-help">{invitacion.fechaExpiracion
      ? `Vence: ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(invitacion.fechaExpiracion))}`
      : 'Sin vencimiento'} · Creada por {invitacion.creador.nombreVisible}</p>
    <CopyInvitationLink codigo={invitacion.codigo} disabled={status !== 'ACTIVA'} />
    {status === 'ACTIVA' && <button ref={trigger} type="button" className="secondary danger" onClick={() => setConfirm(true)}>Revocar invitación</button>}
    {confirm && <CommunityActionDialog title="¿Revocar esta invitación?" description="El enlace dejará de permitir nuevos ingresos. Las personas que ya ingresaron conservarán su membresía."
      confirmLabel="Revocar invitación" returnFocusRef={trigger} onClose={() => setConfirm(false)} onConfirm={async () => {
        await service.revokeInvitation(idComunidad, invitacion.id);
        if (alive.current) onRevoked(invitacion.id);
      }} />}
  </li>;
}

export default function CommunityInvitationsPage() {
  const { id: param } = useParams();
  const id = /^\d+$/.test(param ?? '') ? Number(param) : NaN;
  const detail = useCommunity(id);
  const permitted = ['PROPIETARIO', 'ADMIN', 'MODERADOR'].includes(detail.comunidad?.miRol);
  const list = useCommunityCollection(id, service.getInvitations, permitted);
  const [duration, setDuration] = useState('24'), [uses, setUses] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const pending = useRef(false), alive = useRef(false), operation = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { operation.current++; pending.current = false; setBusy(false); setError(''); setNotice(''); setDuration('24'); setUses(''); }, [id]);
  useLostCommunity(detail.lost);
  async function create(event) {
    event.preventDefault();
    if (pending.current || !permitted) return;
    const usosMaximos = uses === '' ? null : Number(uses);
    if (usosMaximos !== null && (!Number.isInteger(usosMaximos) || usosMaximos < 1 || usosMaximos > 100)) {
      setError('La cantidad máxima de usos debe estar entre 1 y 100.'); return;
    }
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const version = operation.current;
    try {
      const { invitacion } = await service.createInvitation(id, { duracionHoras: duration === '' ? null : Number(duration), usosMaximos });
      if (!alive.current || version !== operation.current) return;
      list.mutate((old) => [invitacion, ...old.filter((item) => item.id !== invitacion.id)]);
      setNotice('Invitación creada.');
    } catch (e) { if (alive.current && version === operation.current) setError(e.message); }
    finally { if (version === operation.current) { pending.current = false; if (alive.current) setBusy(false); } }
  }
  return <section className="page-container communities-page">
    <Link className="community-back" to={detail.valid ? `/comunidades/${id}` : '/comunidades'}>← Volver a la comunidad</Link>
    {!detail.comunidad ? <CommunityState {...detail} /> : <>
      <header className="page-heading community-page-heading"><div><h1>Invitaciones</h1><p>{detail.comunidad.nombre}</p></div>
        {permitted && <button type="button" className="secondary" disabled={list.refreshing || busy} onClick={() => { detail.reload(); list.reload(); }}>Actualizar</button>}</header>
      {!permitted ? <p role="alert">Tu rol no permite administrar invitaciones.</p> : <>
        {detail.error && <p role="alert" className="notice error">No se pudo actualizar la comunidad. {detail.error.message}</p>}
        <form className="invitation-form" onSubmit={create} aria-busy={busy}>
          <h2>Crear invitación</h2>
          <fieldset disabled={busy}>
            <FormField as="select" label="Vencimiento" value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="1">1 hora</option><option value="24">24 horas</option><option value="168">7 días</option><option value="">Sin vencimiento</option>
            </FormField>
            <FormField label="Máximo de usos (opcional)" type="number" min="1" max="100" step="1" value={uses} onChange={(e) => setUses(e.target.value)} />
            <p className="community-help">Dejá el máximo de usos vacío para permitir ingresos sin límite.</p>
            <button type="submit">{busy ? 'Creando…' : 'Generar invitación'}</button>
          </fieldset>
          {error && <p role="alert" className="notice error">{error}</p>}
          {notice && <p role="status" className="community-success">{notice}</p>}
        </form>
        <h2>Invitaciones de la comunidad</h2>
        {list.error && <p role="alert" className="notice error">{list.error.message} <button className="secondary" onClick={list.reload}>Reintentar</button></p>}
        {list.loading ? <p role="status" className="center-note">Cargando invitaciones…</p> :
          <ul className="community-list invitation-list">{list.items.map((inv) => <InvitationRow key={inv.id} invitacion={inv} idComunidad={id}
            onRevoked={(revoked) => {
              list.mutate((old) => old.map((item) => item.id === revoked ? { ...item, estado: 'REVOCADA' } : item));
              setNotice('Invitación revocada.');
            }} />)}</ul>}
        {!list.loading && !list.error && list.items.length === 0 && <p className="center-note">No hay invitaciones creadas.</p>}
      </>}
    </>}
  </section>;
}
