import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useSocket } from '../../hooks/useSocket.js';
import Icon, { Spinner } from '../ui/Icon.jsx';
import { avisosRoot } from './notificationsStore.js';
import { avisar, cerrarAviso, leerAvisos, suscribirAvisos } from './systemToastsStore.js';
import './notificationToasts.css';

const ICONO = { ok: 'check', error: 'error', enlace: 'enlace' };

function Pastilla({ aviso }) {
  useEffect(() => {
    if (!aviso.duracion) return undefined;
    const id = setTimeout(() => cerrarAviso(aviso.key), aviso.duracion);
    return () => clearTimeout(id);
  }, [aviso.key, aviso.duracion]);
  return (
    <li className={`ns ns-${aviso.tipo}`} aria-hidden={aviso.anunciar ? undefined : true}>
      <span className="ns-ic">{aviso.tipo === 'cargando' ? <Spinner size={18} /> : <Icon name={ICONO[aviso.tipo] ?? 'info'} size={17} stroke={2.4} />}</span>
      <span className="ns-text">{aviso.texto}</span>
      {aviso.accion && (
        <button type="button" className="pr ntf-btn" onClick={() => { cerrarAviso(aviso.key); aviso.accion.fn(); }}>{aviso.accion.label}</button>
      )}
    </li>
  );
}

function Invitacion({ aviso }) {
  const navigate = useNavigate();
  const [pausa, setPausa] = useState(false);
  const restante = useRef(12000);
  useEffect(() => {
    if (pausa) return undefined;
    const inicio = Date.now();
    const id = setTimeout(() => cerrarAviso(aviso.key), restante.current);
    return () => { clearTimeout(id); restante.current -= Date.now() - inicio; };
  }, [pausa, aviso.key]);
  const seguir = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPausa(false); };
  const quienes = aviso.total > aviso.personas.length
    ? `${aviso.personas.slice(0, 2).join(', ')} y ${aviso.total - 2} más`
    : aviso.personas.join(aviso.personas.length === 2 ? ' y ' : ', ');
  return (
    <li className={`ntf ${pausa ? 'is-paused' : ''}`} onMouseEnter={() => setPausa(true)} onMouseLeave={seguir} onFocus={() => setPausa(true)} onBlur={seguir}>
      <span className="ntf-av">
        <span className="ntf-com" aria-hidden="true">{aviso.siglas}</span>
        <span className="ntf-origin" aria-hidden="true"><Icon name="canalVoz" size={12} stroke={2.4} /></span>
      </span>
      <div className="ntf-body">
        <p className="ntf-head"><b className="ntf-title">Llamada en {aviso.canal}</b><span className="ntf-time">ahora</span></p>
        <p className="ntf-text">{quienes} {aviso.total === 1 ? 'está' : 'están'} en la llamada · {aviso.comunidad}</p>
        <div className="ntf-actions">
          <button type="button" className="pr ntf-btn ntf-main" onClick={() => { cerrarAviso(aviso.key); navigate(aviso.destino); }}>
            <Icon name="canalVoz" size={15} stroke={2.2} />Unirme
          </button>
          <button type="button" className="pr ntf-btn" onClick={() => cerrarAviso(aviso.key)}>Ahora no</button>
        </div>
      </div>
      <button type="button" className="ntf-close" onClick={() => cerrarAviso(aviso.key)} aria-label={`Cerrar invitación a ${aviso.canal}`}>
        <Icon name="cerrar" size={14} stroke={2.4} />
      </button>
      <span className="ntf-bar" aria-hidden="true" style={{ animationDuration: '12000ms' }} />
    </li>
  );
}

export default function SystemToasts() {
  const lista = useSyncExternalStore(suscribirAvisos, leerAvisos, leerAvisos);
  const socket = useSocket();

  useEffect(() => {
    if (!socket) return undefined;
    let caido = false;
    const caer = () => { caido = true; avisar({ id: 'conexion', tipo: 'cargando', texto: 'Reconectando…' }); };
    const volver = () => {
      if (!caido) return;
      caido = false;
      avisar({ id: 'conexion', tipo: 'ok', texto: 'Conectado de nuevo' });
    };
    socket.on('disconnect', caer);
    socket.on('connect', volver);
    return () => { socket.off('disconnect', caer); socket.off('connect', volver); cerrarAviso('conexion'); };
  }, [socket]);

  const invitaciones = lista.filter((a) => a.tipo === 'invitacion').slice(-2).reverse();
  const pastillas = lista.filter((a) => a.tipo !== 'invitacion').slice(-3);
  return (
    <>
      {invitaciones.length > 0 && createPortal(
        <section className="ntf-zone" aria-label="Llamadas en curso">
          <ol className="ntf-list" aria-live="polite">{invitaciones.map((a) => <Invitacion key={a.key} aviso={a} />)}</ol>
        </section>,
        avisosRoot(),
      )}
      {createPortal(
        <ol className="ns-zone" aria-live="polite" aria-label="Avisos del sistema">
          {pastillas.map((a) => <Pastilla key={a.key} aviso={a} />)}
        </ol>,
        document.body,
      )}
    </>
  );
}
