import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../../services/api.js';
import { useSocket } from '../../hooks/useSocket.js';
import Dialog from '../ui/Dialog.jsx';
const titles = { canal: 'Nuevo mensaje en un canal', conversacion: 'Nuevo mensaje privado', amistad: 'Solicitud de amistad' };
export default function ActivityCenter() {
  const [data, setData] = useState({ items: [], noLeidas: 0 }), [open, setOpen] = useState(false), [error, setError] = useState('');
  const socket = useSocket(), trigger = useRef(null), generation = useRef(0);
  const { pathname } = useLocation(), navigate = useNavigate();
  const load = useCallback(async () => {
    const seq = ++generation.current;
    try { const result = await api.get('/notifications'); if (seq === generation.current) { setData(result); setError(''); } }
    catch (e) { if (seq === generation.current) setError(e.message); }
  }, []);
  useEffect(() => {
    load(); socket?.on('notifications:changed', load); socket?.on('connect', load);
    const revoke = () => { generation.current++; setData({ items: [], noLeidas: 0 }); load(); };
    const events = ['channel:access-lost','community:left','community:member-updated','channel:updated'];
    events.forEach((e) => socket?.on(e, revoke));
    window.addEventListener('focus', load);
    return () => { generation.current++; socket?.off('notifications:changed', load); socket?.off('connect', load); events.forEach((e) => socket?.off(e,revoke)); window.removeEventListener('focus',load); };
  }, [socket, load]);
  useEffect(() => {
    const dm = /^\/conversaciones\/(\d+)$/.exec(pathname), ch = /\/canales\/(\d+)$/.exec(pathname);
    const scope = ch ? { tipo:'canal',referencia:Number(ch[1]) } : dm ? { tipo:'conversacion',referencia:Number(dm[1]) } : null;
    const update = () => socket?.emit('activity:watch', document.visibilityState === 'visible' && document.hasFocus() ? scope : null);
    const events = ['focus','blur']; events.forEach((e) => window.addEventListener(e,update));
    document.addEventListener('visibilitychange', update); socket?.on('connect', update); update();
    return () => { socket?.emit('activity:watch',null); events.forEach((e) => window.removeEventListener(e,update)); document.removeEventListener('visibilitychange',update); socket?.off('connect',update); };
  }, [pathname,socket]);
  async function read(id) { try { await api.post('/notifications/read', id ? {id} : {}); load(); } catch(e) { setError(e.message); } }
  async function go(n) {
    await read(n.id);
    setOpen(false);
  }
  return <div className="activity-toolbar">
    <button type="button" ref={trigger} onClick={() => { setOpen(true); load(); }} aria-label={`Notificaciones: ${error ? 'sin conexión' : data.noLeidas + ' sin leer'}`}>
      Notificaciones {data.noLeidas > 0 && <span>{data.noLeidas}</span>}
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} label="Centro de actividad" returnFocusRef={trigger}>
      <h2>Centro de actividad</h2>
      {error && <p role="alert">{error} <button onClick={load}>Reintentar</button></p>}
      <button type="button" onClick={() => read()}>Marcar todas como leídas</button>
      {!data.items.length && <p>No tenés notificaciones.</p>}
      <ul>{data.items.map((n) => <li key={n.id}>
        <span>{titles[n.tipo]} · {new Date(n.fechaCreacion).toLocaleString()} {n.leida ? '· Leída' : '· Nueva'}</span>
        {n.tipo === 'amistad' ? <Link to="/amigos" onClick={() => go(n)}>Ver solicitud</Link>
          : <button type="button" onClick={async () => {
            try {
              if (n.tipo === 'canal') {
                const { canal } = await api.get(`/channels/${n.referencia}`);
                await read(n.id); setOpen(false); navigate(`/comunidades/${canal.idComunidad}/canales/${canal.id}`);
              } else {
                await api.get(`/conversations/${n.referencia}`);
                await read(n.id); setOpen(false); navigate(`/conversaciones/${n.referencia}`);
              }
            } catch (e) { setError('El destino ya no está disponible.'); load(); }
          }}>Abrir</button>}
      </li>)}</ul>
      {data.nextCursor && <button type="button" onClick={async () => {
        const seq = generation.current;
        try { const more = await api.get('/notifications?cursor='+data.nextCursor); if (seq === generation.current) setData((d) => ({...more,items:[...d.items,...more.items.filter((n) => !d.items.some((old) => old.id === n.id))]})); } catch(e) {if (seq === generation.current) setError(e.message);}
      }}>Cargar anteriores</button>}
    </Dialog>
  </div>;
}
