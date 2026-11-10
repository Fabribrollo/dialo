import { useContext } from 'react';
import { CallContext } from '../context/CallContext.jsx';

export function useCall() {
  return useContext(CallContext);
}
