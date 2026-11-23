// Ubicación de los íconos de vidrio que rodean el registro. La landing y las pantallas de acceso usan
// la misma semilla, así el ícono que sale volando del botón termina justo donde lo dibuja el acceso.
export const TIPOS = ['mensajes', 'microfono', 'perfil', 'comunidades'];
export const DURACION_BURST = 1250;

function aleatorio(semilla) {
  let s = semilla;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function armarIconos(ancho, alto, ox = ancho / 2, oy = alto / 2) {
  const rnd = aleatorio(7);
  const total = 16;
  const filas = total / 2;
  return Array.from({ length: total }, (_, i) => {
    const izquierda = i % 2 === 0;
    const fila = Math.floor(i / 2);
    const [desde, hasta] = izquierda ? [0.03, 0.25] : [0.75, 0.97];
    const x = ancho * (desde + rnd() * (hasta - desde));
    const y = alto * (0.1 + ((fila + 0.2 + rnd() * 0.6) / filas) * 0.82);
    const tipo = TIPOS[(i + fila) % TIPOS.length];
    return {
      id: i,
      tipo,
      x, y,
      redondo: tipo === 'perfil',
      tenido: rnd() > 0.62,
      tam: rnd() > 0.55 ? 96 : 68,
      estilo: {
        left: `${ox}px`,
        top: `${oy}px`,
        '--tx': `${Math.round(x - ox)}px`,
        '--ty': `${Math.round(y - oy)}px`,
        '--s': (0.85 + rnd() * 0.35).toFixed(2),
        '--r': `${Math.round((rnd() - 0.5) * 30)}deg`,
        '--fd': `${(3.2 + rnd() * 2.4).toFixed(2)}s`,
        '--fdl': `${(-rnd() * 3).toFixed(2)}s`,
        animationDelay: `${(0.18 + fila * 0.04 + rnd() * 0.04).toFixed(3)}s`,
      },
    };
  });
}
