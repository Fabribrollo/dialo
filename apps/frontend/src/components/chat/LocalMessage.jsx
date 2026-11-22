import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

export default function LocalMessage({ mensaje, onResend, onDiscard }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(mensaje.contenido);
  const hora = mensaje.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const bloqueado = mensaje.st === 'blk';

  if (editing) {
    return (
      <li className="msg msg-right">
        <form className="msg-edit" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { setEditing(false); onResend(mensaje, text); } }}>
          <label className="inp msg-edit-inp"><textarea aria-label="Editar mensaje bloqueado" autoFocus rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <div className="msg-edit-actions">
            <Button variant="secundario" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={!text.trim()}>Guardar</Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="msg msg-right lm">
      <time className="msg-time">{hora}</time>
      <span className={`msg-bub msg-own msg-first lm-bub ${bloqueado ? 'lm-blk' : 'ac lm-rev'}`}>{mensaje.contenido}</span>
      {!bloqueado&&<span className="lm-send-status" role="status">Enviando…</span>}
      {bloqueado && (
        <div className="lm-row" role="alert">
          <span className="lm-shield"><Icon name="moderacion" size={13} stroke={2.2} /></span>
          <b>Bloqueado: contiene {mensaje.regla}</b>
          <button type="button" className="lm-btn pr" onClick={() => setEditing(true)}><Icon name="lapiz" size={13} stroke={2} />Editar</button>
          <button type="button" className="lm-btn pr" onClick={() => onDiscard(mensaje)}>Descartar</button>
        </div>
      )}
    </li>
  );
}
