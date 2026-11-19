import { useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { ConfirmDialog } from '../ui/Dialog.jsx';

export default function OwnershipTransfer({ comunidad, members, onDone }) {
  const [target, setTarget] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const trigger = useRef(null);
  if (comunidad.miRol !== 'PROPIETARIO') return null;
  return <section className="ownership-transfer">
    <h2>Transferir propiedad</h2>
    <p>La persona elegida pasa a ser propietaria. Vos quedás como administrador.</p>
    <label>Nuevo propietario<select value={target} onChange={(e) => setTarget(e.target.value)}>
      <option value="">Elegí un integrante</option>
      {members.filter((m) => m.rol !== 'PROPIETARIO').map(({ usuario }) => <option key={usuario.id} value={usuario.id}>{usuario.nombreVisible} (@{usuario.nombreUsuario})</option>)}
    </select></label>
    <button ref={trigger} type="button" disabled={!target} onClick={() => { setError(''); setConfirm(true); }}>Transferir propiedad</button>
    {confirm && <ConfirmDialog open title="Confirmar transferencia" confirmLabel="Transferir" loading={busy} error={error}
      onCancel={() => { if (!busy) setConfirm(false); }} returnFocusRef={trigger} onConfirm={async () => {
        if (busy) return;
        setBusy(true);
        try { await api.post(`/communities/${comunidad.id}/ownership`, { idUsuario: Number(target) }); setConfirm(false); onDone(); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
      }}>La persona seleccionada tendrá el control de la comunidad. Esta acción requiere que ella te devuelva la propiedad para revertirse.</ConfirmDialog>}
  </section>;
}
