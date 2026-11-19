import { API_URL } from '../../constants/api.js';
import { memo, useMemo, useState } from 'react';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';
import Avatar from '../ui/Avatar.jsx';
import Icon from '../ui/Icon.jsx';
import InviteEmbed, { INVITE_LINK, linkify } from './InviteEmbed.jsx';
import './chatMessage.css';

function hora(fecha) {
  return new Date(fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function ChatMessage({ mensaje, own, first, connected, onEdit, onDelete, autor }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cuando = useMemo(() => new Date(mensaje.fechaCreacion).toLocaleString('es-AR'), [mensaje.fechaCreacion]);

  async function save(e) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onEdit(mensaje.id, text);
      setEditing(false);
    } catch (err) {
      setError(err.code === 'MESSAGE_BLOCKED' ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setBusy(false);
    }
  }

  const forma = `${own ? 'msg-own' : 'msg-other'} ${first ? 'msg-first' : ''}`;
  const conAutor = autor && !own;
  const codigos = useMemo(() => (mensaje.contenido ? [...new Set([...mensaje.contenido.matchAll(INVITE_LINK)].map((m) => m[1]))] : []), [mensaje.contenido]);
  const contenido = useMemo(() => (mensaje.contenido ? linkify(mensaje.contenido) : null), [mensaje.contenido]);

  return (
    <li className={`msg ${own ? 'msg-right' : ''} ${conAutor ? 'msg-author' : ''}`}>
      {conAutor && (first ? <Avatar nombre={autor.nombreVisible} foto={autor.fotoUrl} color={autor.colorAvatar} size={38} className="msg-av" /> : <span className="msg-av-gap" />)}
      <div className="msg-col">
      {conAutor && first && <span className="msg-who"><b>{autor.nombreVisible}</b><time dateTime={mensaje.fechaCreacion} title={cuando}>{hora(mensaje.fechaCreacion)}</time></span>}
      {first && !conAutor && <time className="msg-time" dateTime={mensaje.fechaCreacion} title={cuando}>{hora(mensaje.fechaCreacion)}</time>}
      {mensaje.eliminado ? (
        <span className={`msg-deleted ${forma}`}>{mensaje.eliminadoPorModerador ? 'Mensaje eliminado por moderación' : 'Este mensaje se eliminó'}</span>
      ) : editing ? (
        <form className="msg-edit" onSubmit={save}>
          <label className="inp msg-edit-inp">
            <textarea
              aria-label="Editar mensaje"
              autoFocus
              rows={1}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); save(); }
              }}
            />
          </label>
          {error && (error.startsWith('Bloqueado:')
            ? <div className="msg-blocked-edit" role="alert"><span className="lm-shield"><Icon name="moderacion" size={17} stroke={2.1} /></span><span><b>{error}</b><small>No se guardó el cambio</small></span></div>
            : <Notice tone="error" title={error}>Tu mensaje sigue como estaba.</Notice>)}
          <div className="msg-edit-actions">
            <Button variant="secundario" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
            <Button type="submit" size="sm" loading={busy} disabled={!connected || !text.trim()}>Guardar</Button>
          </div>
        </form>
      ) : (
        <div className="msg-line">
          {own && (onEdit || onDelete) && (
            <span className="lg msg-tools">
              {onEdit && <button type="button" className="pr" disabled={!connected} aria-label={`Editar mensaje de ${cuando}`} onClick={() => { setText(mensaje.contenido); setEditing(true); }}>Editar</button>}
              {onDelete && <button type="button" className="pr msg-tool-danger" disabled={!connected} aria-label={`Eliminar mensaje de ${cuando}`} onClick={(e) => onDelete(mensaje.id, e.currentTarget)}>Eliminar</button>}
            </span>
          )}
          {mensaje.fechaEdicion && own && <span className="msg-edited">editado</span>}
          <span className={`${own ? 'ac' : 'bub'} msg-bub ${forma}`}>{contenido}</span>
          {mensaje.fechaEdicion && !own && <span className="msg-edited">editado</span>}
          {!own && (onEdit || onDelete) && (
            <span className="lg msg-tools">
              {onEdit && <button type="button" className="pr" disabled={!connected} aria-label={`Editar mensaje de ${cuando}`} onClick={() => { setText(mensaje.contenido); setEditing(true); }}>Editar</button>}
              {onDelete && <button type="button" className="pr msg-tool-danger" disabled={!connected} aria-label={`Eliminar mensaje de ${cuando}`} onClick={(e) => onDelete(mensaje.id, e.currentTarget)}>Eliminar</button>}
            </span>
          )}        </div>
      )}
      {!mensaje.eliminado && mensaje.adjunto && <a href={`${API_URL}/files/${mensaje.adjunto.id}`} target="_blank" rel="noreferrer">Descargar {mensaje.adjunto.nombre}</a>}
      {!mensaje.eliminado && !editing && codigos.map((c) => <InviteEmbed key={c} codigo={c} />)}
      </div>
    </li>
  );
}

// Cada mensaje solo se vuelve a dibujar si cambió él, su autor o la conexión; escribir en el campo no lo toca.
export default memo(ChatMessage);
