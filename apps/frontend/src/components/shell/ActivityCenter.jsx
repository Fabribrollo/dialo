import {usePrivateCall} from '../../context/PrivateCallContext.jsx';
import Notice from '../ui/Notice.jsx';
import { enabled, supported } from '../../utils/browserNotifications.js';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { notificationsStore } from './notificationsStore.js';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../../services/api.js';
import { useSocket } from '../../hooks/useSocket.js';
import { formatListTime } from '../../utils/chat.js';
import Avatar from '../ui/Avatar.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import NotificationToasts, { contenidoDelAviso } from './NotificationToasts.jsx';
import { acceptRequest, rejectRequest } from '../../services/friendsService.js';
import './activityCenter.css';

const VACIO = { items: [], noLeidas: 0, nextCursor: null };
const REVOCAN = ['channel:access-lost', 'community:left', 'community:member-updated', 'channel:updated', 'channel:deleted', 'community:deleted'];
export const esSeguridad = (tipo) => ['roles', 'acceso', 'baneo', 'rehabilitado', 'solicitud_canal', 'acceso_aceptado', 'acceso_rechazado'].includes(tipo);

const soportaAvisos = supported;

// Varios mensajes del mismo chat o canal se muestran como un solo aviso.
export function agrupar(items) {
  const grupos = new Map();
  for (const n of items) {
    const key = `${n.tipo}:${n.referencia}${n.distincion?':'+n.distincion:''}`;
    const g = grupos.get(key);
    if (g) {
      g.total++;
      if (!n.leida) g.nuevas++;
    } else {
      grupos.set(key, { key,...(n.distincion?{distincion:n.distincion}:{}), tipo: n.tipo, referencia: n.referencia, contexto: n.contexto, vista: n.vista, fecha: n.fechaCreacion, total: 1, nuevas: n.leida ? 0 : 1 });
    }
  }
  return [...grupos.values()];
}

