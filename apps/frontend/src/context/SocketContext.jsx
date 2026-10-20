import { createContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { DEV_USER_ID, SOCKET_URL } from '../constants/api.js';
import { EVENTS } from '../constants/events.js';
import { useAuth } from '../hooks/useAuth.js';

export const SocketContext = createContext(null);

export function SocketProvider({ enabled, children }) {
  const [socket, setSocket] = useState(null);
  const authRef = useRef(null);
  authRef.current = useAuth();

  useEffect(() => {
    if (!enabled) return undefined;

    const instance = io(SOCKET_URL, {
      withCredentials: true,
      auth: DEV_USER_ID ? { devUserId: Number(DEV_USER_ID) } : {},
    });

    instance.on(EVENTS.SESSION_ENDED, () => authRef.current?.sesionTerminada());

    // Si el servidor corta la conexion, se verifica la sesion por HTTP.
    instance.on('disconnect', async (reason) => {
      if (reason !== 'io server disconnect' || !authRef.current) return;
      const resultado = await authRef.current.refresh();
      if (resultado !== 'noLogueado') instance.connect();
    });

    instance.on('connect_error', (error) => {
      if (error?.data?.code === 'UNAUTHORIZED') authRef.current?.refresh();
    });

    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
