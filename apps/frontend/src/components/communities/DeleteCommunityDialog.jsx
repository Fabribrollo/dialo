import { useEffect, useId, useRef, useState } from 'react';

export default function DeleteCommunityDialog({ comunidad, onClose, onConfirm, returnFocusRef }) {
  const dialog = useRef(null);
  const title = useId();
  const description = useId();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const trigger = returnFocusRef.current;
    const node = dialog.current;
    node.showModal();
    return () => { node.close(); if (trigger?.isConnected) trigger.focus(); };
  }, [returnFocusRef]);

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await onConfirm(); }
    catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="community-delete-dialog" aria-labelledby={title} aria-describedby={description}
    onCancel={(e) => { e.preventDefault(); if (!pending.current) onClose(); }}>
    <h2 id={title}>¿Eliminar «{comunidad.nombre}»?</h2>
    <p id={description}>Se eliminarán la comunidad, sus canales, los mensajes de esos canales y las invitaciones. Esta acción no se puede deshacer.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="dialog-actions">
      <button type="button" className="secondary" autoFocus disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="danger-button" disabled={busy} onClick={confirm}>
        {busy ? 'Eliminando…' : 'Eliminar comunidad'}
      </button>
    </div>
  </dialog>;
}
