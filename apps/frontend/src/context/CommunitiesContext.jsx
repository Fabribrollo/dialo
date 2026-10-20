import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { useSocket } from '../hooks/useSocket.js';
import { EVENTS } from '../constants/events.js';
import { getCommunities } from '../services/communitiesService.js';

const Context = createContext(null);
export const useCommunities = () => useContext(Context);

export function CommunitiesProvider({ children }) {
  const socket = useSocket();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [removed, setRemoved] = useState(new Set());
  const epoch = useRef(0);
  const request = useRef(0);
  const mounted = useRef(false);

  const invalidate = useCallback(() => {
    epoch.current++;
    setRevision((n) => n + 1);
  }, []);
  const remember = useCallback((comunidad) => {
    invalidate();
    setRemoved((old) => {
      const next = new Set(old);
      next.delete(comunidad.id);
      return next;
    });
    setItems((old) => {
      const previous = old.find((c) => c.id === comunidad.id);
      const updated = { ...previous, ...comunidad, miRol: comunidad.miRol ?? previous?.miRol };
      return previous ? old.map((c) => c.id === updated.id ? updated : c) : [updated, ...old];
    });
  }, [invalidate]);
  const forget = useCallback((id) => {
    invalidate();
    setItems((old) => old.filter((c) => c.id !== id));
    setRemoved((old) => new Set([...old, id]));
  }, [invalidate]);
  const reload = useCallback(async () => {
    const number = ++request.current;
    const version = epoch.current;
    try {
      const data = await getCommunities();
      if (!mounted.current || number !== request.current) return;
      // Un evento o una mutación local ganó a esta consulta. Reconsultar evita
      // restaurar una comunidad eliminada o pisar un cambio recién guardado.
      if (version !== epoch.current) return reload();
      setItems(data.items);
      setRemoved((old) => new Set([...old].filter((id) => !data.items.some((c) => c.id === id))));
      setError('');
    } catch (e) {
      if (mounted.current && number === request.current) setError(e.message);
    } finally {
      if (mounted.current && number === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; request.current++; };
  }, [reload]);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { invalidate(); reload(); };
    const handlers = {
      connect: refresh,
      [EVENTS.COMMUNITY_NEW]: ({ comunidad }) => { remember(comunidad); reload(); },
      // Este evento no contiene miRol: siempre conservar el rol propio.
      [EVENTS.COMMUNITY_UPDATED]: ({ comunidad }) => { remember(comunidad); reload(); },
      [EVENTS.COMMUNITY_DELETED]: ({ idComunidad }) => { forget(idComunidad); reload(); },
      [EVENTS.COMMUNITY_LEFT]: ({ idComunidad }) => { forget(idComunidad); reload(); },
      [EVENTS.COMMUNITY_MEMBER_JOINED]: refresh,
      [EVENTS.COMMUNITY_MEMBER_LEFT]: refresh,
    };
    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
  }, [socket, invalidate, remember, forget, reload]);
  useEffect(() => {
    const refresh = () => { invalidate(); reload(); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [invalidate, reload]);

  return <Context.Provider value={{ items, loading, error, revision, removed, reload, remember, forget }}>
    {children}
  </Context.Provider>;
}

export default function CommunitiesLayout() {
  return <CommunitiesProvider><Outlet /></CommunitiesProvider>;
}
