import { SkeletonRows } from '../ui/Skeleton.jsx';
import ChatRowMenu from './ChatRowMenu.jsx';
import {useChatStates} from '../../context/ChatStateContext.jsx';
import {usePrivateCall} from '../../context/PrivateCallContext.jsx';
import {leaveCommunity} from '../../services/communitiesService.js';
import CommunityActionDialog from '../communities/CommunityActionDialog.jsx';
import {useCommunityActivity} from '../../hooks/useCommunityActivity.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import { useFriends } from '../../hooks/useFriends.js';
import { useConversations } from '../../context/ConversationsContext.jsx';
import { useCommunities } from '../../context/CommunitiesContext.jsx';
import { formatListTime } from '../../utils/chat.js';
import Avatar from '../ui/Avatar.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Segmented from '../ui/Segmented.jsx';
import Notice from '../ui/Notice.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ConversationRow from './ConversationRow.jsx';
import ActivityCenter from './ActivityCenter.jsx';
import { avisar,cerrarAviso } from './systemToastsStore.js';
import { Logo } from './BootScreen.jsx';
import './sidebar.css';

const filtros = [
  { value: 'todo', label: 'Todo', weight: 3 },
  { value: 'personas', label: 'Personas', weight: 4 },
  { value: 'comunidades', label: 'Comunidades', weight: 5 },
];

