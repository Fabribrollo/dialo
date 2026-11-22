import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';
import Notice from './Notice.jsx';
import Icon from './Icon.jsx';
import Field from './Field.jsx';
import './dialog.css';

export default function Dialog({ open, onClose, label, className = '', returnFocusRef, children }) {
  const ref = useRef(null);
  const trigger = useRef(null);

  useEffect(() => () => {
    if (trigger.current?.isConnected) trigger.current.focus();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      trigger.current = returnFocusRef?.current ?? document.activeElement;
      if (el.showModal) el.showModal();
      else el.setAttribute('open', '');
    }
    if (!open && el.open) {
      if (el.close) el.close();
      else el.removeAttribute('open');
      if (trigger.current?.isConnected) trigger.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dlg ${className}`}
      aria-label={label}
      onCancel={(e) => { e.preventDefault(); onClose?.(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      {open && children}
    </dialog>
  );
}

export function ConfirmDialog({
  open, title, children, confirmLabel, confirmVariant = 'peligro', cancelLabel = 'Cancelar',
  onConfirm, onCancel, loading = false, error, confirmText, returnFocusRef,
}) {
  const [typed, setTyped] = useState('');
  const bloqueado = confirmText !== undefined && typed !== confirmText;

  useEffect(() => { if (!open) setTyped(''); }, [open]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} label={title} className="dlg-confirm" returnFocusRef={returnFocusRef}>
      <h3>{title}</h3>
      {children && <span className="dlg-sub">{children}</span>}
      {confirmText !== undefined && (
        <Field label={`Escribí «${confirmText}» para confirmar`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      )}
      {error && <Notice title={error}/>}
      <div className="dlg-actions">
        <Button variant="secundario" size="sm" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
        <Button variant={confirmVariant} size="sm" onClick={onConfirm} loading={loading} disabled={bloqueado}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
