import { useEffect, useRef, useState } from 'react';

// Pide mensajes anteriores sola cuando el botón «Cargar anteriores» se acerca a la vista.
// El botón sigue ahí para teclado y lectores de pantalla.
export function useAutoOlder(viewport, enabled, load) {
  const [target, setTarget] = useState(null);
  const cargar = useRef(load);
  cargar.current = load;
  useEffect(() => {
    const root = viewport.current;
    if (!enabled || !root || !target || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cargar.current();
    }, { root, rootMargin: '240px 0px 0px 0px' });
    io.observe(target);
    return () => io.disconnect();
  }, [viewport, enabled, target]);
  return setTarget;
}
