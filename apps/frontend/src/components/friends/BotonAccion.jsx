import { useState } from "react";

// Botón que ejecuta una acción async: se deshabilita mientras espera y muestra el error si falla.
export function BotonAccion({ accion, children, ...props }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState(null);

  async function ejecutar() {
    setPendiente(true);
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e.message);
    } finally {
      setPendiente(false);
    }
  }

  return (
    <>
      <button type="button" onClick={ejecutar} disabled={pendiente} {...props}>
        {pendiente ? "Procesando…" : children}
      </button>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
