import { useEffect, useId, useRef, useState } from 'react';
import { invitationPath } from '../../utils/invitations.js';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

export default function CopyInvitationLink({ codigo, disabled = false }) {
  const messageId = useId();
  const input = useRef(null);
  const [message, setMessage] = useState('');
  const [manual, setManual] = useState(false);
  const link = `${window.location.origin}${invitationPath(codigo)}`;

  useEffect(() => {
    if (manual && message) { input.current?.focus(); input.current?.select(); }
  }, [manual, message]);

  async function copy() {
    setMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setManual(false);
      setMessage('Enlace copiado.');
    } catch {
      setManual(true);
      setMessage('No se pudo copiar automáticamente. El enlace quedó seleccionado para copiarlo manualmente.');
    }
  }

  return (
    <>
      <Button size="sm" variant="secundario" disabled={disabled} onClick={copy} aria-describedby={messageId}>
        <Icon name="copiar" size={15} stroke={2} />Copiar enlace
      </Button>
      {manual && <label className="inp ci-manual"><input ref={input} readOnly value={link} aria-label="Enlace de invitación" onFocus={(e) => e.target.select()} /></label>}
      <span id={messageId} role="status" className="ci-msg">{message}</span>
    </>
  );
}
