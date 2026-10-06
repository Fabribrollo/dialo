import { useState } from 'react';

export function useSubmit(action) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function submit(...args) {
    setEnviando(true);
    setError(null);
    try {
      await action(...args);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setEnviando(false);
    }
  }

  const errorDe = (campo) => error?.details?.find((detalle) => detalle.campo === campo)?.message;

  return { submit, enviando, error, errorDe };
}
