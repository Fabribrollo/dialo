import { useContext } from 'react';
import { SocketContext } from '../context/SocketContext.jsx';

export function useSocket() {
  return useContext(SocketContext);
}
