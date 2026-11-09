import { useEffect, useId, useRef, useState } from 'react';

export default function CommunityRoleFormDialog({ title, children, blocked, onSave, onClose, returnFocusRef, fallbackFocusRef, confirmLabel = 'Guardar', destructive = false }) {
  const dialog = useRef(null), pending = useRef(false), alive = useRef(false), confirmed = useRef(false);
  const titleId = useId();
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
        onClose(message);
      }
    } catch (e) {
      if (alive.current) setError(e.message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <dialog ref={dialog} className="community-delete-dialog community-role-dialog" aria-labelledby={titleId}
    onCancel={(e) => { e.preventDefault(); if (!pending.current) onClose(); }}>
    <h2 id={titleId}>{title}</h2>
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || Boolean(blocked)}>{children}</fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      {blocked && <p role="alert" className="form-error">{blocked}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary" autoFocus={destructive} disabled={busy} onClick={() => onClose()}>Cancelar</button>
        <button type="submit" className={destructive ? 'danger-button' : undefined} disabled={busy || Boolean(blocked)}>
          {busy ? 'Guardando…' : confirmLabel}
        </button>
      </div>
    </form>
  </dialog>;
}
