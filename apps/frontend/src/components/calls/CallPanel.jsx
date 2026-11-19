import { useCall } from '../../hooks/useCall.js';
import { useCallParticipants } from '../../hooks/useCallParticipants.js';
import { useCallTime } from '../../hooks/useCallTime.js';
import { AvatarGroup } from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Icon, { Spinner } from '../ui/Icon.jsx';
import Notice from '../ui/Notice.jsx';
import { useRefraction } from '../ui/Refraction.jsx';
import CallStage from './CallStage.jsx';
import './calls.css';

const ESTADOS = {
  CONECTANDO: 'Conectando a la llamada…',
  CONECTADO: 'Estás en la llamada',
  RECONECTANDO: 'Se cortó la conexión. Reconectando…',
  SALIENDO: 'Saliendo de la llamada…',
};

const PILL = { CONECTANDO: 'Conectando…', CONECTADO: 'En la llamada', RECONECTANDO: 'Reconectando…', SALIENDO: 'Saliendo…' };

const DISPOSITIVOS = {
  MICROPHONE_ERROR: ['No pudimos usar tu micrófono', 'alternarMicrofono'],
  CAMERA_ERROR: ['No pudimos usar tu cámara', 'alternarCamara'],
  SCREEN_ERROR: ['No pudimos compartir tu pantalla', 'alternarPantalla'],
};

export function unirParticipantes(delBack, deLiveKit) {
  const vivos = new Map(deLiveKit.map((p) => [p.idUsuario, p]));
  const lista = delBack.map(({ usuario }) => ({
    ...vivos.get(usuario.id),
    idUsuario: usuario.id,
    nombre: usuario.nombreVisible || usuario.nombreUsuario,
    foto: usuario.fotoUrl,
  }));
  for (const p of deLiveKit) if (!lista.some((l) => l.idUsuario === p.idUsuario)) lista.push(p);
  return lista;
}

function personasConectadas(n) {
  return n === 1 ? 'Hay 1 persona conectada.' : `Hay ${n} personas conectadas.`;
}

export function MicrophoneButton({ call, dark = false }) {
  return (
    <button type="button" className={`ib pr call-ctl ${dark ? 'call-ctl-dk' : 'lg'} ${call.microfono ? '' : 'call-ctl-off'}`} disabled={call.estado !== 'CONECTADO'} onClick={call.alternarMicrofono}
      aria-label={call.microfono ? 'Silenciar micrófono' : 'Activar micrófono'}>
      <Icon name={call.microfono ? 'microfono' : 'silenciado'} size={18} stroke={2} />
    </button>
  );
}

export function CameraButton({ call, dark = false }) {
  return (
    <button type="button" className={`ib pr call-ctl ${dark ? 'call-ctl-dk' : 'lg'} ${call.camara ? 'call-ctl-white' : ''}`} disabled={call.estado !== 'CONECTADO'} onClick={call.alternarCamara}
      aria-label={call.camara ? 'Apagar cámara' : 'Encender cámara'}>
      <Icon name="camara" size={18} stroke={2} />
    </button>
  );
}

export function ScreenButton({ call, dark = false }) {
  return (
    <button type="button" className={`ib pr call-ctl ${dark ? 'call-ctl-dk' : 'lg'} ${call.pantalla ? 'call-ctl-on' : ''}`} disabled={call.estado !== 'CONECTADO'} onClick={call.alternarPantalla}
      aria-label={call.pantalla ? 'Dejar de compartir' : 'Compartir pantalla'}>
      <Icon name="pantalla" size={18} stroke={2} />
    </button>
  );
}

function CallPill({ call, canal, puedeHablar, puedeTransmitir }) {
  const tiempo = useCallTime(call.desde);
  const [ref, filtro] = useRefraction({ scale: 26, backdrop: 'blur(6px) saturate(1.6)' });
  return (
    <div ref={ref} className="lg dk call-pill">
      <span className="call-pill-text">
        <b>{PILL[call.estado]}</b>
        <span>{canal.nombre}{tiempo && ` · ${tiempo}`}</span>
      </span>
      {puedeHablar && <MicrophoneButton call={call} dark />}
      {puedeTransmitir && <CameraButton call={call} dark />}
      {puedeTransmitir && call.puedeCompartirPantalla && <ScreenButton call={call} dark />}
      <span className="call-pill-sep" />
      <button type="button" className="pr call-leave" disabled={call.estado === 'SALIENDO'} aria-label="Salir de la llamada" onClick={call.salir}>
        <Icon name="cerrarSesion" size={17} stroke={2.2} />Salir
      </button>
      {filtro}
    </div>
  );
}

function CallCard({ personas, title, text, note, alert = false, children }) {
  return (
    <div className="call-out">
      <div className="lg call-card">
        {personas.length > 0 && <AvatarGroup people={personas.map((p) => ({ id: p.idUsuario, nombre: p.nombre, foto: p.foto }))} max={4} size={52} />}
        <h2 className="dsp call-card-title">{title}</h2>
        {text && <p className="call-card-text" role={alert ? 'alert' : undefined}>{text}</p>}
        <div className="call-card-actions">{children}</div>
        {note && <span className="call-card-note">{note}</span>}
      </div>
    </div>
  );
}

