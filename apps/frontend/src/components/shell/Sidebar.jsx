import { api } from '../../services/api.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
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
import { Logo } from './BootScreen.jsx';
import './sidebar.css';

const filtros = [
  { value: 'todo', label: 'Todo', weight: 3 },
  { value: 'personas', label: 'Personas', weight: 4 },
  { value: 'comunidades', label: 'Comunidades', weight: 5 },
];

function preview(c) {
  if (!c.ultimoMensaje) return '';
  return c.ultimoMensaje.eliminado ? 'Este mensaje se eliminó' : c.ultimoMensaje.contenido;
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const { usuario } = useAuth();
  const conversations = useConversations();
  const communities = useCommunities();
  const socket = useSocket();
  const [activity, setActivity] = useState({});
  const activitySeq = useRef(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const seq = ++activitySeq.current, result = {};
      await Promise.all(communities.items.map(async (c) => {
        try {
          const a = await api.get(`/communities/${c.id}/activity`);
          result[c.id] = a.participantes ? `${a.participantes} en llamada` : a.ultimoMensaje ? `${a.ultimoMensaje.canal}: ${a.ultimoMensaje.contenido}` : '';
        } catch { result[c.id] = ''; }
      }));
      if (alive && seq === activitySeq.current) setActivity(result);
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    const revoke = () => { activitySeq.current++; setActivity({}); refresh(); };
    const events = ['community:left','community:member-updated','channel:access-lost','channel:updated','channel:deleted','connect'];
    events.forEach((e)=>socket?.on(e,revoke));
    window.addEventListener('focus', revoke);
    return () => { alive=false; activitySeq.current++; clearInterval(timer); events.forEach((e)=>socket?.off(e,revoke)); window.removeEventListener('focus',revoke); };
  }, [communities.items,socket]);
  const { recibidas } = useFriends();
  const [filtro, setFiltro] = useState('todo');
  const [busqueda, setBusqueda] = useState('');
  const coincide = (texto) => texto.toLowerCase().includes(busqueda.trim().toLowerCase());

  const filas = [];
  if (filtro === 'personas') {
    filas.push({
      key: 'amigos', to: '/amigos', nombre: 'Amigos', fija: 'amigos',
      preview: recibidas.length ? `${recibidas.length} ${recibidas.length === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}` : '',
      badge: recibidas.length,
    });
  }
  if (filtro !== 'comunidades') {
    for (const c of conversations.items) {
      const u = c.otroUsuario;
      if (!coincide(`${u.nombreVisible} ${u.nombreUsuario}`)) continue;
      filas.push({
        key: `c${c.id}`, to: `/conversaciones/${c.id}`, nombre: u.nombreVisible, foto: u.fotoUrl,
        preview: preview(c), time: c.ultimoMensaje && formatListTime(c.ultimoMensaje.fechaCreacion),
      });
    }
  }
  if (filtro === 'comunidades') {
    filas.push({ key: 'comunidades', to: '/comunidades', nombre: 'Mis comunidades', fija: 'comunidades', exact: true });
  }
  if (filtro !== 'personas') {
    for (const c of communities.items) {
      if (!coincide(c.nombre)) continue;
      filas.push({ key: `m${c.id}`, to: `/comunidades/${c.id}`, nombre: c.nombre, foto: c.imagenUrl, preview: activity[c.id], community: true });
    }
  }
  const activa = filas.findIndex((f) => pathname === f.to || (!f.exact && pathname.startsWith(`${f.to}/`)));

  return (
    <aside className="win side" aria-label="Conversaciones">
      <div className="side-head">
        <Link to="/" className="side-brand" aria-label="dialo">
          <Logo />
          <span className="dsp">dialo</span>
        </Link>
        <span className="side-actions">
          <ActivityCenter />
          <Link to="/amigos" className="lg dk pr side-new" aria-label="Nueva conversación">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </Link>
        </span>
      </div>

      <label className="lg side-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(19,19,22,.6)" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input type="text" placeholder="Buscar" aria-label="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>

      <div className="side-filter">
        <Segmented options={filtros} value={filtro} onChange={setFiltro} label="Filtrar conversaciones" />
      </div>

      {conversations.loading && filtro !== 'comunidades' && <span className="side-state" role="status"><Spinner size={15} />Cargando conversaciones…</span>}
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
        {activa >= 0 && <span className="lens lg side-lens" style={{ transform: `translateY(${activa * 60}px)` }} />}
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
          <ConversationRow key={f.key} {...Object.fromEntries(Object.entries(f).filter(([key]) => key !== 'key'))} />
        ))}
      </nav>

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
