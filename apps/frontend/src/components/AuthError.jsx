import { useEffect, useState } from 'react';
import Notice from './ui/Notice.jsx';

const textos = {
  INVALID_CREDENTIALS: ['error', 'Usuario o contraseña incorrectos', 'Revisá los datos y probá de nuevo.'],
  RATE_LIMITED: ['espera', 'Demasiados intentos', 'Esperá unos minutos antes de volver a intentar.'],
};

export default function AuthError({ error, rateLimitText }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    setRemaining(error?.retryAfter || 0);
    if (!error?.retryAfter) return;
    const end = Date.now() + error.retryAfter * 1000;
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [error]);
  if (!error || error.details?.length) return null;
  const [tone, title, text] = textos[error.code] ?? ['error', error.message, null];
  return <Notice tone={tone} title={title}>{remaining > 0 ? `Podés reintentar en ${remaining} segundos.` : error.code === 'RATE_LIMITED' && rateLimitText ? rateLimitText : text}</Notice>;
}
