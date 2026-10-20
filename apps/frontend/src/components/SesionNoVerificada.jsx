import { useAuth } from '../hooks/useAuth.js';

export default function SesionNoVerificada() {
  const { errorVerificacion, reintentar } = useAuth();
  const motivo =
    errorVerificacion?.code === 'NETWORK_ERROR' ? 'No se pudo conectar con el servidor.' : 'El servidor no responde.';

  return (
    <div className="empty-state app-loading" role="alert">
      <p>{motivo} No pudimos comprobar tu ingreso.</p>
      <button type="button" onClick={reintentar}>
        Reintentar
      </button>
    </div>
  );
}
