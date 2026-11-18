import { useRef, useState } from 'react';
import { ConfirmDialog } from '../ui/Dialog.jsx';

export default function CommunityActionDialog({ title, description, confirmLabel, onConfirm, onClose, confirmVariant = 'peligro', returnFocusRef }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog open title={title} confirmLabel={confirmLabel} confirmVariant={confirmVariant} loading={busy} error={error} onCancel={onClose} onConfirm={confirm} returnFocusRef={returnFocusRef}>
      {description}
    </ConfirmDialog>
  );
}
