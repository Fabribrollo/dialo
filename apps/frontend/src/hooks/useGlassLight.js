import { useEffect } from 'react';

export function useGlassLight() {
  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let ultimo = null;

    function pintar() {
      frame = 0;
      for (const el of document.querySelectorAll('.lg, .win')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const k = el.offsetWidth / r.width;
        const x = (ultimo.clientX - r.left) * k;
        const y = (ultimo.clientY - r.top) * k;
        const a = Math.atan2(x - el.offsetWidth / 2, -(y - el.offsetHeight / 2)) * 180 / Math.PI;
        el.style.setProperty('--lx', `${x}px`);
        el.style.setProperty('--ly', `${y}px`);
        el.style.setProperty('--la', `${a}deg`);
      }
    }

    function onMove(e) {
      if (quieto.matches) return;
      ultimo = e;
      if (!frame) frame = requestAnimationFrame(pintar);
    }

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
}
