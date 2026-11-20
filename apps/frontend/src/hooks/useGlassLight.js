import { useEffect } from 'react';

export function useGlassLight() {
  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let ultimo = null;

    // Primero se leen todas las medidas y después se escriben los estilos: leer y escribir intercalado
    // obligaba al navegador a recalcular el layout una vez por cada vidrio en cada movimiento del mouse.
    function pintar() {
      frame = 0;
      const vh = window.innerHeight, vw = window.innerWidth;
      const medidas = [];
      for (const el of document.querySelectorAll('.lg, .win')) {
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
        medidas.push([el, r, el.offsetWidth, el.offsetHeight]);
      }
      for (const [el, r, w, h] of medidas) {
        const k = w / r.width;
        const x = (ultimo.clientX - r.left) * k;
        const y = (ultimo.clientY - r.top) * k;
        const a = Math.atan2(x - w / 2, -(y - h / 2)) * 180 / Math.PI;
        el.style.setProperty('--lx', `${x.toFixed(0)}px`);
        el.style.setProperty('--ly', `${y.toFixed(0)}px`);
        el.style.setProperty('--la', `${a.toFixed(0)}deg`);
      }
    }

    function onMove(e) {
      if (quieto.matches || e.pointerType === 'touch') return;
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
