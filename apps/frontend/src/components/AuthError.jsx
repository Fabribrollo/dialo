import Notice from './ui/Notice.jsx';

const textos = {
  INVALID_CREDENTIALS: ['error', 'Usuario o contraseña incorrectos', 'Revisá los datos y probá de nuevo.'],
  RATE_LIMITED: ['espera', 'Demasiados intentos', 'Esperá unos minutos antes de volver a intentar.'],
};

export default function AuthError({ error, rateLimitText }) {
  if (!error || error.details?.length) return null;
  const [tone, title, text] = textos[error.code] ?? ['error', error.message, null];
  return <Notice tone={tone} title={title}>{error.code === 'RATE_LIMITED' && rateLimitText ? rateLimitText : text}</Notice>;
}
