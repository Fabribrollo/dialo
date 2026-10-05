import { createContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { DEV_USER_ID, SOCKET_URL } from '../constants/api.js';

export const SocketContext = createContext(null);

export function SocketProvider({ enabled, children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const instance = io(SOCKET_URL, {
      withCredentials: true,
      auth: DEV_USER_ID ? { devUserId: Number(DEV_USER_ID) } : {},
    });
    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
