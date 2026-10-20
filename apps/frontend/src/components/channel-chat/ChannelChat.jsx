import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useChannelMessages } from '../../hooks/useChannelMessages.js';
import { EVENTS } from '../../constants/events.js';
import Message from '../chat/Message.jsx';
import CommunityActionDialog from '../communities/CommunityActionDialog.jsx';

const rank = { PROPIETARIO: 4, ADMIN: 3, MODERADOR: 2, INTEGRANTE: 1 };

export default function ChannelChat({ canal, draft, setDraft }) {
  const { usuario, refresh } = useAuth();
  const history = useChannelMessages(canal.id, canal.idComunidad);
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null), [showMembers, setShowMembers] = useState(false);
  const pending = useRef(false), trigger = useRef(null), viewport = useRef(null), anchor = useRef(null), stick = useRef(true);
  const editor = useRef(null), membersTrigger = useRef(null);
  const current = history.canal;
  const write = Boolean(current?.misPermisos.includes('ESCRIBIR'));
  const ownMember = history.members.find((m) => m.usuario.id === usuario.id);
  const author = (m) => m.autor.id === usuario.id ? usuario : history.members.find((member) => member.usuario.id === m.autor.id)?.usuario ?? m.autor;
  const mayDelete = (m) => {
    if (!history.ready || m.eliminado) return false;
    if (m.autor.id === usuario.id) return write;
    const theirs = history.members.find((member) => member.usuario.id === m.autor.id)?.rol;
    return history.membersReady && (rank[ownMember?.rol] ?? 0) >= 2 && rank[ownMember.rol] > (rank[theirs] ?? 0);
  };
  useEffect(() => {
    if (!history.ready || (deleting !== null && !history.messages.some((m) => m.id === deleting && !m.eliminado))) setDeleting(null);
  }, [history.ready, history.messages, deleting]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || history.loadingOlder) return;
    if (anchor.current) { node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height; anchor.current = null; }
    else if (stick.current) node.scrollTop = node.scrollHeight;
  }, [history.messages, history.loadingOlder]);
  useLayoutEffect(() => {
    if (editor.current) { editor.current.style.height = 'auto'; editor.current.style.height = `${Math.min(editor.current.scrollHeight, 240)}px`; }
  }, [draft]);
  async function action(event, payload) {
    try { return await history.action(event, payload); }
    catch (e) { if (e.code === 'UNAUTHORIZED') refresh(); throw e; }
  }
  async function send(event) {
    event?.preventDefault();
    if (pending.current || !write || !history.connected || !draft.trim()) return;
    const text = draft;
    pending.current = true; setSending(true); setError('');
    try {
      await action(EVENTS.CHANNEL_MESSAGE_SEND, { idCanal: canal.id, contenido: text });
      setDraft((old) => old === text ? '' : old); stick.current = true;
    } catch (e) { setError(e.message); }
    finally { pending.current = false; setSending(false); }
  }
  if (history.lost) return <div className="community-empty" role="alert"><h3>Canal no disponible</h3><p>{history.error}</p></div>;
  let lastDay = '';
  return <section className="channel-chat chat-pane" aria-label={`Chat de ${canal.nombre}`} onKeyDown={(event) => {
    if (event.key === 'Escape' && showMembers) { setShowMembers(false); membersTrigger.current?.focus(); }
  }}>
    <div className="channel-chat-tools">
      <p>{history.loading ? 'Actualizando historial y permisos…' : history.connected ? 'Mensajes en tiempo real' : 'Tiempo real desconectado'}</p>
      <div className="community-actions"><button type="button" className="secondary" onClick={history.reload} disabled={history.loading}>Actualizar mensajes</button>
        <button ref={membersTrigger} type="button" className="secondary" aria-expanded={showMembers} aria-controls="chat-integrantes" onClick={() => setShowMembers((v) => !v)}>Integrantes</button></div>
    {showMembers && <div id="chat-integrantes" className="channel-members"><h3>Integrantes de la comunidad</h3>
      {history.memberError ? <p role="alert">{history.memberError}</p> : <ul>{history.members.map(({ usuario: person, rol }) => <li key={person.id}><strong>{person.nombreVisible}</strong> <span>@{person.nombreUsuario} · {rol.toLocaleLowerCase('es')}</span></li>)}</ul>}
    </div>}
    </div>
    {history.error && <p role="alert" className="notice error">{history.error} <button className="secondary" onClick={history.reload}>Reintentar mensajes</button></p>}
    {history.memberError && !showMembers && <p role="status" className="notice">{history.memberError}</p>}
    <div className="message-scroll" ref={viewport} onScroll={(e) => { const n = e.currentTarget; stick.current = n.scrollHeight - n.scrollTop - n.clientHeight < 90; }}>
      {history.cursor && <button type="button" className="load-older secondary" disabled={history.loadingOlder || history.loading} onClick={() => {
        const n = viewport.current; anchor.current = { top: n.scrollTop, height: n.scrollHeight }; history.older();
      }}>{history.loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}</button>}
      {history.loading && <p role="status" className="center-note">Cargando mensajes…</p>}
      {history.ready && !history.messages.length && <div className="chat-start"><h3>Sin mensajes todavía</h3><p>Este es el inicio del canal {canal.nombre}.</p></div>}
      <ol className="messages" aria-label="Historial del canal">{history.messages.map((m) => {
        const day = new Date(m.fechaCreacion).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
        const divider = day !== lastDay; lastDay = day;
        return <li key={m.id} className="message-group">{divider && <div className="date-divider">{day}</div>}<ol>
          <Message mensaje={m} autor={author(m)} own={m.autor.id === usuario.id} connected={history.connected}
            canEdit={write && m.autor.id === usuario.id} canDelete={mayDelete(m)}
            onEdit={(idMensaje, contenido) => action(EVENTS.CHANNEL_MESSAGE_EDIT, { idMensaje, contenido })}
            onDelete={(idMensaje, button) => { trigger.current = button; setDeleting(idMensaje); }} />
        </ol></li>;
      })}</ol>
    </div>
    <form className="composer" onSubmit={send}>
      <label htmlFor="channel-message">Mensaje en {canal.nombre}</label>
      <div className="composer-field"><textarea ref={editor} id="channel-message" rows={2} maxLength={2000} value={draft}
        onChange={(e) => setDraft(e.target.value)} placeholder={history.ready && !write ? 'Este canal es de solo lectura' : 'Escribí un mensaje…'}
        disabled={history.ready && !write} onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
        }} /><button type="submit" aria-label="Enviar mensaje al canal" disabled={sending || !write || !history.connected || !draft.trim()}>Enviar ↗</button></div>
      <div className="composer-hint"><span>Enter para enviar · Shift + Enter para otra línea</span><span>{draft.length}/2000</span></div>
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
    {deleting !== null && history.ready && <CommunityActionDialog title="¿Eliminar este mensaje?" description="El contenido se ocultará para todos los integrantes. Esta acción no se puede deshacer."
      confirmLabel="Eliminar mensaje" returnFocusRef={trigger} onClose={() => setDeleting(null)} onConfirm={async () => {
        const message = history.messages.find((m) => m.id === deleting);
        if (!message || !mayDelete(message)) throw new Error('Los permisos o el mensaje cambiaron. Actualizá el historial.');
        await action(EVENTS.CHANNEL_MESSAGE_DELETE, { idMensaje: deleting });
      }} />}
  </section>;
}
