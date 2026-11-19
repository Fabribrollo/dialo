// Mapa de desplazamiento que tira todo hacia el punto de abajo al centro.
export function suckMap(w, h) {
  const mw = 360;
  const mh = Math.max(2, Math.round((360 * h) / w));
  const canvas = document.createElement('canvas');
  canvas.width = mw;
  canvas.height = mh;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const img = g.createImageData(mw, mh);
  const d = img.data;
  const cx = 0.5 * w;
  const cy = h;
  const R = 0.42 * w;
  const rmax = Math.hypot(Math.max(cx, w - cx), cy);
  const dmax = R * (1 - Math.exp(-rmax / R));
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const dx = ((x + 0.5) / mw) * w - cx;
      const dy = ((y + 0.5) / mh) * h - cy;
      const r = Math.hypot(dx, dy) || 1;
      const mag = (R * (1 - Math.exp(-r / R))) / dmax;
      const k = (y * mw + x) * 4;
      d[k] = Math.round(255 * (0.5 + (0.5 * mag * dx) / r));
      d[k + 1] = Math.round(255 * (0.5 + (0.5 * mag * dy) / r));
      d[k + 2] = 128;
      d[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), dmax };
}
