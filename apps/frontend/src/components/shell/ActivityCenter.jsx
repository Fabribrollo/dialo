import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../../services/api.js';
import { useSocket } from '../../hooks/useSocket.js';
import { formatListTime } from '../../utils/chat.js';
import Dialog from '../ui/Dialog.jsx';
import Avatar from '../ui/Avatar.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import NotificationToasts, { contenidoDelAviso } from './NotificationToasts.jsx';
import { acceptRequest, rejectRequest } from '../../services/friendsService.js';
import './activityCenter.css';

const VACIO = { items: [], noLeidas: 0, nextCursor: null };
const AVISOS_KEY = 'dialo:avisos-navegador';
const REVOCAN = ['channel:access-lost', 'community:left', 'community:member-updated', 'channel:updated'];

function leerPreferencia() {
  try { return localStorage.getItem(AVISOS_KEY) === '1'; } catch { return false; }
}
function guardarPreferencia(valor) {
  try { localStorage.setItem(AVISOS_KEY, valor ? '1' : '0'); } catch { /* sin almacenamiento */ }
}
const soportaAvisos = () => typeof window !== 'undefined' && 'Notification' in window;

// Varios mensajes del mismo chat o canal se muestran como un solo aviso.
export function agrupar(items) {
  const grupos = new Map();
  for (const n of items) {
    const key = `${n.tipo}:${n.referencia}`;
    const g = grupos.get(key);
    if (g) {
      g.total++;
      if (!n.leida) g.nuevas++;
    } else {
      grupos.set(key, { key, tipo: n.tipo, referencia: n.referencia, contexto: n.contexto, vista: n.vista, fecha: n.fechaCreacion, total: 1, nuevas: n.leida ? 0 : 1 });
    }
  }
  return [...grupos.values()];
}

export function describir(g) {
  const nombre = g.contexto?.nombre;
  const cantidad = g.nuevas || g.total;
  const mensajes = `${cantidad} ${cantidad === 1 ? 'mensaje' : 'mensajes'}${g.nuevas ? (cantidad === 1 ? ' nuevo' : ' nuevos') : ''}`;
  if (g.tipo === 'amistad') return { titulo: nombre ?? 'Solicitud de amistad', detalle: 'Quiere ser tu amigo', accion: 'Ver solicitud' };
  if (g.tipo === 'canal') {
    return {
      titulo: nombre ? `#${nombre}` : 'Mensaje en un canal',
      detalle: g.contexto?.comunidad ? `${g.contexto.comunidad} · ${mensajes}` : mensajes,
      accion: 'Abrir canal',
    };
  }
  const vista = g.nuevas <= 1 && g.vista?.texto;
  return { titulo: nombre ?? 'Mensaje privado', detalle: vista || mensajes, accion: 'Abrir chat' };
}

function mostrarAvisoDelSistema(grupo, abrir) {
  if (!soportaAvisos() || Notification.permission !== 'granted') return;
  const { titulo, texto } = contenidoDelAviso(grupo);
  try {
    const aviso = new Notification(titulo, { body: texto || describir(grupo).detalle, tag: grupo.key });
    aviso.onclick = () => { window.focus(); abrir(grupo); aviso.close(); };
  } catch { /* algunos navegadores solo permiten avisos desde un service worker */ }
}

