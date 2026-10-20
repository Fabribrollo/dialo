import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket.js';
import { channelSubscription } from '../services/channelSubscriptions.js';
import { EVENTS } from '../constants/events.js';
import { getChannel, getChannelMessages } from '../services/channelsService.js';
import { getCommunityMembers } from '../services/communitiesService.js';
import { emitWithAck, mergeMessages } from '../utils-chat.js';

const denied = (e) => [401, 403, 404].includes(e.status) ||
  ['UNAUTHORIZED', 'CHANNEL_NOT_FOUND', 'CHANNEL_NOT_TEXT'].includes(e.code);
const empty = { messages: [], cursor: null, canal: null, members: [], membersReady: false,
  memberError: '', loading: true, loadingOlder: false, error: '', lost: false, ready: false };

// Cada revalidación abre una generación nueva. Los eventos se registran antes
// de suscribir y el historial se pide después del ack: no hay hueco de entrada.
export function useChannelMessages(id, idComunidad) {
  const socket = useSocket();
  const [state, setState] = useState(empty);
  const generation = useRef(0), alive = useRef(false), accepted = useRef(false);
  const changes = useRef(new Map()), olderPending = useRef(false), ready = useRef(false);
  const current = useRef(state);
  current.current = state;
  const clear = useCallback((extra = {}) => {
    generation.current++; accepted.current = false; ready.current = false;
    changes.current.clear(); olderPending.current = false;
    setState({ ...empty, ...extra });
  }, []);
  const lose = useCallback((message = 'El canal se eliminó o ya no tenés acceso.') => {
    clear({ lost: true, loading: false, error: message });
  }, [clear]);
  const reconcile = useCallback((page) => mergeMessages(page, [...changes.current.values()]
    .filter((m) => m.fechaCreacion || page.some((p) => p.id === m.id))), []);
  const apply = useCallback((message) => {
    if (!alive.current || !accepted.current || message.idCanal !== id) return;
    const old = changes.current.get(message.id);
    const next = mergeMessages(old ? [old] : [], [message])[0];
    changes.current.set(message.id, next);
    if (ready.current) setState((s) => ({ ...s, messages: reconcile(s.messages) }));
  }, [id, reconcile]);
  const reload = useCallback(async () => {
    if (!alive.current) return;
    clear();
    const version = generation.current;
    const valid = () => alive.current && version === generation.current;
    try {
      const { canal } = socket?.connected
        ? await channelSubscription(socket, EVENTS.CHANNEL_SUBSCRIBE, id)
        : await getChannel(id);
      if (!valid()) return;
      if (canal.idComunidad !== idComunidad || canal.tipo !== 'TEXTO' || !canal.misPermisos.includes('VER')) {
        lose(); return;
      }
      accepted.current = true;
      // La lista actual permite identificar autores y comparar jerarquías.
      // Si falla, el historial sigue disponible pero no se ofrecen moderaciones.
      const directory = getCommunityMembers(idComunidad).then((data) => ({ items: data.items }))
        .catch((error) => ({ error }));
      const page = await getChannelMessages(id);
      const members = await directory;
      if (!valid()) return;
      if (members.error && denied(members.error)) { lose(members.error.message); return; }
      ready.current = true;
      setState({ ...empty, loading: false, ready: true, canal, messages: reconcile(page.items),
        cursor: page.nextCursor, members: members.items ?? [], membersReady: !members.error,
        memberError: members.error ? 'No se pudieron actualizar los integrantes. La moderación está deshabilitada.' : '' });
    } catch (e) {
      if (!valid()) return;
      if (denied(e)) lose(e.message);
      else { accepted.current = false; setState({ ...empty, loading: false, error: e.message }); }
    }
  }, [id, idComunidad, socket, clear, lose, reconcile]);
  useEffect(() => {
    alive.current = true;
    const update = ({ mensaje }) => apply(mensaje);
    const remove = ({ idCanal, idMensaje, eliminadoPorModerador }) => apply({
      id: idMensaje, idCanal, contenido: null, eliminado: true, eliminadoPorModerador,
    });
    const unavailable = (data) => { if (data.idCanal === id) lose(); };
    const changed = ({ canal }) => {
      if (canal.id !== id) return;
      if (canal.tipo !== 'TEXTO' || !canal.misPermisos.includes('VER')) lose(); else reload();
    };
    const left = ({ idComunidad: community }) => { if (community === idComunidad) lose(); };
    const memberChange = ({ idComunidad: community }) => { if (community === idComunidad) reload(); };
    const disconnected = () => clear({ loading: false, error: 'Sin conexión. Tu borrador se conserva; recuperaremos el canal al reconectar.' });
    const handlers = { connect: reload, disconnect: disconnected,
      [EVENTS.CHANNEL_MESSAGE_NEW]: update, [EVENTS.CHANNEL_MESSAGE_UPDATED]: update,
      [EVENTS.CHANNEL_MESSAGE_DELETED]: remove, [EVENTS.CHANNEL_ACCESS_LOST]: unavailable,
      [EVENTS.CHANNEL_DELETED]: unavailable, [EVENTS.CHANNEL_UPDATED]: changed,
      [EVENTS.COMMUNITY_DELETED]: left, [EVENTS.COMMUNITY_LEFT]: left,
      [EVENTS.COMMUNITY_MEMBER_JOINED]: memberChange, [EVENTS.COMMUNITY_MEMBER_LEFT]: memberChange,
      [EVENTS.USER_UPDATED]: reload };
    if (socket) Object.entries(handlers).forEach(([name, handler]) => socket.on(name, handler));
    const focus = () => reload();
    const visible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visible);
    reload();
    return () => {
      alive.current = false; generation.current++; accepted.current = false; ready.current = false;
      if (socket) Object.entries(handlers).forEach(([name, handler]) => socket.off(name, handler));
      window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visible);
      // No usar la cola offline de Socket.IO para altas ni para bajas de rooms.
      if (socket?.connected) channelSubscription(socket, EVENTS.CHANNEL_UNSUBSCRIBE, id).catch(() => {});
    };
  }, [socket, id, idComunidad, apply, reload, clear, lose]);
  async function older() {
    const cursor = current.current.cursor;
    if (!ready.current || !cursor || olderPending.current) return;
    olderPending.current = true;
    const version = generation.current;
    setState((s) => ({ ...s, loadingOlder: true, error: '' }));
    try {
      const page = await getChannelMessages(id, cursor);
      if (!alive.current || version !== generation.current) return;
      setState((s) => ({ ...s, messages: reconcile(mergeMessages(s.messages, page.items)), cursor: page.nextCursor }));
    } catch (e) {
      if (!alive.current || version !== generation.current) return;
      if (denied(e)) lose(e.message); else setState((s) => ({ ...s, error: e.message }));
    } finally {
      if (alive.current && version === generation.current) {
        olderPending.current = false; setState((s) => ({ ...s, loadingOlder: false }));
      }
    }
  }
  async function action(event, payload) {
    if (![EVENTS.CHANNEL_MESSAGE_SEND, EVENTS.CHANNEL_MESSAGE_EDIT, EVENTS.CHANNEL_MESSAGE_DELETE].includes(event)) throw new Error('Acción inválida');
    if (!ready.current) throw new Error('Esperá a que se actualicen el canal y sus permisos.');
    const version = generation.current;
    try {
      const result = await emitWithAck(socket, event, payload);
      if (!alive.current || version !== generation.current) throw Object.assign(new Error('El canal cambió. Revisá el historial antes de reintentar.'), { code: 'STALE_CHANNEL' });
      if (result.mensaje) apply(result.mensaje);
      else if (event === EVENTS.CHANNEL_MESSAGE_DELETE) apply({ id: result.idMensaje,
        idCanal: result.idCanal, eliminado: true, contenido: null, eliminadoPorModerador: result.eliminadoPorModerador });
      return result;
    } catch (e) {
      if (alive.current && version === generation.current) {
        if (denied(e)) lose(e.message);
        else if (['ACK_TIMEOUT', 'INTERNAL_ERROR', 'NO_WRITE_PERMISSION', 'CANNOT_DELETE_MESSAGE', 'NOT_AUTHOR', 'MESSAGE_DELETED', 'MESSAGE_NOT_FOUND'].includes(e.code)) await reload();
      }
      throw e;
    }
  }
  return { ...state, connected: Boolean(socket?.connected) && state.ready, reload, older, action };
}
