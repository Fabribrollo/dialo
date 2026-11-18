import { useState } from 'react';
import CallTile, { MoreTile, ScreenTile } from './CallTile.jsx';

const TIRA = 5;
const GRILLA = 9;

function columnas(n) {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

export default function CallStage({ personas }) {
  const [grilla, setGrilla] = useState(false);
  const [todos, setTodos] = useState(false);
  const pantalla = personas.find((p) => p.videoPantalla);

  if (pantalla && !grilla) {
    const resto = personas.length - TIRA;
    return (
      <div className="cs-stage" role="group" aria-label="Video de la llamada">
        <ScreenTile persona={pantalla} onGrid={() => setGrilla(true)} />
        <div className="cs-strip">
          {personas.slice(0, resto > 0 ? TIRA : personas.length).map((p) => <CallTile key={p.idUsuario} persona={p} />)}
          {resto > 0 && <MoreTile count={resto} onClick={() => { setGrilla(true); setTodos(true); }} />}
        </div>
      </div>
    );
  }

  const corta = !todos && personas.length > GRILLA;
  const visibles = corta ? personas.slice(0, GRILLA - 1) : personas;
  return (
    <div className="cs-grid" role="group" aria-label="Video de la llamada" style={{ '--cols': columnas(corta ? GRILLA : personas.length) }}>
      {visibles.map((p) => <CallTile key={p.idUsuario} persona={p} big onScreen={() => setGrilla(false)} />)}
      {corta && <MoreTile count={personas.length - visibles.length} onClick={() => setTodos(true)} />}
    </div>
  );
}