export function describir(g) {
  if(g.distincion)return {titulo:g.distincion==='mencion'?'Te mencionaron':'Respondieron tu mensaje',detalle:`${g.contexto?.nombre??'Canal'} · ${g.vista?.texto??''}`,accion:'Ver mensaje'};
  if (esSeguridad(g.tipo)) {
    const aviso = contenidoDelAviso(g);
    return { titulo: aviso.titulo, detalle: aviso.texto, accion: aviso.principal };
  }
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

async function mostrarAvisoDelSistema(grupo, abrir) {
  if (!soportaAvisos() || Notification.permission !== 'granted') return;
  const { titulo, texto } = contenidoDelAviso(grupo);
  try {
    if(navigator.serviceWorker){const registration=await navigator.serviceWorker.getRegistration();if(registration?.showNotification){const c=grupo.contexto??{};const url=c.idComunidad?(grupo.tipo==='canal'?`/comunidades/${c.idComunidad}/canales/${grupo.referencia}`:`/comunidades/${c.idComunidad}`):grupo.tipo==='conversacion'?`/conversaciones/${grupo.referencia}`:'/';await registration.showNotification(titulo,{body:texto||describir(grupo).detalle,tag:grupo.key,data:{url}});return {close:()=>registration.getNotifications({tag:grupo.key}).then(items=>items.forEach(n=>n.close()))};}}
    const aviso = new Notification(titulo, { body: texto || describir(grupo).detalle, tag: grupo.key });
    aviso.onclick = () => { window.focus(); abrir(grupo); aviso.close(); };
    return aviso;
  } catch { /* algunos navegadores solo permiten avisos desde un service worker */ }
}

export default function ActivityCenter({ panelTarget, onOpenChange }) {
  const privateCall=usePrivateCall();
  const [data, setData] = useState(VACIO);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [masCargando, setMasCargando] = useState(false);
  const [avisos, setAvisos] = useState(enabled);
  useEffect(()=>{const update=()=>setAvisos(enabled());window.addEventListener('storage',update);window.addEventListener('dialo:notification-preference',update);window.addEventListener('focus',update);return()=>{window.removeEventListener('storage',update);window.removeEventListener('dialo:notification-preference',update);window.removeEventListener('focus',update);};},[]);
  const [flotantes, setFlotantes] = useState([]);
  const socket = useSocket();
  const trigger = useRef(null);
  const origen = useRef(null);
  const generation = useRef(0);
  const accessEpoch = useRef(0);
  const vistos = useRef(null);
  const sistema = useRef(new Set());
  const abrirRef = useRef(null);
  const avisosRef = useRef(avisos);
  avisosRef.current = avisos;
  const titulo = useId();
  useEffect(() => {
    onOpenChange?.(open);
    notificationsStore.set({ expanded: open });
    if (open) {
      closeButton.current?.focus();
    } else if (origen.current?.isConnected) origen.current.focus();
  }, [open, onOpenChange]);
  const closeButton = useRef(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setOpen(false); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
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
          for (const g of llegaron) {
            const aviso = await mostrarAvisoDelSistema(g, (x) => abrirRef.current?.(x));
            if(seq!==generation.current){aviso?.close();return;}
            if (aviso) { sistema.current.add(aviso); aviso.onclose = () => sistema.current.delete(aviso); }
          }
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
    const revoke = () => {
      accessEpoch.current++;
      generation.current++;
      setData(VACIO); setFlotantes([]); vistos.current = null;
      for (const aviso of sistema.current) aviso.close();
      sistema.current.clear();
      load();
    };
    REVOCAN.forEach((e) => socket?.on(e, revoke));
    window.addEventListener('focus', load);
    return () => {
      generation.current++;
      for (const aviso of sistema.current) aviso.close();
      sistema.current.clear();
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
    const hiddenByCall=dm&&privateCall?.active&&privateCall.call?.idConversacion===Number(dm[1])&&!privateCall.chatVisible&&!(privateCall.incoming&&privateCall.call.estado==='LLAMANDO');
    const scope = hiddenByCall?null:ch ? { tipo: 'canal', referencia: Number(ch[1]) } : dm ? { tipo: 'conversacion', referencia: Number(dm[1]) } : null;
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
  }, [pathname, socket,privateCall?.active,privateCall?.call?.idConversacion,privateCall?.chatVisible,privateCall?.incoming,privateCall?.call?.estado]);

  const grupos = useMemo(() => agrupar(data.items), [data.items]);

  async function marcar(filtro = {}) {
    try {
      await api.post('/notifications/read', filtro);
      load();
    } catch (e) { setError(e.message); }
  }

  async function abrir(g) {
    const epoch = accessEpoch.current;
    setError('');
    try {
      let destino = '/amigos';
      if (esSeguridad(g.tipo) && !g.contexto?.idComunidad) {
        await marcar({ tipo: g.tipo, referencia: g.referencia });
        return;
      }
      if (g.tipo === 'solicitud_canal') {
        await api.get(`/channels/${g.contexto.idCanal}/requests`);
        destino=`/comunidades/${g.contexto.idComunidad}/canales/${g.contexto.idCanal}?solicitudes=1`;
      } else if (g.tipo === 'canal' || g.tipo === 'acceso' || g.tipo === 'acceso_aceptado') {
        const idComunidad = (await api.get(`/channels/${g.referencia}`)).canal.idComunidad;
        destino = `/comunidades/${idComunidad}/canales/${g.referencia}`;
      } else if (g.tipo === 'roles') {
        await api.get(`/communities/${g.referencia}`);
        destino = `/comunidades/${g.referencia}/integrantes`;
      } else if (g.tipo === 'conversacion') {
        await api.get(`/conversations/${g.referencia}`);
        destino = `/conversaciones/${g.referencia}`;
      }
      if (epoch !== accessEpoch.current) return;
      setOpen(false);
      navigate(destino);
      marcar({ tipo: g.tipo, referencia: g.referencia });
    } catch {
      await load();
      setError('Este destino ya no está disponible o tu acceso cambió.');
      setOpen(true);
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

  async function abrirPanel() {
    origen.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    setOpen(true);
    setCargando(true);
    await load();
    setCargando(false);
  }

  const abrirRefPanel = useRef(abrirPanel);
  abrirRefPanel.current = abrirPanel;
  useEffect(() => { notificationsStore.set({ noLeidas: data.noLeidas, abrir: () => abrirRefPanel.current() }); }, [data.noLeidas]);
  useEffect(() => () => notificationsStore.set({ noLeidas: 0, abrir: null, expanded: false }), []);

  const contador = data.noLeidas > 99 ? '99+' : data.noLeidas;
  const etiqueta = `Notificaciones: ${error && !data.items.length ? 'sin conexión' : `${data.noLeidas} sin leer`}`;

  return (
    <>
      <button type="button" ref={trigger} className="lg pr act-bell" onClick={abrirPanel} aria-label={etiqueta} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="campana" size={19} stroke={2} />
        {data.noLeidas > 0 && <span className="act-count" aria-hidden="true">{contador}</span>}
      </button>
      {flotantes.length > 0 && !open && (
        <NotificationToasts avisos={flotantes} onPrincipal={principalFlotante} onSecundaria={secundariaFlotante}
          onCerrar={quitarFlotante} onVerTodas={() => { setFlotantes([]); abrirPanel(); }} />
      )}
      {open && createPortal(
      <section role="dialog" aria-modal="false" aria-label="Notificaciones" className="act-panel">
        <header className="act-head">
          <h2 id={titulo} className="act-title">Notificaciones</h2>
          {data.noLeidas > 0 && <span className="act-pill">{data.noLeidas} sin leer</span>}
          <button type="button" ref={closeButton} className="act-close pr" onClick={() => setOpen(false)} aria-label="Cerrar notificaciones">
            <Icon name="cerrar" size={18} stroke={2.2} />
          </button>
        </header>

        {error&&<Notice title={error} actionLabel="Reintentar" onAction={load}/>}

        {cargando && !data.items.length && <span className="act-state" role="status"><Spinner size={15} />Cargando notificaciones…</span>}

        {!cargando && !grupos.length && !error && (
          <EmptyState icon="campana" title="No tenés notificaciones">Te avisamos acá sobre mensajes, solicitudes y cambios en tus accesos.</EmptyState>
        )}

        {grupos.length > 0 && (
          <ul className="act-list" aria-labelledby={titulo}>
            {grupos.map((g) => {
              const { titulo: t, detalle, accion } = describir(g);
              return (
                <li key={g.key}>
                  <button type="button" className={`act-item ${g.nuevas ? 'is-new' : ''}`} onClick={() => abrir(g)}>
                    {(g.tipo === 'canal' || esSeguridad(g.tipo))
                      ? <span className="act-icon" aria-hidden="true"><Icon name={esSeguridad(g.tipo) ? 'ajustes' : 'canalTexto'} size={18} stroke={2.1} /></span>
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
        </footer>
      </section>,
      panelTarget ?? document.body)}
    </>
  );
}
