import {DefaultProfile,openProfile} from '../components/shell/ProfileExplorer.jsx';
import {MessageInteractionContext,useMessageInteractions,PinnedMessages} from '../components/chat/MessageInteractions.jsx';
import {groupAttachmentMessages} from '../utils/attachmentAlbums.js';
import AttachmentAlbum from '../components/chat/AttachmentAlbum.jsx';
import {MediaGalleryProvider} from '../components/chat/MediaGallery.jsx';
import {useChatReading} from '../hooks/useChatReading.js';
import LatestMessages from '../components/chat/LatestMessages.jsx';
import {useDraftMap} from '../context/DraftsContext.jsx';
import {useReadChat} from '../context/ChatStateContext.jsx';
import PrivateCallScene from '../components/calls/PrivateCallScene.jsx';
import MentionPicker from '../components/chat/MentionPicker.jsx';
import { usePrivateCall } from '../context/PrivateCallContext.jsx';
import SharedFiles from '../components/chat/SharedFiles.jsx';
import { useTyping } from '../hooks/useTyping.js';
import { useMessageSearch } from '../hooks/useMessageSearch.js';
import SearchResults from '../components/chat/SearchResults.jsx';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { useMessages } from '../hooks/useMessages.js';
import { useAutoOlder } from '../hooks/useAutoOlder.js';
import { useConversations } from '../context/ConversationsContext.jsx';
import { getConversation } from '../services/conversationsService.js';
import { distanciaAlFinal, fijarDistanciaAlFinal, formatDay } from '../utils/chat.js';
import { EVENTS } from '../constants/events.js';
import Avatar from '../components/ui/Avatar.jsx';
import Button from '../components/ui/Button.jsx';
import Icon, { Spinner } from '../components/ui/Icon.jsx';
import Notice from '../components/ui/Notice.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { ConfirmDialog } from '../components/ui/Dialog.jsx';
import RightPanel from '../components/shell/RightPanel.jsx';
import ChatMessage from '../components/chat/ChatMessage.jsx';
import Composer from '../components/chat/Composer.jsx';
import ChatSearch, { filterMessages } from '../components/chat/ChatSearch.jsx';
import '../styles/dm.css';

const presencia = { EN_LINEA: 'En línea', AUSENTE: 'Ausente', NO_MOLESTAR: 'No molestar', INVISIBLE: 'Ausente' };

function sendError(e) {
  if (e.code === 'ACK_TIMEOUT') return { tone: 'error', title: 'No pudimos confirmar la operación', text: 'Revisá el historial antes de reintentar.' };
  if (e.code === 'RATE_LIMITED') return { tone: 'espera', title: 'Estás enviando muy rápido', text: e.message };
  return { tone: 'error', title: 'No se pudo enviar', text: 'Tu texto sigue acá. Probá de nuevo.', retry: true };
}

