import { Link, useLocation } from 'react-router';
import { useCall } from '../../hooks/useCall.js';
import { CameraButton, MicrophoneButton } from './CallPanel.jsx';

const ESTADOS = { CONECTANDO: 'Conectando…', CONECTADO: 'En llamada', RECONECTANDO: 'Reconectando…', SALIENDO: 'Saliendo…', ERROR: 'Llamada interrumpida' };

export default function ActiveCallBar() {
  const call = useCall();
  const { pathname } = useLocation();
  if (!call?.canal || !ESTADOS[call.estado]) return null;
  const ruta = `/comunidades/${call.canal.idComunidad}/canales/${call.canal.id}`;
  if (pathname === ruta) return null;
  return <aside className="active-call-bar" aria-label="Llamada activa">
    <p role="status"><strong>{ESTADOS[call.estado]}</strong> · {call.canal.nombre}</p>
    {call.estado === 'ERROR' && call.error && <p className="active-call-error">{call.error.message}</p>}
    <div className="community-actions">
      <Link className="button-link community-secondary-link" to={ruta}>Volver al canal</Link>
      {call.estado !== 'ERROR' && call.misPermisos.includes('HABLAR') && <MicrophoneButton call={call} />}
      {call.estado !== 'ERROR' && call.misPermisos.includes('TRANSMITIR') && <CameraButton call={call} />}
      <button type="button" className="secondary danger" disabled={call.estado === 'SALIENDO'} onClick={call.salir}>
        {call.estado === 'ERROR' ? 'Cerrar' : 'Salir de la llamada'}</button>
    </div>
  </aside>;
}
