import { useEffect, useState, useRef } from 'react';
import { useSocket } from './useSocket.js';
import { useAuth } from './useAuth.js';

const LIFETIME = 5000;
export function useTyping(tipo, id) {
  const socket = useSocket(), { usuario } = useAuth();
  const [people, setPeople] = useState({});
  const sent = useRef(0), idle = useRef(null), active = useRef(false);
  const destination = Number(id);
  useEffect(() => {
    const reset = () => { sent.current = 0; active.current = false; clearTimeout(idle.current); setPeople({}); };
    reset();
    const update = (event) => {
      if (event.tipo !== tipo || Number(event.id) !== destination || Number(event.idUsuario) === usuario.id) return;
      // El reloj del servidor y la latencia de autorización no acortan la UI.
      setPeople((p) => {
        const next = {...p};
        if (event.escribiendo) next[event.idUsuario] = {...event, hasta:Date.now()+LIFETIME};
        else delete next[event.idUsuario];
        return next;
      });
    };
    socket?.on('typing:updated', update);
    socket?.on('connect', reset); socket?.on('disconnect', reset);
    const timer = setInterval(() => setPeople((p) => Object.fromEntries(Object.entries(p).filter(([,v]) => v.hasta > Date.now()))), 500);
    return () => {
      clearTimeout(idle.current);clearInterval(timer);
      socket?.off('typing:updated', update);socket?.off('connect', reset);socket?.off('disconnect', reset);
      if (active.current && socket?.connected !== false) socket?.emit('typing:update',{tipo,id:destination,escribiendo:false});
    };
  }, [socket, tipo, destination, usuario.id]);
  function typing(value) {
    clearTimeout(idle.current);
    if (!socket || socket.connected === false || !Number.isInteger(destination) || destination <= 0) return;
    if (!value.trim()) {
      if (active.current) socket.emit('typing:update',{tipo,id:destination,escribiendo:false});
      active.current=false;sent.current=0;return;
    }
    if (!active.current || Date.now()-sent.current >= 1500) {
      sent.current=Date.now();active.current=true;
      socket.emit('typing:update',{tipo,id:destination,escribiendo:true});
    }
    idle.current=setTimeout(()=>{
      if (socket.connected !== false) socket.emit('typing:update',{tipo,id:destination,escribiendo:false});
      active.current=false;sent.current=0;
    },3000);
  }
  return { typing, names:Object.values(people).map((p)=>p.nombre).join(', ') };
}
