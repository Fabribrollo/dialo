import {useContext} from 'react';
import {PollCard} from './ChatExtras.jsx';
import {MessageInteractionContext} from './MessageInteractions.jsx';
import {openProfile} from '../../utils/profiles.js';
import {MessageOptions,MessageReactions,ReplyQuote} from './MessageInteractions.jsx';
import AttachmentCard from './AttachmentCard.jsx';

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
  const interactions=useContext(MessageInteractionContext);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cuando = useMemo(() => new Date(mensaje.fechaCreacion).toLocaleString('es-AR'), [mensaje.fechaCreacion]);

  async function save(e) {
    e?.preventDefault();
    if (!text.trim() || busy || mensaje.adjunto) return;
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

  const canModify = !mensaje.registroLlamada;
  const editAction=mensaje.adjunto?undefined:onEdit;
  const forma = `${own ? 'msg-own' : 'msg-other'} ${first ? 'msg-first' : ''}`;
  const conAutor = autor && !own;
  const codigos = useMemo(() => (mensaje.contenido ? [...new Set([...mensaje.contenido.matchAll(INVITE_LINK)].map((m) => m[1]))] : []), [mensaje.contenido]);
  const contenido = useMemo(() => (mensaje.contenido ? linkify(mensaje.contenido) : null), [mensaje.contenido]);

  return (
    <li data-message-id={mensaje.id} tabIndex={-1} className={`msg ${own ? 'msg-right' : ''} ${conAutor ? 'msg-author' : ''}`}>
      {conAutor && (first ? <Avatar idUsuario={autor.id} nombre={autor.nombreVisible} foto={autor.fotoUrl} color={autor.colorAvatar} size={38} className="msg-av" /> : <span className="msg-av-gap" />)}
      <div className="msg-col">
      <article className={`message-bubble ${own?'bubble-own':'bubble-other'} ${mensaje.adjunto?'bubble-media':''} ${mensaje.registroLlamada?'bubble-call':''}`}>
      {conAutor&&first&&<button type="button" className="bubble-author profile-name" onClick={()=>openProfile(autor.id)}>{autor.nombreVisible}</button>}
      {!mensaje.eliminado&&<ReplyQuote message={mensaje}/>}
      {mensaje.eliminado ? (
        <span className={`msg-deleted ${forma}`}>{mensaje.eliminadoPorModerador ? 'Mensaje eliminado por moderación' : 'Este mensaje se eliminó'}</span>
      ) : editing && !mensaje.adjunto ? (
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
        <>
          {mensaje.adjunto&&<AttachmentCard file={mensaje.adjunto}/>}
          {(!mensaje.adjunto||mensaje.contenido!=='Archivo adjunto')&&<span className={`bubble-text ${mensaje.registroLlamada?'msg-call-record':''}`}>{mensaje.registroLlamada&&<Icon name="telefono" size={15}/>} {contenido}</span>}
          {mensaje.encuesta&&<PollCard message={mensaje}/>}
          <MessageOptions message={mensaje} connected={connected} onEdit={canModify&&editAction?()=>{setText(mensaje.contenido);setEditing(true);}:undefined} onDelete={onDelete}/>
          {codigos.map(c=><InviteEmbed key={c} codigo={c}/>)}
        </>
      )}
      <footer className="bubble-footer"><MessageReactions message={mensaje}/><span className="bubble-meta">{!mensaje.eliminado&&mensaje.fechaFijado&&<span className="message-pinned">Fijado</span>}{!mensaje.eliminado&&!mensaje.adjunto&&mensaje.fechaEdicion&&<span className="msg-edited">editado</span>}<time dateTime={mensaje.fechaCreacion} title={cuando}>{hora(mensaje.fechaCreacion)}</time>{own&&mensaje.idConversacion&&!mensaje.eliminado&&<span className={mensaje.fechaLectura?'receipt-read':'receipt'} aria-label={mensaje.fechaLectura?'Leído':mensaje.fechaEntrega?'Entregado':'Enviado'} title={mensaje.fechaLectura?'Leído':mensaje.fechaEntrega?'Entregado':'Enviado'}>{mensaje.fechaLectura||mensaje.fechaEntrega?'✓✓':'✓'}</span>}</span></footer>
      </article>
      </div>
    </li>
  );
}

// Cada mensaje solo se vuelve a dibujar si cambió él, su autor o la conexión; escribir en el campo no lo toca.
export default memo(ChatMessage);
