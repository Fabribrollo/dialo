import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

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
      {error && <span className="li-error" role="alert"><Icon name="error" size={15} stroke={2} />{error}</span>}
    </>
  );
}