function preview(c) {
  if (!c.ultimoMensaje) return '';
  return c.ultimoMensaje.eliminado?'Este mensaje se eliminó':c.ultimoMensaje.adjunto?.tipo?.startsWith('audio/')?'Audio':c.ultimoMensaje.adjunto?'Recurso compartido':c.ultimoMensaje.encuesta?'Encuesta':c.ultimoMensaje.contenido;
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const states=useChatStates(),privateCall=usePrivateCall(),navigate=useNavigate();
  const [archivados,setArchivados]=useState(false),[deleting,setDeleting]=useState(null),[menuKey,setMenuKey]=useState(null);const menuTrigger=useRef(null);
  const { usuario } = useAuth();
  const conversations = useConversations();
  const communities = useCommunities();
  const socket = useSocket();

  const [activitySlot, setActivitySlot] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const previas = useRef(null);
  const enCanal = useRef(pathname);
  enCanal.current = pathname;
  const silenciado = Boolean(usuario?.preferencias?.silenciarNotificaciones);
  const currentSettings=useRef({states,silenciado});currentSettings.current={states,silenciado};
  // Cuando arranca una llamada en una comunidad tuya, invita a sumarse (salvo que ya estés ahí).
  function invitarALlamadas(calls) {
    const antes = previas.current;
    previas.current = { ...(antes ?? {}), ...calls };
    if (!antes || currentSettings.current.silenciado || currentSettings.current.states.loading) return;
    for (const c of communities.items) {
      const ahora = calls[c.id];
      // Solo invita si la llamada empezó desde la consulta anterior, no si ya estaba cuando abriste la app.
      if (currentSettings.current.states.get('comunidad',c.id).archivado||currentSettings.current.states.get('comunidad',c.id).silenciado||!(c.id in antes) || !ahora || ahora.estoy || antes[c.id]) continue;
      const destino = `/comunidades/${c.id}/canales/${ahora.idCanal}`;
      if (enCanal.current === destino) continue;
      avisar({
        id: `llamada-${c.id}`, tipo: 'invitacion', duracion: 0, canal: ahora.canal, comunidad: c.nombre,
        personas: ahora.personas, total: ahora.total, destino,
        siglas: (c.nombre.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('') || c.nombre.slice(0, 2)).toUpperCase(),
      });
    }
  }
  const {activity,activeCalls}=useCommunityActivity(communities.items,socket,invitarALlamadas);
  const { recibidas } = useFriends();
  const [filtro, setFiltro] = useState('todo');
  const [busqueda, setBusqueda] = useState('');
  const coincide = (texto) => texto.toLowerCase().includes(busqueda.trim().toLowerCase());

  const hasArchived=conversations.items.some(c=>{const state=states.get('conversacion',c.id);return state.archivado&&!state.oculto;})||communities.items.some(c=>states.get('comunidad',c.id).archivado);
  useEffect(()=>{if(!hasArchived)setArchivados(false);},[hasArchived]);
  useEffect(()=>setMenuKey(null),[pathname,filtro,busqueda,archivados,activityOpen]);
  const filas = [];
  if (filtro !== 'comunidades'&&!archivados) {
    filas.push({
      key: 'amigos', to: '/amigos', nombre: 'Amigos', fija: 'amigos',
      preview: recibidas.length ? `${recibidas.length} ${recibidas.length === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}` : '',
      badge: recibidas.length,
    });
  }
  if (filtro !== 'comunidades') {
    for (const c of conversations.items) {
      const state=states.get('conversacion',c.id);if(state.oculto||state.archivado!==archivados)continue;
      const u = c.otroUsuario;
      if (!coincide(`${u.nombreVisible} ${u.nombreUsuario}`)) continue;
      filas.push({
        id:c.id,tipo:'conversacion',muted:state.silenciado,stamp:Date.parse(c.ultimoMensaje?.fechaCreacion??c.fechaCreacion??'')||0,archivado:state.archivado,badge:state.noLeidos,callActive:privateCall?.active&&privateCall.call?.idConversacion===c.id,key: `c${c.id}`, to: `/conversaciones/${c.id}`, nombre: u.nombreVisible, foto: u.fotoUrl,
        preview: preview(c), time: c.ultimoMensaje && formatListTime(c.ultimoMensaje.fechaCreacion),
      });
    }
  }
  if (filtro === 'comunidades') {
    filas.push({ key: 'comunidades', to: '/comunidades', nombre: 'Mis comunidades', fija: 'comunidades', exact: true });
  }
  if (filtro !== 'personas') {
    for (const c of communities.items) {
      const state=states.get('comunidad',c.id);if(state.archivado!==archivados)continue;
      if (!coincide(c.nombre)) continue;
      filas.push({ id:c.id,tipo:'comunidad',muted:state.silenciado,stamp:Date.parse(c.ultimoMensaje?.fechaCreacion??c.fechaCreacion??'')||0,archivado:state.archivado,badge:state.noLeidos,callActive:Boolean(activeCalls[c.id]),owner:c.miRol==='PROPIETARIO', key: `m${c.id}`, to: `/comunidades/${c.id}`, nombre: c.nombre, foto: c.imagenUrl, preview: activity[c.id], community: true });
    }
  }
  filas.sort((a,b)=>Number(Boolean(b.fija))-Number(Boolean(a.fija))||(b.stamp??0)-(a.stamp??0));
  async function archive(f){try{await states.change(f.tipo,f.id,{archivado:!f.archivado});if(f.community)cerrarAviso(`llamada-${f.id}`);avisar({texto:f.archivado?'Conversación desarchivada.':'Conversación archivada y silenciada.'});}catch(e){avisar({tipo:'error',texto:e.message});}}
  const activa = filas.findIndex((f) => pathname === f.to || (!f.exact && pathname.startsWith(`${f.to}/`)));

  return (
    <aside className="win side" aria-label="Conversaciones">
      <div className="side-head">
        <Link to="/" className="side-brand" aria-label="dialo">
          <Logo />
          <span className="dsp">dialo</span>
        </Link>
        <span className="side-actions">
          <ActivityCenter panelTarget={activitySlot} onOpenChange={setActivityOpen} />

        </span>
      </div>

      <div className="side-activity" ref={setActivitySlot} />
      <div className="side-browser" hidden={activityOpen}>
      <label className="lg side-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(19,19,22,.6)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input type="text" placeholder="Buscar" aria-label="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>

      <div className="side-filter">
        <Segmented options={filtros} value={filtro} onChange={setFiltro} label="Filtrar conversaciones" />
      </div>

      {conversations.loading && filtro !== 'comunidades' && <SkeletonRows rows={5} avatar={46} className="side-skel" label="Cargando conversaciones…" />}
      {conversations.error && filtro !== 'comunidades' && (
        <Notice tone="error" title="No se pudieron cargar las conversaciones" actionLabel="Reintentar" onAction={conversations.reload}>Revisá tu conexión.</Notice>
      )}
      {!conversations.loading && !conversations.error && !conversations.items.length && filtro !== 'comunidades' && !busqueda && (
        <EmptyState icon="mensajes" title="No tenés conversaciones">Para abrir un chat, elegí a alguien de tus amigos.</EmptyState>
      )}
      {busqueda.trim() && !filas.some((f) => !f.fija) && (
        <EmptyState icon="mensajes" title="No encontramos esa conversación">Probá con otro nombre.</EmptyState>
      )}

      <nav className="side-list" aria-label="Lista de conversaciones">

        {filas.map((f) => f.fija ? (
          <Link key={f.key} to={f.to} className="row">
            <span className="av side-friends"><Icon name={f.fija} size={19} stroke={2} /></span>
            <span className="row-text">
              <span className="nm">{f.nombre}</span>
              {f.preview && <span className="pv side-accent">{f.preview}</span>}
            </span>
            {f.badge > 0 && <span className="side-badge">{f.badge}</span>}
          </Link>
        ) : (
          <div className="side-item" key={f.key}><ConversationRow {...Object.fromEntries(Object.entries(f).filter(([key])=>key!=='key'))}/>
          <ChatRowMenu muted={f.muted} name={f.nombre} community={f.community} open={menuKey===f.key} onToggle={()=>setMenuKey(old=>old===f.key?null:f.key)} onClose={()=>setMenuKey(null)} archived={f.archivado} owner={f.owner} onMute={async value=>{try{await states.change(f.tipo,f.id,{silencio:value});avisar({texto:value==='0'?'Avisos reactivados.':'Chat silenciado.'});}catch(e){avisar({tipo:'error',texto:e.message});}}} onArchive={()=>archive(f)} onDelete={el=>{menuTrigger.current=el;setDeleting(f);}}/></div>
        ))}
      </nav>
      {hasArchived&&<button type="button" className="side-archive-toggle lg pr" aria-pressed={archivados} onClick={()=>setArchivados(v=>!v)}><Icon name="mensajes" size={17}/><span>{archivados?'Volver':'Chats archivados'}</span>{!archivados&&<span className="side-archive-count">{conversations.items.filter(c=>{const st=states.get('conversacion',c.id);return st.archivado&&!st.oculto;}).length+communities.items.filter(c=>states.get('comunidad',c.id).archivado).length}</span>}</button>}
      </div>

      {deleting&&<CommunityActionDialog title={deleting.community?'¿Salir de esta comunidad?':'¿Eliminar esta conversación de tu lista?'} description={deleting.community?'Perderás la membresía y tus permisos en esta comunidad.':'La amistad y los mensajes se conservan. Podés volver a abrirla desde Amigos.'} confirmLabel={deleting.community?'Salir':'Eliminar'} returnFocusRef={menuTrigger} onClose={()=>setDeleting(null)} onConfirm={async()=>{if(deleting.community){await leaveCommunity(deleting.id);communities.forget?.(deleting.id);}else await states.change('conversacion',deleting.id,{oculto:true});states.reload();conversations.reload();if(pathname.startsWith(deleting.to))navigate('/');avisar({texto:deleting.community?'Saliste de la comunidad.':'Conversación retirada de tu lista.'});}}/>}
      <Link to="/perfil" className="side-me">
        <Avatar nombre={usuario?.nombreVisible || usuario?.nombreUsuario} foto={usuario?.fotoUrl} color={usuario?.colorAvatar} size={38} dark presence={usuario?.disponibilidad === 'EN_LINEA' && usuario?.enLinea === false ? 'DESCONECTADO' : usuario?.disponibilidad} />
        <span className="side-me-text">
          <span className="side-me-name">{usuario?.nombreVisible || usuario?.nombreUsuario}</span>
          {!conversations.connected && <span className="side-me-reconnect" role="status"><Spinner size={12} />Reconectando…</span>}
        </span>
        <span className="side-me-gear" aria-hidden="true"><Icon name="ajustes" size={18} stroke={1.9} /></span>
      </Link>
    </aside>
  );
}
