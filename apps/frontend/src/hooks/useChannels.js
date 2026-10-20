import { useCallback, useEffect, useRef, useState } from 'react';
import { useCommunities } from '../context/CommunitiesContext.jsx';
import { useSocket } from './useSocket.js';
import { EVENTS } from '../constants/events.js';
import { getChannels } from '../services/channelsService.js';

const ordered = (items) => [...items].sort((a, b) => a.posicion - b.posicion || a.id - b.id);

export function useChannels(id, enabled) {
  const { revision, removed } = useCommunities();
  const socket = useSocket();
  const [result, setResult] = useState({ id: null, items: [], error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [versions, setVersions] = useState({});
  const [connectionVersion, setConnectionVersion] = useState(0);
  const request = useRef(0), alive = useRef(false);
  const allowed = enabled && Number.isInteger(id) && id > 0 && id <= 2_147_483_647 && !removed.has(id);
  const reload = useCallback(async () => {
    const number = ++request.current;
    if (!alive.current || !allowed) return;
    setRefreshing(true);
    try {
      const { items } = await getChannels(id);
      if (alive.current && number === request.current) { setResult({ id, items: ordered(items), error: null }); return true; }
    } catch (error) {
      if (alive.current && number === request.current) setResult((old) => ({
        id, items: old.id === id && ![401, 403, 404].includes(error.status) ? old.items : [], error,
      }));
    } finally { if (alive.current && number === request.current) setRefreshing(false); }
  }, [id, allowed]);
  useEffect(() => {
    alive.current = true; reload();
    return () => { alive.current = false; request.current++; };
  }, [reload, revision]);
  // Invalidar consultas previas antes de aplicar un evento impide que una
  // respuesta demorada restaure un canal al que ya se perdió acceso.
  const mutate = useCallback((update) => {
    if (!alive.current || !allowed) return;
    request.current++; setRefreshing(false);
    setResult((old) => ({ id, items: ordered(update(old.id === id ? old.items : [])), error: null }));
  }, [id, allowed]);
  useEffect(() => {
    if (!socket || !allowed) return;
    const upsert = ({ canal }) => {
      if (canal.idComunidad !== id) return;
      mutate((items) => canal.misPermisos?.includes('VER')
        ? [...items.filter((item) => item.id !== canal.id), canal]
        : items.filter((item) => item.id !== canal.id));
      setVersions((old) => ({ ...old, [canal.id]: (old[canal.id] ?? 0) + 1 }));
      reload();
    };
    const remove = ({ idComunidad, idCanal }) => {
      if (idComunidad !== id) return;
      mutate((items) => items.filter((item) => item.id !== idCanal));
      reload();
    };
    const reorder = ({ idComunidad }) => { if (idComunidad === id) reload(); };
    const reconnect = () => { setConnectionVersion((n) => n + 1); reload(); };
    const handlers = { connect: reconnect, disconnect: () => setConnectionVersion((n) => n + 1), [EVENTS.CHANNEL_CREATED]: upsert, [EVENTS.CHANNEL_UPDATED]: upsert,
      [EVENTS.CHANNEL_DELETED]: remove, [EVENTS.CHANNEL_ACCESS_LOST]: remove, [EVENTS.CHANNELS_REORDERED]: reorder };
    Object.entries(handlers).forEach(([name, handler]) => socket.on(name, handler));
    return () => Object.entries(handlers).forEach(([name, handler]) => socket.off(name, handler));
  }, [socket, id, allowed, mutate, reload]);
  useEffect(() => {
    const focus = () => { if (allowed) { setConnectionVersion((n) => n + 1); reload(); } };
    const visible = () => { if (document.visibilityState === 'visible') focus(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visible); };
  }, [allowed, reload]);
  return {
    items: allowed && result.id === id ? result.items : [],
    error: allowed && result.id === id ? result.error : null,
    loading: allowed && result.id !== id, refreshing, reload, mutate,
    version: (channelId) => `${connectionVersion}:${versions[channelId] ?? 0}`,
    markStale: () => setConnectionVersion((n) => n + 1),
  };
}