function errorDeLlamada(error) {
  if (error?.code === 'CALL_CONNECTION_FAILED') return ['No se pudo conectar con el servidor de llamadas', 'Probá de nuevo en unos segundos'];
  return ['Llamada interrumpida', error?.message ?? 'No pudimos reconectarte'];
}

export default function CallPanel({ canal }) {
  const call = useCall();
  const participantes = useCallParticipants(canal.id);
  const enEste = call.canal?.id === canal.id;
  const estado = enEste ? call.estado : 'DESCONECTADO';
  const enLlamada = ['CONECTANDO', 'CONECTADO', 'RECONECTANDO', 'SALIENDO'].includes(estado);
  const puedeHablar = canal.misPermisos.includes('HABLAR') && call.misPermisos.includes('HABLAR');
  const puedeTransmitir = canal.misPermisos.includes('TRANSMITIR') && call.misPermisos.includes('TRANSMITIR');
  const otraLlamada = call.canal && !enEste && call.estado !== 'ERROR' ? call.canal : null;
  const personas = unirParticipantes(participantes.items, enEste && estado === 'CONECTADO' ? call.participantes : []);
  const hablando = personas.find((p) => p.hablando);
  const dispositivo = enEste && DISPOSITIVOS[call.error?.code];

  if (estado === 'ERROR') {
    const [title, text] = errorDeLlamada(call.error);
    const ocupado = call.error?.code === 'ALREADY_IN_CALL';
    return (
      <section className="call" aria-label="Llamada de voz">
        <CallCard personas={[]} title={ocupado ? 'Ya estás en otra llamada' : title} text={ocupado ? call.error.message : text} alert>
          {ocupado
            ? <Button onClick={() => call.entrar(canal, { reemplazar: true })}>Salir de la otra llamada y unirme</Button>
            : <Button onClick={() => call.entrar(canal)}>Reintentar</Button>}
          <Button variant="secundario" onClick={call.salir}>Cerrar</Button>
        </CallCard>
      </section>
    );
  }

  if (!enLlamada) {
    return (
      <section className="call" aria-label="Llamada de voz">
        {participantes.error && <div className="call-notices"><Notice tone="error" title={participantes.error} /></div>}
        {otraLlamada ? (
          <CallCard personas={personas} title={`Estás en la llamada de «${otraLlamada.nombre}»`} text="Solo podés estar en una a la vez">
            <Button onClick={() => call.entrar(canal)}>Cambiar a esta llamada</Button>
          </CallCard>
        ) : personas.length === 0 ? (
          <CallCard personas={[]} title="Todavía no hay nadie conectado" text="Entrá y los demás te van a ver en la lista.">
            <Button onClick={() => call.entrar(canal)}>Unirme a la llamada</Button>
          </CallCard>
        ) : (
          <CallCard personas={personas} title="No estás en esta llamada" text={personasConectadas(personas.length)} note={canal.misPermisos.includes('HABLAR') ? 'Entrás con el micrófono activado y la cámara apagada.' : 'Entrás para escuchar y ver.'}>
            <Button onClick={() => call.entrar(canal)}>Unirme a la llamada</Button>
          </CallCard>
        )}
      </section>
    );
  }

  return (
    <section className="call call-in" aria-label="Llamada de voz">
      <div className="call-top">
        <b className="call-title">{hablando ? `${hablando.nombre} está hablando` : `${personas.length} en la llamada`}</b>
        <span className="call-state" role="status">{estado !== 'CONECTADO' && <Spinner size={13} />}{ESTADOS[estado]}</span>
      </div>

      <div className="call-notices">
        {!canal.misPermisos.includes('HABLAR') && <Notice tone="conflicto" title="Podés escuchar y ver, pero no hablar">En este canal no tenés permiso para usar el micrófono.</Notice>}
        {puedeTransmitir && !call.puedeCompartirPantalla && <Notice tone="conflicto" title="Este navegador no permite compartir pantalla">Probá desde Chrome, Edge, Firefox o Safari en una compu.</Notice>}
        {dispositivo && <Notice tone="error" title={dispositivo[0]} actionLabel="Reintentar" onAction={call[dispositivo[1]]}>{call.error.message}</Notice>}
        {enEste && call.audioBloqueado && <Notice tone="espera" title="El navegador frenó el audio" actionLabel="Activar audio" onAction={call.activarAudio}>Tocá para escuchar a los demás.</Notice>}
        {participantes.error && <Notice tone="error" title={participantes.error} />}
      </div>

      <CallStage personas={personas} onStopShare={call.alternarPantalla} />
      <CallPill call={call} canal={canal} puedeHablar={puedeHablar} puedeTransmitir={puedeTransmitir} />
    </section>
  );
}
