import { useId, useRef, useState } from 'react';
import { invitationPath } from '../../utils-invitations.js';

export default function CopyInvitationLink({ codigo, disabled = false }) {
  const id = useId(), messageId = useId(), input = useRef(null);
  const [message, setMessage] = useState('');
  const link = `${window.location.origin}${invitationPath(codigo)}`;
  async function copy() {
    setMessage('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link);
      setMessage('Enlace copiado.');
    } catch {
      input.current?.focus(); input.current?.select();
      setMessage('No se pudo copiar automáticamente. El enlace quedó seleccionado para copiarlo manualmente.');
    }
  }
  return <div className="invitation-copy">
    <label htmlFor={id}>Enlace de invitación</label>
    <div><input ref={input} id={id} readOnly value={link} aria-describedby={messageId} onFocus={(e) => e.target.select()} />
      <button type="button" className="secondary" disabled={disabled} onClick={copy}>Copiar enlace</button></div>
    <p id={messageId} role="status" className="community-help">{message}</p>
  </div>;
}
