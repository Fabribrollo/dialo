import { SkeletonMessages } from '../ui/Skeleton.jsx';
import {MessageInteractionContext,useMessageInteractions,PinnedMessages} from '../chat/MessageInteractions.jsx';
import {groupAttachmentMessages} from '../../utils/attachmentAlbums.js';
import AttachmentAlbum from '../../components/chat/AttachmentAlbum.jsx';
import {MediaGalleryProvider} from '../../components/chat/MediaGallery.jsx';
import {useChatReading} from '../../hooks/useChatReading.js';
import LatestMessages from '../../components/chat/LatestMessages.jsx';
import {useReadChat} from '../../context/ChatStateContext.jsx';
import MentionPicker from '../chat/MentionPicker.jsx';
import SharedFiles from '../chat/SharedFiles.jsx';
import { useTyping } from '../../hooks/useTyping.js';
import { useMessageSearch } from '../../hooks/useMessageSearch.js';
import SearchResults from '../chat/SearchResults.jsx';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useChannelMessages } from '../../hooks/useChannelMessages.js';
import { useAutoOlder } from '../../hooks/useAutoOlder.js';
import { EVENTS } from '../../constants/events.js';
import ChatMessage from '../chat/ChatMessage.jsx';
import LocalMessage from '../chat/LocalMessage.jsx';
import Composer from '../chat/Composer.jsx';
import { filterMessages } from '../chat/ChatSearch.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Notice from '../ui/Notice.jsx';
import { distanciaAlFinal, fijarDistanciaAlFinal, formatDay } from '../../utils/chat.js';
import '../../styles/dm.css';
import './channelChat.css';
import CommunityActionDialog from '../communities/CommunityActionDialog.jsx';


