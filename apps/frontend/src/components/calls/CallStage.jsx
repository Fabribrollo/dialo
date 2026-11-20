import { useEffect, useRef, useState } from 'react';
import CallTile, { MoreTile, ScreenTile } from './CallTile.jsx';

const TIRA = 6;
const GRILLA = 9;

function columnas(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

export default function CallStage({ personas, onStopShare }) {
  const [grilla, setGrilla] = useState(false);
  const [todos, setTodos] = useState(false);
  const [elegida, setElegida] = useState(null);
  const pantallas = personas.filter((p) => p.videoPantalla || (p.local && p.pantalla));
  const ids = pantallas.map((p) => p.idUsuario).join(',');
  const previas = useRef(ids);

  // Si alguien empieza a compartir, la pantalla vuelve al frente aunque estuvieras viendo las cámaras.
  useEffect(() => {
    const antes = new Set(previas.current.split(',').filter(Boolean));
    const nueva = ids.split(',').filter(Boolean).find((id) => !antes.has(id));
    if (nueva) { setGrilla(false); setElegida(Number(nueva) || nueva); }
    previas.current = ids;
  }, [ids]);

  const pantalla = pantallas.find((p) => p.idUsuario === elegida) ?? pantallas[0];

  if (pantalla && !grilla) {
    const visibles = personas.length > TIRA ? personas.slice(0, TIRA - 1) : personas;
    const resto = personas.length - visibles.length;
    return (
      <div className="cs-stage" role="group" aria-label="Video de la llamada">
        <ScreenTile
          persona={pantalla}
          otras={pantallas.filter((p) => p !== pantalla)}
          onElegir={(p) => setElegida(p.idUsuario)}
          onGrid={() => setGrilla(true)}
          onStop={pantalla.local ? onStopShare : undefined}
        />
        <div className="cs-strip">
          {visibles.map((p) => <CallTile key={p.idUsuario} persona={p} />)}
          {resto > 0 && <MoreTile count={resto} onClick={() => { setGrilla(true); setTodos(true); }} />}
        </div>
      </div>
    );
  }

  const corta = !todos && personas.length > GRILLA;
  const visibles = corta ? personas.slice(0, GRILLA - 1) : personas;
  return (
    <div className="cs-grid" role="group" aria-label="Video de la llamada" style={{ '--cols': columnas(corta ? GRILLA : personas.length) }}>
      {visibles.map((p) => (
        <CallTile key={p.idUsuario} persona={p} big onScreen={() => { setElegida(p.idUsuario); setGrilla(false); }} />
      ))}
      {corta && <MoreTile count={personas.length - visibles.length} onClick={() => setTodos(true)} />}
    </div>
  );
}
