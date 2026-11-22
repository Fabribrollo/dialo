import {useUnsavedChanges} from '../../context/UnsavedChangesContext.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import '../ui/dialog.css';

export default function CommunityRoleFormDialog({ title, children, blocked, onSave, onClose, returnFocusRef, fallbackFocusRef, confirmLabel = 'Guardar', destructive = false, dirty=false, signature='' }) {
  const dialog = useRef(null), pending = useRef(false), alive = useRef(false), confirmed = useRef(false);
  const titleId = useId();
  const {guard,markSaved}=useUnsavedChanges(dirty,title,signature);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    alive.current = true;
    const node = dialog.current, trigger = returnFocusRef.current;
    node.showModal();
    return () => {
      alive.current = false;
      node.close();
      (!confirmed.current && trigger?.isConnected ? trigger : fallbackFocusRef.current)?.focus();
    };
  }, [returnFocusRef, fallbackFocusRef]);

  async function submit(event) {
    event.preventDefault();
    if (pending.current || blocked) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const message = await onSave();
      if (alive.current) {
        confirmed.current = destructive;
        markSaved();onClose(message);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <dialog ref={dialog} className="dlg dlg-confirm" aria-labelledby={titleId}
    onCancel={(e) => { e.preventDefault(); if (!pending.current) guard(onClose); }}>
    <h3 id={titleId}>{title}</h3>
    <form className="dlg-form" onSubmit={submit} aria-busy={busy}>
      <fieldset className="dlg-fieldset" disabled={busy || Boolean(blocked)}>{children}</fieldset>
      {error && <Notice title={error}/>}
      {blocked && <Notice title={blocked}/>}
      <div className="dlg-actions">
        <Button variant="secundario" size="sm" autoFocus={destructive} disabled={busy} onClick={() => guard(onClose)}>Cancelar</Button>
        <Button type="submit" size="sm" variant={destructive ? 'peligro' : 'primario'} loading={busy} disabled={Boolean(blocked)}>
          {busy ? 'Guardando…' : confirmLabel}
        </Button>
      </div>
    </form>
  </dialog>;
}