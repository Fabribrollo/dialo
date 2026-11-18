import { useAuth } from '../hooks/useAuth.js';
import { BootError } from './shell/BootScreen.jsx';

export default function SesionNoVerificada() {
  const { errorVerificacion, reintentar } = useAuth();
  const title = errorVerificacion?.code === 'NETWORK_ERROR' ? 'No se pudo conectar con el servidor' : 'El servidor no responde';
  return <BootError title={title} onRetry={reintentar} />;
}
