import { useEffect, useState } from 'react';

const dos = (n) => String(n).padStart(2, '0');

export function formatCallTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${dos(m)}:${dos(s % 60)}` : `${dos(m)}:${dos(s % 60)}`;
}

export function useCallTime(desde) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (!desde) return undefined;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desde]);
  return desde ? formatCallTime(ahora - desde) : '';
}
