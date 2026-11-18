import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useCall } from '../../hooks/useCall.js';
import { useCallTime } from '../../hooks/useCallTime.js';
import Avatar, { AvatarGroup } from '../ui/Avatar.jsx';
import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import { useRefraction } from '../ui/Refraction.jsx';
import { SpeakingIcon } from './CallTile.jsx';
import { CameraButton, MicrophoneButton, ScreenButton } from './CallPanel.jsx';
import './calls.css';

const ESTADOS = { CONECTANDO: 'Conectando…', CONECTADO: 'En la llamada', RECONECTANDO: 'Reconectando…', SALIENDO: 'Saliendo…', ERROR: 'Llamada interrumpida' };
const VISIBLES = 3;

export default function ActiveCallBar() {
  const call = useCall();
  const { pathname } = useLocation();
  const [abierta, setAbierta] = useState(false);
  const tiempo = useCallTime(call?.desde);
  const [ref, filtro] = useRefraction({ scale: 26, backdrop: 'blur(6px) saturate(1.6)' });
  if (!call?.canal || !ESTADOS[call.estado]) return null;
  const ruta = `/comunidades/${call.canal.idComunidad}/canales/${call.canal.id}`;
  if (pathname === ruta) return null;
  const personas = call.participantes;
  const resto = personas.length - VISIBLES;
  const activa = call.estado !== 'ERROR';

  return (
    <aside className="acb-wrap" aria-label="Llamada activa">
      <div ref={ref} className="lg dk acb">
        <span className="acb-ic" aria-hidden="true"><SpeakingIcon /></span>
        <span className="acb-text" role="status">
          <b>{ESTADOS[call.estado]} · {call.canal.nombre}</b>
          {!activa && call.error ? <span>{call.error.message}</span> : tiempo && <span>{tiempo}</span>}
        </span>
        {activa && personas.length > 0 && (
          <button type="button" className="pr acb-people" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
            <AvatarGroup people={personas.map((p) => ({ id: p.idUsuario, nombre: p.nombre, foto: p.foto }))} max={VISIBLES} size={26} />
            <span>{abierta ? 'Ver menos' : resto > 0 ? `${resto} más` : 'Ver todos'}</span>
            <span className={`acb-chev ${abierta ? 'is-open' : ''}`}><Icon name="chevron" size={15} stroke={2.2} /></span>
          </button>
        )}
        {activa && call.misPermisos.includes('HABLAR') && <MicrophoneButton call={call} dark />}
        {activa && call.misPermisos.includes('TRANSMITIR') && <CameraButton call={call} dark />}
        {activa && call.pantalla && <ScreenButton call={call} dark />}
        <Link className="acb-back pr" to={ruta}>Volver al canal</Link>
        <button type="button" className="ib pr acb-leave" disabled={call.estado === 'SALIENDO'} onClick={call.salir} aria-label={activa ? 'Salir de la llamada' : 'Cerrar'}>
          <Icon name="cerrarSesion" size={18} stroke={2} />
        </button>
        {filtro}
      </div>
      {activa && abierta && (
        <ul className="lg dk acb-list" aria-label="En la llamada">
          {personas.map((p) => (
            <li key={p.idUsuario} className={`acb-person ${p.hablando ? 'is-speaking' : ''}`}>
              <Avatar nombre={p.nombre} foto={p.foto} size={32} dark={p.local} />
              <span className="acb-person-name">{p.nombre}{p.local && ' (vos)'}</span>
              <span className="acb-person-badges">
                {p.microfono === false && <Badge kind="silenciado" />}
                {p.video && <Badge kind="conCamara" />}
                {p.pantalla && <Badge kind="comparte" />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
