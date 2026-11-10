import { useEffect, useState } from 'react';
import { useSocket } from './useSocket.js';
import { EVENTS } from '../constants/events.js';
import { channelSubscription } from '../services/channelSubscriptions.js';
import { getCallParticipants } from '../services/callsService.js';

export function useCallParticipants(idCanal) {
  const socket = useSocket();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        if (socket?.connected) await channelSubscription(socket, EVENTS.CHANNEL_SUBSCRIBE, idCanal);
        const data = await getCallParticipants(idCanal);
        if (vivo) { setItems(data.items); setError(''); }
      } catch (e) {
        if (vivo) setError(e.message);
      }
    };
    const entro = ({ idCanal: id, participante }) => {
      if (id !== idCanal) return;
      setItems((old) => [...old.filter((p) => p.usuario.id !== participante.usuario.id), participante]);
    };
    const salio = ({ idCanal: id, idUsuario }) => {
      if (id === idCanal) setItems((old) => old.filter((p) => p.usuario.id !== idUsuario));
    };
    socket?.on(EVENTS.CALL_PARTICIPANT_JOINED, entro);
    socket?.on(EVENTS.CALL_PARTICIPANT_LEFT, salio);
    socket?.on('connect', cargar);
    cargar();
    return () => {
      vivo = false;
      socket?.off(EVENTS.CALL_PARTICIPANT_JOINED, entro);
      socket?.off(EVENTS.CALL_PARTICIPANT_LEFT, salio);
      socket?.off('connect', cargar);
      if (socket?.connected) channelSubscription(socket, EVENTS.CHANNEL_UNSUBSCRIBE, idCanal).catch(() => {});
    };
  }, [socket, idCanal]);

  return { items, error };
}
