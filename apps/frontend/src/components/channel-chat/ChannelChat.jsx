import MentionPicker from '../chat/MentionPicker.jsx';
import SharedFiles from '../chat/SharedFiles.jsx';
import { useTyping } from '../../hooks/useTyping.js';
import { useMessageSearch } from '../../hooks/useMessageSearch.js';
import SearchResults from '../chat/SearchResults.jsx';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useChannelMessages } from '../../hooks/useChannelMessages.js';
import { EVENTS } from '../../constants/events.js';
import ChatMessage from '../chat/ChatMessage.jsx';
import LocalMessage from '../chat/LocalMessage.jsx';
import Composer from '../chat/Composer.jsx';
import { filterMessages } from '../chat/ChatSearch.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import { formatDay } from '../../utils/chat.js';
import { COMMUNITY_ROLES } from '../../pages/CommunitiesPage.jsx';
import '../../styles/dm.css';
import './channelChat.css';
import CommunityActionDialog from '../communities/CommunityActionDialog.jsx';

const rank = { PROPIETARIO: 4, ADMIN: 3, MODERADOR: 2, INTEGRANTE: 1 };

export default function ChannelChat({ canal, draft, setDraft, buscar = '' }) {
  const { usuario, refresh } = useAuth();
  const typing = useTyping('canal', canal.id);
  useEffect(() => { if (!draft.trim()) typing.typing(''); }, [draft]);
  const search = useMessageSearch('channels', canal.id, buscar);
  const history = useChannelMessages(canal.id, canal.idComunidad);
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null), [showMembers, setShowMembers] = useState(false), [local, setLocal] = useState([]);
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
  async function action(event, payload) {
    try { return await history.action(event, payload); }
    catch (e) { if (e.code === 'UNAUTHORIZED') refresh(); throw e; }
  }
  async function deliver(text, tempId) {
    setLocal((l) => [...l.filter((x) => x.tempId !== tempId), { tempId, contenido: text, st: 'rev', fecha: new Date() }]);
    try {
      await action(EVENTS.CHANNEL_MESSAGE_SEND, { idCanal: canal.id, contenido: text });
      setLocal((l) => l.filter((x) => x.tempId !== tempId));
      stick.current = true;
    } catch (e) {
      if (e.code === 'MESSAGE_BLOCKED') {
        setLocal((l) => l.map((x) => x.tempId === tempId ? { ...x, st: 'blk', regla: e.message.replace(/^Bloqueado: contiene /, '') } : x));
      } else {
        setLocal((l) => l.filter((x) => x.tempId !== tempId));
        setDraft((old) => old || text);
        setError(e.message);
      }
    }
  }
  async function send(event) {
    event?.preventDefault();
    if (pending.current || !write || !history.connected || !draft.trim()) return;
    const text = draft;
    pending.current = true; setSending(true); setError('');
    setDraft((old) => old === text ? '' : old);
    try { await deliver(text, Date.now()); }
    finally { pending.current = false; setSending(false); }
  }
  if (history.lost) return <div className="cs-error" role="alert"><h3 className="cs-title">Canal no disponible</h3><p className="cs-text">{history.error}</p></div>;
  const mensajes = filterMessages(history.messages, buscar);
  let lastDay = '';
  let lastAuthor = null;
  return <section className="dm cc" aria-label={`Chat de ${canal.nombre}`} onKeyDown={(event) => {
    if (event.key === 'Escape' && showMembers) { setShowMembers(false); membersTrigger.current?.focus(); }
  }}>
    <SharedFiles tipo="canal" id={canal.id} canWrite={write} onSent={history.reload} />
    <div className="cc-tools">
      {current?.moderacionActiva && <span className="lbl">Moderado con IA</span>}
      <Button ref={membersTrigger} size="sm" variant="secundario" aria-expanded={showMembers} aria-controls="chat-integrantes" onClick={() => setShowMembers((v) => !v)}>
        <Icon name="amigos" size={15} stroke={2} />Integrantes
      </Button>
    </div>
    {showMembers && <div id="chat-integrantes" className="lg cc-members">
      <span className="lbl">Integrantes de la comunidad</span>
      {history.memberError ? <Notice tone="error" title={history.memberError} /> : <ul className="cc-mem-list">{history.members.map(({ usuario: person, rol }) => <li key={person.id} className="cc-mem">
        <Avatar nombre={person.nombreVisible} foto={person.fotoUrl} color={person.colorAvatar} size={32} />
        <span className="cc-mem-text"><b>{person.nombreVisible}</b><span>@{person.nombreUsuario} · {COMMUNITY_ROLES[rol]}</span></span>
      </li>)}</ul>}
    </div>}
    <div className="dm-body">
      <div className="dm-scroll" ref={viewport} onScroll={(e) => { const n = e.currentTarget; stick.current = n.scrollHeight - n.scrollTop - n.clientHeight < 90; }}>
        <SearchResults search={search} />
        <ol className="dm-list" aria-label="Historial del canal">
          {history.cursor && <li className="dm-older"><Button size="sm" variant="secundario" loading={history.loadingOlder} disabled={history.loading} onClick={() => {
            const n = viewport.current; anchor.current = { top: n.scrollTop, height: n.scrollHeight }; history.older();
          }}>{history.loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}</Button></li>}
          {history.loading && <li className="dm-opening" role="status"><Spinner size={17} />Cargando mensajes…</li>}
          {history.ready && !history.messages.length && <li className="dm-empty"><EmptyState icon="canalTexto" title="Sin mensajes todavía">Este es el inicio del canal {canal.nombre}.</EmptyState></li>}
          {mensajes.map((m) => {
            const day = formatDay(m.fechaCreacion);
            const divider = day !== lastDay;
            const first = divider || m.autor.id !== lastAuthor;
            lastDay = day; lastAuthor = m.autor.id;
            const own = m.autor.id === usuario.id;
            return <Fragment key={m.id}>
              {divider && <li className="day-sep">{day}</li>}
              <ChatMessage mensaje={m} autor={author(m)} own={own} first={first} connected={history.connected}
                onEdit={write && own ? (idMensaje, contenido) => action(EVENTS.CHANNEL_MESSAGE_EDIT, { idMensaje, contenido }) : undefined}
                onDelete={mayDelete(m) ? (idMensaje, button) => { trigger.current = button; setDeleting(idMensaje); } : undefined} />
            </Fragment>;
          })}
          {local.map((m) => <LocalMessage key={m.tempId} mensaje={m} onResend={(item, text) => deliver(text, item.tempId)} onDiscard={(item) => setLocal((l) => l.filter((x) => x.tempId !== item.tempId))} />)}
        </ol>
      </div>
      <span className="dm-fade-top" />
      <span className="dm-fade-bottom" />
      <div className="dm-notices">
        {!history.connected && !history.loading && <Notice tone="conflicto" title="Sin conexión">Volvemos a conectar solos.</Notice>}
        {history.error && <Notice tone="error" title={history.error} actionLabel="Reintentar mensajes" onAction={history.reload} />}
        {history.memberError && !showMembers && <Notice tone="conflicto" title={history.memberError} />}
        {error && <Notice tone="error" title={error} />}
      </div>
      <div className="chat-compose-area">
      <MentionPicker inputId="channel-message" value={draft} onChange={setDraft} members={history.members} />
        {typing.names && <p className="chat-typing" role="status" aria-live="polite">{typing.names} está escribiendo…</p>}
        <Composer id="channel-message" label={`Mensaje en ${canal.nombre}`} sendLabel="Enviar mensaje al canal"
        placeholder={history.ready && !write ? 'Este canal es de solo lectura' : `Escribí en ${canal.nombre}`}
        value={draft} onChange={(value) => { setDraft(value); typing.typing(value); }} onSend={send} disabled={history.ready && !write}
        canSend={!sending && write && history.connected && Boolean(draft.trim())} />
      </div>
    </div>
    {deleting !== null && history.ready && <CommunityActionDialog title="¿Eliminar este mensaje?" description="El contenido se ocultará para todos los integrantes. Esta acción no se puede deshacer."
      confirmLabel="Eliminar mensaje" returnFocusRef={trigger} onClose={() => setDeleting(null)} onConfirm={async () => {
        const message = history.messages.find((m) => m.id === deleting);
        if (!message || !mayDelete(message)) throw new Error('Los permisos o el mensaje cambiaron. Actualizá el historial.');
        await action(EVENTS.CHANNEL_MESSAGE_DELETE, { idMensaje: deleting });
      }} />}
  </section>;
}