export default function ActivityCenter() {
  const [data, setData] = useState(VACIO);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [masCargando, setMasCargando] = useState(false);
  const [avisos, setAvisos] = useState(() => leerPreferencia() && soportaAvisos() && Notification.permission === 'granted');
  const [permiso, setPermiso] = useState(() => (soportaAvisos() ? Notification.permission : 'unsupported'));
  const [flotantes, setFlotantes] = useState([]);
  const socket = useSocket();
  const trigger = useRef(null);
  const generation = useRef(0);
  const vistos = useRef(null);
  const abrirRef = useRef(null);
  const avisosRef = useRef(avisos);
  avisosRef.current = avisos;
  const titulo = useId();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const seq = ++generation.current;
    try {
      const result = await api.get('/notifications');
      if (seq !== generation.current) return;
      setData({ ...VACIO, ...result, items: result?.items ?? [] });
      setError('');
      const nuevos = agrupar(result.items ?? []).filter((g) => g.nuevas);
      if (vistos.current) {
        const llegaron = nuevos.filter((g) => g.nuevas > (vistos.current.get(g.key) ?? 0));
        if (document.visibilityState === 'visible') {
          // El más nuevo arriba; si ya había uno del mismo chat o canal, se reemplaza.
          if (llegaron.length) setFlotantes((f) => [...llegaron, ...f.filter((x) => !llegaron.some((n) => n.key === x.key))]);
        } else if (avisosRef.current) {
          for (const g of llegaron) mostrarAvisoDelSistema(g, (x) => abrirRef.current?.(x));
        }
      }
      // Lo que ya se leyó en otro lado deja de mostrarse flotando.
      setFlotantes((f) => f.filter((x) => nuevos.some((n) => n.key === x.key)));
      vistos.current = new Map(nuevos.map((g) => [g.key, g.nuevas]));
    } catch (e) {
      if (seq === generation.current) setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    socket?.on('notifications:changed', load);
    socket?.on('connect', load);
    const revoke = () => { generation.current++; setData(VACIO); load(); };
    REVOCAN.forEach((e) => socket?.on(e, revoke));
    window.addEventListener('focus', load);
    return () => {
      generation.current++;
      socket?.off('notifications:changed', load);
      socket?.off('connect', load);
      REVOCAN.forEach((e) => socket?.off(e, revoke));
      window.removeEventListener('focus', load);
    };
  }, [socket, load]);

  // Le avisa al servidor qué chat o canal está mirando esta pestaña.
  useEffect(() => {
    const dm = /^\/conversaciones\/(\d+)$/.exec(pathname);
    const ch = /\/canales\/(\d+)$/.exec(pathname);
    const scope = ch ? { tipo: 'canal', referencia: Number(ch[1]) } : dm ? { tipo: 'conversacion', referencia: Number(dm[1]) } : null;
    const update = () => socket?.emit('activity:watch', document.visibilityState === 'visible' && document.hasFocus() ? scope : null);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    socket?.on('connect', update);
    update();
    return () => {
      socket?.emit('activity:watch', null);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      socket?.off('connect', update);
    };
  }, [pathname, socket]);

  const grupos = useMemo(() => agrupar(data.items), [data.items]);

  async function marcar(filtro = {}) {
    try {
      await api.post('/notifications/read', filtro);
      load();
    } catch (e) { setError(e.message); }
  }

  async function abrir(g) {
    setError('');
    try {
      let destino = '/amigos';
      if (g.tipo === 'canal') {
        const idComunidad = g.contexto?.idComunidad ?? (await api.get(`/channels/${g.referencia}`)).canal.idComunidad;
        destino = `/comunidades/${idComunidad}/canales/${g.referencia}`;
      } else if (g.tipo === 'conversacion') {
        destino = `/conversaciones/${g.referencia}`;
      }
      setOpen(false);
      navigate(destino);
      marcar({ tipo: g.tipo, referencia: g.referencia });
    } catch {
      setError('Ese chat o canal ya no está disponible.');
      load();
    }
  }
  abrirRef.current = abrir;

  const quitarFlotante = useCallback((key) => setFlotantes((f) => f.filter((x) => x.key !== key)), []);

  async function principalFlotante(g) {
    quitarFlotante(g.key);
    if (g.tipo !== 'amistad') return abrir(g);
    try { await acceptRequest(g.referencia); marcar({ tipo: g.tipo, referencia: g.referencia }); }
    catch (e) { setError(e.message); setOpen(true); }
  }

  async function secundariaFlotante(g) {
    quitarFlotante(g.key);
    if (g.tipo !== 'amistad') return marcar({ tipo: g.tipo, referencia: g.referencia });
    try { await rejectRequest(g.referencia); marcar({ tipo: g.tipo, referencia: g.referencia }); }
    catch (e) { setError(e.message); setOpen(true); }
  }

  async function cargarAnteriores() {
    const seq = generation.current;
    setMasCargando(true);
    try {
      const more = await api.get(`/notifications?cursor=${data.nextCursor}`);
      if (seq !== generation.current) return;
      setData((d) => ({ ...more, items: [...d.items, ...more.items.filter((n) => !d.items.some((old) => old.id === n.id))] }));
    } catch (e) {
      if (seq === generation.current) setError(e.message);
    } finally {
      setMasCargando(false);
    }
  }

  async function alternarAvisos() {
    if (avisos) { setAvisos(false); guardarPreferencia(false); return; }
    let resultado = Notification.permission;
    if (resultado === 'default') resultado = await Notification.requestPermission();
    setPermiso(resultado);
    const activo = resultado === 'granted';
    setAvisos(activo);
    guardarPreferencia(activo);
  }

  async function abrirPanel() {
    setOpen(true);
    setCargando(true);
    await load();
    setCargando(false);
  }

  const contador = data.noLeidas > 99 ? '99+' : data.noLeidas;
  const etiqueta = `Notificaciones: ${error && !data.items.length ? 'sin conexión' : `${data.noLeidas} sin leer`}`;

  return (
    <>
      <button type="button" ref={trigger} className="lg pr act-bell" onClick={abrirPanel} aria-label={etiqueta} aria-haspopup="dialog">
        <Icon name="campana" size={19} stroke={2} />
        {data.noLeidas > 0 && <span className="act-count" aria-hidden="true">{contador}</span>}
      </button>
      {flotantes.length > 0 && !open && (
        <NotificationToasts avisos={flotantes} onPrincipal={principalFlotante} onSecundaria={secundariaFlotante}
          onCerrar={quitarFlotante} onVerTodas={() => { setFlotantes([]); abrirPanel(); }} />
      )}
      <Dialog open={open} onClose={() => setOpen(false)} label="Notificaciones" className="act-panel" returnFocusRef={trigger}>
        <header className="act-head">
          <h2 id={titulo} className="act-title">Notificaciones</h2>
          {data.noLeidas > 0 && <span className="act-pill">{data.noLeidas} sin leer</span>}
          <button type="button" className="act-close pr" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">
            <Icon name="cerrar" size={18} stroke={2.2} />
          </button>
        </header>

        {error && (
          <div className="act-error" role="alert">
            <Icon name="error" size={17} stroke={2} />
            <span>{error}</span>
            <button type="button" className="lnk" onClick={load}>Reintentar</button>
          </div>
        )}

        {cargando && !data.items.length && <span className="act-state" role="status"><Spinner size={15} />Cargando notificaciones…</span>}

        {!cargando && !grupos.length && !error && (
          <EmptyState icon="campana" title="No tenés notificaciones">Te avisamos acá cuando te escriban o te manden una solicitud.</EmptyState>
        )}

        {grupos.length > 0 && (
          <ul className="act-list" aria-labelledby={titulo}>
            {grupos.map((g) => {
              const { titulo: t, detalle, accion } = describir(g);
              return (
                <li key={g.key}>
                  <button type="button" className={`act-item ${g.nuevas ? 'is-new' : ''}`} onClick={() => abrir(g)}>
                    {g.tipo === 'canal'
                      ? <span className="act-icon" aria-hidden="true"><Icon name="canalTexto" size={18} stroke={2.1} /></span>
                      : <Avatar nombre={g.contexto?.nombre ?? '?'} foto={g.contexto?.fotoUrl} size={40} />}
                    <span className="act-text">
                      <span className="act-name">{t}</span>
                      <span className="act-detail">{detalle}</span>
                    </span>
                    <span className="act-meta">
                      <time className="tm" dateTime={g.fecha}>{formatListTime(g.fecha)}</time>
                      {g.nuevas > 0 && <span className="act-dot" aria-hidden="true" />}
                    </span>
                    <span className="sr-only">{g.nuevas ? ', sin leer' : ', leída'}. {accion}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {data.nextCursor && (
          <button type="button" className="act-more pr" onClick={cargarAnteriores} disabled={masCargando}>
            {masCargando ? <><Spinner size={14} />Cargando…</> : 'Cargar anteriores'}
          </button>
        )}

        <footer className="act-foot">
          {data.noLeidas > 0 && <button type="button" className="lnk" onClick={() => marcar()}>Marcar todo como leído</button>}
          {permiso !== 'unsupported' && (
            <button type="button" className="act-switch" role="switch" aria-checked={avisos} onClick={alternarAvisos} disabled={permiso === 'denied'}>
              <span className={`act-toggle ${avisos ? 'on' : ''}`} aria-hidden="true" />
              Avisos del navegador
            </button>
          )}
        </footer>
        {permiso === 'denied' && <p className="act-hint">El navegador bloqueó los avisos de Dialo. Podés habilitarlos desde el candado de la barra de direcciones.</p>}
        {avisos && <p className="act-hint">Te avisamos con una notificación del sistema cuando Dialo está en segundo plano.</p>}
      </Dialog>
    </>
  );
}