export default function ChannelChat({ canal, draft, setDraft, buscar = '',setBuscar }) {
  const { usuario, refresh } = useAuth();
  const typing = useTyping('canal', canal.id);
  useEffect(() => { if (!draft.trim()) typing.typing(''); }, [draft]);
  const search = useMessageSearch('channels', canal.id, buscar);
  const history = useChannelMessages(canal.id, canal.idComunidad);

  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const [deleting, setDeleting] = useState(null), [local, setLocal] = useState([]);
  const pending = useRef(false), trigger = useRef(null), viewport = useRef(null), anchor = useRef(null), stick = useRef(true);
  const sendReceipt=useRef(null);
  const reading=useChatReading(history.messages,viewport,stick,usuario.id);
  useReadChat('canal',canal.id,history.messages?.at(-1)?.id,!reading.away&&history.ready&&!buscar.trim());
  const current = history.canal;
  const write = Boolean(current?.misPermisos.includes('ESCRIBIR'));
  // Integrantes por id: buscar autor y rol es directo en vez de recorrer la lista por cada mensaje.
  const byId = useMemo(() => new Map(history.members.map((m) => [m.usuario.id, m])), [history.members]);
  const ownMember = byId.get(usuario.id);
  const author = useCallback((m) => m.autor.id === usuario.id ? usuario : byId.get(m.autor.id)?.usuario ?? m.autor, [usuario, byId]);
  const mayDelete = useCallback((m) => {
    if (!history.ready || m.eliminado) return false;
    if (m.autor.id === usuario.id) return write;
    const theirs = byId.get(m.autor.id)?.rol;
    return history.membersReady && (['ADMIN','PROPIETARIO'].includes(ownMember?.rol)||current?.misPermisos.includes('ELIMINAR_MENSAJES')) && theirs!=='PROPIETARIO' && (theirs!=='ADMIN'||ownMember?.rol==='PROPIETARIO');
  }, [history.ready, history.membersReady, usuario.id, write, byId, ownMember, current]);
  useEffect(() => {
    if (!history.ready || (deleting !== null && !history.messages.some((m) => m.id === deleting && !m.eliminado))) setDeleting(null);
  }, [history.ready, history.messages, deleting]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node || history.loadingOlder) return;
    if (anchor.current) { fijarDistanciaAlFinal(node, anchor.current.distancia); anchor.current = null; }
    else if (stick.current) fijarDistanciaAlFinal(node, 0);
  }, [history.messages, history.loadingOlder]);
  async function action(event, payload) {
    try { return await history.action(event, payload); }
    catch (e) { if (e.code === 'UNAUTHORIZED') refresh(); throw e; }
  }
  const cargarAnteriores = () => {
    const n = viewport.current;
    if (!n || history.loadingOlder || history.loading) return;
    anchor.current = { distancia: distanciaAlFinal(n) };
    history.older();
  };
  const olderRef = useAutoOlder(viewport, Boolean(history.cursor) && history.ready && !history.loadingOlder, cargarAnteriores);
  const actionRef = useRef(action);
  actionRef.current = action;
  const editar = useCallback((idMensaje, contenido) => actionRef.current(EVENTS.CHANNEL_MESSAGE_EDIT, { idMensaje, contenido }), []);
  const borrar = useCallback((idMensaje, button) => { trigger.current = button; setDeleting(idMensaje); }, []);
  const interactions=useMessageInteractions({id:canal.id,event:EVENTS.CHANNEL_MESSAGE_INTERACT,action,messages:history.messages,usuario,connected:history.connected,canWrite:write,canPin:current?.misPermisos.includes('GESTIONAR_CANALES'),onDelete:borrar,canDelete:mayDelete,inputId:'channel-message',loadOlder:history.older,hasOlder:Boolean(history.cursor),acceptMessages:history.acceptMessages,loadingOlder:history.loadingOlder,onLocate:()=>{stick.current=false;setBuscar?.('');}});
  const mensajes = useMemo(() => history.messages, [history.messages, buscar]);
  const filas = useMemo(() => {
    let lastDay = '';
    let lastAuthor = null;
    return groupAttachmentMessages(mensajes).map((m) => {
      const day = formatDay(m.fechaCreacion);
      const divider = day !== lastDay;
      const first = divider || m.autor.id !== lastAuthor;
      lastDay = day; lastAuthor = m.autor.id;
      const own = m.autor.id === usuario.id;
      return <Fragment key={m.id}>
        {divider && <li className="day-sep">{day}</li>}{(m.id===reading.firstUnread||m.album?.some(item=>item.id===reading.firstUnread))&&<li className="unread-separator">Mensajes nuevos</li>}
        <>{m.album?<AttachmentAlbum messages={m.album} own={own} first={first} autor={author(m)}/>:<ChatMessage mensaje={m} autor={author(m)} own={own} first={first} connected={history.connected}
          onEdit={write && own ? editar : undefined} onDelete={mayDelete(m) ? borrar : undefined} />}</>
      </Fragment>;
    });
  }, [mensajes, usuario.id, history.connected, write, author, mayDelete, editar, borrar,reading.firstUnread]);
  async function deliver(text, tempId, replyId=interactions.reply?.id) {
    setLocal((l) => [...l.filter((x) => x.tempId !== tempId), { tempId, contenido: text, idRespuesta:replyId, st: 'rev', fecha: new Date() }]);
    try {
      await action(EVENTS.CHANNEL_MESSAGE_SEND, { idCanal: canal.id, contenido: text, ...(replyId&&{idRespuesta:replyId}), idEnvio:(sendReceipt.current?.text===JSON.stringify([text.trim(),replyId])?sendReceipt.current:(sendReceipt.current={text:JSON.stringify([text.trim(),replyId]),key:crypto.randomUUID()})).key });
      setLocal((l) => l.filter((x) => x.tempId !== tempId));
      interactions.setReply(current=>current?.id===replyId?null:current);sendReceipt.current=null;reading.toLatest();
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
  return <MessageInteractionContext.Provider value={interactions}><section className="dm cc" aria-label={`Chat de ${canal.nombre}`}>
    <PinnedMessages/><div className="dm-body">
      <div className="dm-scroll" ref={viewport} onScroll={reading.onScroll}>
        <SearchResults value={buscar} onChange={setBuscar} search={search} />
        <MediaGalleryProvider messages={history.messages} onDelete={borrar} canDelete={mayDelete} connected={history.connected}><ol className="dm-list" aria-label="Historial del canal">
          {history.cursor && <li className="dm-older" ref={olderRef}><Button size="sm" variant="secundario" loading={history.loadingOlder} disabled={history.loading} onClick={cargarAnteriores}>{history.loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}</Button></li>}
          {history.loading && !history.messages.length && <li className="dm-skeleton"><SkeletonMessages /></li>}
          {history.ready && !history.messages.length && <li className="dm-empty"><EmptyState icon="canalTexto" title="Sin mensajes todavía">Este es el inicio del canal {canal.nombre}.</EmptyState></li>}
          {filas}
          {local.map((m) => <LocalMessage key={m.tempId} mensaje={m} onResend={(item, text) => deliver(text, item.tempId,item.idRespuesta)} onDiscard={(item) => setLocal((l) => l.filter((x) => x.tempId !== item.tempId))} />)}
        </ol></MediaGalleryProvider>
      </div>
      <span className="dm-fade-top" />
      <span className="dm-fade-bottom" />
      <div className="dm-notices">
        {!history.connected && !history.loading && <Notice tone="conflicto" title="Sin conexión">Volvemos a conectar solos.</Notice>}
        {history.error && <Notice tone="error" title={history.error} actionLabel="Reintentar mensajes" onAction={history.reload} />}
        {history.memberError && <Notice tone="conflicto" title={history.memberError} />}
        {error && <Notice tone="error" title={error} />}
      </div>
      <LatestMessages reading={reading}/><div className="chat-compose-area">
      <MentionPicker everyone={current?.misPermisos.includes('GESTIONAR_CANALES')} inputId="channel-message" value={draft} onChange={setDraft} members={history.members} />
        {typing.names && <p className="chat-typing" role="status" aria-live="polite">{typing.names} está escribiendo…</p>}
        <Composer sending={sending} attachment={{tipo:"canal",id:canal.id,onSent:history.acceptMessages}} id="channel-message" label={`Mensaje en ${canal.nombre}`} sendLabel="Enviar mensaje al canal"
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
  </section></MessageInteractionContext.Provider>;
}