function Chat({ id, draft, setDraft }) {
  const privateCall = usePrivateCall();
  const fullCall=privateCall?.active&&privateCall.call?.idConversacion===id&&!privateCall.chatVisible&&!(privateCall.incoming&&privateCall.call.estado==='LLAMANDO');
  const { usuario, refresh } = useAuth();
  const typing = useTyping('conversacion', id);
  useEffect(() => { if (!draft.trim()) typing.typing(''); }, [draft]);
  const { items, remember, reload: reloadList, connected, getRevision } = useConversations();
  const navigate = useNavigate();
  const chat = items.find((c) => c.id === id);
  const history = useMessages(id);

  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const pendingSend=useRef(false),sendReceipt=useRef(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteState, setDeleteState] = useState({ busy: false, error: '' });
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [buscar, setBuscar] = useState('');
  const search = useMessageSearch('conversations', id, buscar);
  const viewport = useRef(null);
  const anchor = useRef(null);
  const stick = useRef(true);
  const reading=useChatReading(history.messages,viewport,stick,usuario.id);
  useReadChat('conversacion',id,history.messages?.at(-1)?.id,!fullCall&&!reading.away&&!history.loading&&!buscar.trim());

  useEffect(() => {
    let active = true;
    setMissing(false);
    const version = getRevision();
    getConversation(id)
      .then(({ conversacion }) => { if (active) remember(conversacion, version); })
      .catch(() => { if (active) setMissing(true); });
    return () => { active = false; };
  }, [id, remember, retry, getRevision]);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (anchor.current) {
      fijarDistanciaAlFinal(node, anchor.current.distancia);
      anchor.current = null;
    } else if (stick.current) fijarDistanciaAlFinal(node, 0);
  }, [history.messages]);

  async function action(event, payload) {
    try {
      // La lista de conversaciones se actualiza sola con el evento del socket; no hace falta pedirla de nuevo.
      return await history.action(event, payload);
    } catch (e) {
      if (e.code === 'UNAUTHORIZED') refresh();
      if (e.code === 'NOT_FRIENDS') reloadList();
      throw e;
    }
  }

  const cargarAnteriores = async () => {
    const n = viewport.current;
    if (!n || history.loading) return;
    anchor.current = { distancia: distanciaAlFinal(n) };
    await history.older();
  };
  const olderRef = useAutoOlder(viewport, Boolean(history.cursor) && !history.loading && history.messages.length > 0, cargarAnteriores);
  const actionRef = useRef(action);
  actionRef.current = action;
  const editar = useCallback((idMensaje, contenido) => actionRef.current(EVENTS.MESSAGE_EDIT, { idMensaje, contenido }), []);
  const interactions=useMessageInteractions({id,event:EVENTS.MESSAGE_INTERACT,action,messages:history.messages,usuario,connected,canWrite:chat?.puedeEscribir,canPin:chat?.puedeEscribir,onDelete:setDeleting,canDelete:m=>m.idAutor===usuario.id&&!m.registroLlamada,inputId:'private-message',otherName:chat?.otroUsuario?.nombreVisible,loadOlder:history.older,hasOlder:Boolean(history.cursor),acceptMessages:history.acceptMessages,loadingOlder:history.loading,onLocate:()=>{stick.current=false;setBuscar('');}});
  const mensajes = useMemo(() => history.messages, [history.messages, buscar]);
  const filas = useMemo(() => {
    let lastDay = '';
    let lastAuthor = null;
    return groupAttachmentMessages(mensajes).map((m) => {
      const day = formatDay(m.fechaCreacion);
      const divider = day !== lastDay;
      const first = divider || m.idAutor !== lastAuthor;
      lastDay = day;
      lastAuthor = m.idAutor;
      const own = m.idAutor === usuario.id;
      return (
        <Fragment key={m.id}>
          {divider && <li className="day-sep">{day}</li>}{(m.id===reading.firstUnread||m.album?.some(item=>item.id===reading.firstUnread))&&<li className="unread-separator">Mensajes nuevos</li>}
          <>{m.album?<AttachmentAlbum messages={m.album} own={own} first={first}/>:<ChatMessage mensaje={m} own={own} first={first} connected={connected}
            onEdit={own ? editar : undefined} onDelete={own ? setDeleting : undefined} />}</>
        </Fragment>
      );
    });
  }, [mensajes, usuario.id, connected, editar,reading.firstUnread]);

  async function send() {
    if (!draft.trim() || pendingSend.current || sending || !chat?.puedeEscribir || !connected) return;
    const content = draft,replyId=interactions.reply?.id;
    pendingSend.current=true;setSending(true);
    if(sendReceipt.current?.text!==JSON.stringify([content.trim(),replyId]))sendReceipt.current={text:JSON.stringify([content.trim(),replyId]),key:crypto.randomUUID()};
    setError(null);
    try {
      await action(EVENTS.MESSAGE_SEND, { idConversacion: id, contenido: content, ...(replyId&&{idRespuesta:replyId}), idEnvio:sendReceipt.current.key });
      setDraft((current) => (current === content ? '' : current));
      interactions.setReply(current=>current?.id===replyId?null:current);sendReceipt.current=null;reading.toLatest();
    } catch (e) {
      setError(sendError(e));
    } finally {
      pendingSend.current=false;setSending(false);
    }
  }

  async function confirmDelete() {
    setDeleteState({ busy: true, error: '' });
    try {
      await action(EVENTS.MESSAGE_DELETE, { idMensaje: deleting });
      setDeleting(null);
      setDeleteState({ busy: false, error: '' });
    } catch {
      setDeleteState({ busy: false, error: 'No se pudo eliminar. Probá de nuevo.' });
    }
  }

  if (missing) {
    return (
      <div className="dm-center">
        <EmptyState icon="mensajes" title="No pudimos abrir el chat" actionLabel="Reintentar" onAction={() => setRetry((n) => n + 1)}>
          La conversación no existe o ya no tenés acceso.
        </EmptyState>
        <button type="button" className="lnk lnk-secundario" onClick={() => navigate('/')}>Volver a conversaciones</button>
      </div>
    );
  }
  if (!chat) {
    return <div className="dm-center"><span className="dm-opening" role="status"><Spinner size={17} />Abriendo conversación…</span></div>;
  }

  const otro = chat.otroUsuario;
  const nombre = otro.nombreVisible;

  return (
    <MessageInteractionContext.Provider value={interactions}><section className="dm" aria-label={`Chat con ${nombre}`}>
      <header className="dm-head">
        <Link to="/" className="lg pr dm-back" aria-label="Volver"><span><Icon name="chevron" size={18} stroke={2} /></span></Link>
        <Avatar nombre={nombre} foto={otro.fotoUrl} color={otro.colorAvatar} size={56} presence={otro.disponibilidad === 'EN_LINEA' && otro.enLinea === false ? 'DESCONECTADO' : otro.disponibilidad} className="dm-av" />
        <span className="dm-who">
          <h1 className="dsp"><button className="profile-name" type="button" onClick={()=>openProfile(otro.id)}>{nombre}</button></h1>
          <span>{otro.disponibilidad === 'EN_LINEA' && otro.enLinea === false ? 'Desconectado' : presencia[otro.disponibilidad] ?? ''}</span>
        </span>
        <span className="dm-head-tools">
          {privateCall && chat.puedeEscribir && <>
            <button type="button" className="lg pr dm-call" disabled={privateCall.busy || privateCall.active} onClick={() => privateCall.start(id, false)} aria-label={`Llamar a ${nombre}`}><Icon name="telefono" size={18} stroke={2} /></button>
            <button type="button" className="lg pr dm-call" disabled={privateCall.busy || privateCall.active} onClick={() => privateCall.start(id, true)} aria-label={`Videollamar a ${nombre}`}><Icon name="camara" size={18} stroke={2} /></button>
          </>}
          {!fullCall&&<ChatSearch value={buscar} onChange={setBuscar} />}</span>
      </header>
      {!fullCall&&<PinnedMessages/>}<PrivateCallScene idConversacion={id}/>
      <div className="dm-body" hidden={fullCall} style={{display:fullCall?'none':undefined}}>
        <div className="dm-scroll" ref={viewport} onScroll={reading.onScroll}>
          <SearchResults value={buscar} onChange={setBuscar} search={search} author={(m) => m.idAutor === usuario.id ? usuario.nombreVisible : chat?.otroUsuario?.nombreVisible} />
        <MediaGalleryProvider messages={history.messages} onDelete={id=>setDeleting(id)} canDelete={m=>m.idAutor===usuario.id&&!m.registroLlamada} connected={connected}><ol className="dm-list" aria-label="Historial de mensajes">
            {history.cursor && (
              <li className="dm-older" ref={olderRef}>
                <Button variant="secundario" size="sm" loading={history.loading} onClick={cargarAnteriores}>{history.loading ? 'Cargando…' : 'Cargar anteriores'}</Button>
              </li>
            )}
            {history.loading && !history.messages.length && <li className="dm-opening" role="status"><Spinner size={17} />Cargando…</li>}
            {!history.loading && !history.error && !history.messages.length && (
              <li className="dm-empty">
                <EmptyState icon="mensajes" title="Sin mensajes">Todavía no hay mensajes con {nombre.split(' ')[0]}. Escribile algo.</EmptyState>
              </li>
            )}
            {filas}
          </ol></MediaGalleryProvider>
        </div>
        <span className="dm-fade-top" />
        <span className="dm-fade-bottom" />

        <div className="dm-notices">
          {!connected && <Notice tone="conflicto" title="Sin conexión en tiempo real">Tu texto se conserva. Volvemos a conectar solos.</Notice>}
          {!chat.puedeEscribir && <Notice tone="conflicto" title="Ya no son amigos">Podés leer la conversación, pero no mandar mensajes nuevos.</Notice>}
          {history.error && <Notice tone="error" title="No se pudieron cargar los mensajes" actionLabel="Reintentar" onAction={history.reload}>{history.error}</Notice>}
          {error && <Notice tone={error.tone} title={error.title} actionLabel={error.retry ? 'Reintentar' : undefined} onAction={send}>{error.text}</Notice>}
        </div>

        <LatestMessages reading={reading}/><div className="chat-compose-area">
        <MentionPicker inputId="private-message" value={draft} onChange={setDraft} members={chat.otroUsuario ? [{usuario:chat.otroUsuario}] : []} />
        {typing.names && <p className="chat-typing" role="status" aria-live="polite">{typing.names} está escribiendo…</p>}
        <Composer sending={sending} attachment={{tipo:"conversacion",id,onSent:history.acceptMessages}} id="private-message"
          label={`Mensaje para ${nombre}`}
          placeholder={chat.puedeEscribir ? `Escribile a ${nombre.split(' ')[0]}` : 'No podés escribir en este chat'}
          value={draft}
          onChange={(value) => { setDraft(value); typing.typing(value); }}
          onSend={send}
          disabled={!chat.puedeEscribir||fullCall}
          canSend={!sending && connected && chat.puedeEscribir && Boolean(draft.trim())}
        />
        </div>
      </div>

      <DefaultProfile user={otro}/>

      <ConfirmDialog
        open={deleting !== null}
        title="¿Eliminar este mensaje?"
        confirmLabel={deleteState.busy ? 'Eliminando…' : 'Eliminar mensaje'}
        loading={deleteState.busy}
        error={deleteState.error}
        onCancel={() => { setDeleting(null); setDeleteState({ busy: false, error: '' }); }}
        onConfirm={confirmDelete}
      >
        El contenido se ocultará para los dos. No se puede deshacer.
      </ConfirmDialog>
    </section></MessageInteractionContext.Provider>
  );
}

export default function ConversationsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const selected = id ? Number(id) : null;
  const [drafts, setDrafts] = useDraftMap('conversacion');
  const valid = selected && Number.isInteger(selected) && selected > 0 && selected <= 2147483647;

  if (!valid) {
    return (
      <div className="dm-center">
        {id ? (
          <EmptyState icon="mensajes" title="No pudimos abrir el chat" actionLabel="Volver a conversaciones" onAction={() => navigate('/')}>
            La conversación no existe o ya no tenés acceso.
          </EmptyState>
        ) : (
          <EmptyState icon="mensajes" title="Elegí una conversación" actionLabel="Ver amigos" onAction={() => navigate('/amigos')}>
            Abrí un chat desde la lista o desde Amigos.
          </EmptyState>
        )}
      </div>
    );
  }

  return (
    <Chat
      key={selected}
      id={selected}
      draft={drafts[selected] || ''}
      setDraft={(value) => setDrafts((old) => ({ ...old, [selected]: typeof value === 'function' ? value(old[selected] || '') : value }))}
    />
  );
}
