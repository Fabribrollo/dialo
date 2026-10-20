import { useEffect, useId, useRef, useState } from 'react';

export default function CommunityActionDialog({ title, description, confirmLabel, onConfirm, onClose, returnFocusRef }) {
  const dialog = useRef(null), pending = useRef(false);
  const titleId = useId(), descriptionId = useId();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current, trigger = returnFocusRef.current;
    node.showModal();
    return () => { node.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [returnFocusRef]);
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="community-delete-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); if (!pending.current) onClose(); }}>
    <h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button className="secondary" type="button" autoFocus disabled={busy} onClick={onClose}>Cancelar</button>
      <button className="danger-button" type="button" disabled={busy} onClick={confirm}>{busy ? 'Procesando…' : confirmLabel}</button>
    </div>
  </dialog>;
}
