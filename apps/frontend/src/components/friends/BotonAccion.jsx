import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Notice from '../ui/Notice.jsx';

export function BotonAccion({ accion, children, variant = 'secundario', ...props }) {
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState(null);

  async function ejecutar() {
    setPendiente(true);
    setError(null);
    try {
      await accion();
    } catch (e) {
      setError(e.message || 'No se pudo completar. Probá de nuevo.');
    } finally {
      setPendiente(false);
    }
  }

  return (
    <>
      <Button size="sm" variant={variant} loading={pendiente} onClick={ejecutar} {...props}>
        {pendiente ? 'Procesando…' : children}
      </Button>
      {error && <Notice title={error}/>}
    </>
  );
}
