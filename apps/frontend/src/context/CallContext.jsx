import { useSocket } from '../hooks/useSocket.js';
import { useAuth } from '../hooks/useAuth.js';
import { createContext, useEffect, useRef, useState } from 'react';
let DisconnectReason, Room, RoomEvent, Track;
let mediaImport;
function loadMedia(){return mediaImport??=(import('livekit-client').then(sdk=>{({DisconnectReason,Room,RoomEvent,Track}=sdk);}).catch(e=>{mediaImport=null;throw e;}));}
import { ApiError } from '../services/api.js';
import { joinCall, leaveCall } from '../services/callsService.js';

export const CallContext = createContext(null);

const ACTIVOS = ['CONECTANDO', 'CONECTADO', 'RECONECTANDO'];

const eventosDeParticipantes = () => [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
];

const desconexionesFinales = () => ({
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Saliste de la llamada desde otro lugar o perdiste el acceso al canal.',
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Entraste a esta llamada desde otra pestaña o dispositivo.',
  [DisconnectReason.ROOM_DELETED]: 'La llamada terminó.',
});

const ERRORES_DE_MICROFONO = {
  NotAllowedError: 'El navegador no dio permiso para usar el micrófono.',
  SecurityError: 'El navegador no dio permiso para usar el micrófono.',
  NotFoundError: 'No se encontró ningún micrófono.',
  NotReadableError: 'El micrófono está ocupado por otra aplicación.',
};

const ERRORES_DE_CAMARA = {
  NotAllowedError: 'El navegador no dio permiso para usar la cámara.',
  SecurityError: 'El navegador no dio permiso para usar la cámara.',
  NotFoundError: 'No se encontró ninguna cámara.',
  NotReadableError: 'La cámara está ocupada por otra aplicación.',
};

const errorDeMicrofono = (e) => ({ code: 'MICROPHONE_ERROR', message: ERRORES_DE_MICROFONO[e?.name] ?? 'No se pudo usar el micrófono.', details: [] });
const errorDeCamara = (e) => ({ code: 'CAMERA_ERROR', message: ERRORES_DE_CAMARA[e?.name] ?? 'No se pudo usar la cámara.', details: [] });

const soportaPantalla = () => typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

function errorDePantalla(e) {
  if (e?.name === 'NotAllowedError' && !/system/i.test(e.message ?? '')) return null;
  const mensaje = e?.name === 'NotAllowedError' ? 'El sistema operativo no le permite al navegador compartir la pantalla.'
    : e?.name === 'NotFoundError' ? 'No hay pantallas o ventanas disponibles para compartir.'
      : 'No se pudo compartir la pantalla.';
  return { code: 'SCREEN_ERROR', message: mensaje, details: [] };
}

function pistaDe(p, fuente) {
  const publicacion = p.getTrackPublication?.(fuente);
  return publicacion && !publicacion.isMuted ? publicacion.track ?? null : null;
}

const idUsuarioDe = (identidad) => Number(identidad?.replace('usuario-', '')) || null;

function leerParticipantes(room) {
  return [room.localParticipant, ...room.remoteParticipants.values()].map((p) => {
    const camara = Boolean(p.isCameraEnabled);
    const pantalla = Boolean(p.isScreenShareEnabled);
    return {
      idUsuario: idUsuarioDe(p.identity),
      nombre: p.name,
      local: Boolean(p.isLocal),
      microfono: Boolean(p.isMicrophoneEnabled),
      hablando: Boolean(p.isSpeaking),
      camara,
      video: camara ? pistaDe(p, Track.Source.Camera) : null,
      pantalla,
      videoPantalla: pantalla ? pistaDe(p, Track.Source.ScreenShare) : null,
    };
  });
}

function aError(e) {
  if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details };
  return { code: e?.code ?? 'CALL_CONNECTION_FAILED', message: e?.message ?? 'No se pudo conectar con el servidor de llamadas.', details: [] };
}

export function CallProvider({ children }) {
  const { usuario } = useAuth() || {};
  const socket=useSocket();
  const preferenciasRef = useRef(usuario?.preferencias || {});
  preferenciasRef.current = usuario?.preferencias || {};
  async function elegirDispositivo(kind, deviceId) {
    await roomRef.current?.switchActiveDevice(kind, deviceId);
  }
  const [estado, setEstado] = useState('DESCONECTADO');
  const [canal, setCanal] = useState(null);
  const [error, setError] = useState(null);
  const [misPermisos, setMisPermisos] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const [desde, setDesde] = useState(null);
  const roomRef = useRef(null);
  const canalRef = useRef(null);
  const intentoRef = useRef(0);
  const audiosRef = useRef(null);

  useEffect(()=>{
    if(!socket)return;
    const updated=async({canal:next})=>{
      if(next?.id!==canalRef.current?.id)return;
      canalRef.current=next;setCanal(next);setMisPermisos(next.misPermisos);
      const room=roomRef.current;if(!room)return;
      const permissions=next.misPermisos;
      const legacy=permissions.includes('TRANSMITIR');
      await Promise.allSettled([
        ...(!permissions.includes('HABLAR')&&room.localParticipant.isMicrophoneEnabled?[room.localParticipant.setMicrophoneEnabled(false)]:[]),
        ...(!permissions.includes('CAMARA')&&!legacy&&room.localParticipant.isCameraEnabled?[room.localParticipant.setCameraEnabled(false)]:[]),
        ...(!permissions.includes('PANTALLA')&&!legacy&&room.localParticipant.isScreenShareEnabled?[room.localParticipant.setScreenShareEnabled(false)]:[]),
      ]);
      if(room===roomRef.current)setParticipantes(leerParticipantes(room));
    };
    const lost=({idCanal})=>{if(idCanal===canalRef.current?.id)void salir();};
    const left=({idComunidad})=>{if(idComunidad===canalRef.current?.idComunidad)void salir();};
    socket.on('channel:updated',updated);socket.on('channel:access-lost',lost);socket.on('channel:deleted',lost);socket.on('community:left',left);
    return()=>{socket.off('channel:updated',updated);socket.off('channel:access-lost',lost);socket.off('channel:deleted',lost);socket.off('community:left',left);};
  },[socket]);

  function soltarRoom() {
    const room = roomRef.current;
    roomRef.current = null;
    room?.removeAllListeners();
    audiosRef.current?.replaceChildren();
    return room;
  }

  function fallar(e) {
    setEstado('ERROR');
    setError(aError(e));
    setMisPermisos([]);
    setParticipantes([]);
    setDesde(null);
  }

  function escuchar(room, destino) {
    const refrescar = () => setParticipantes(leerParticipantes(room));
    eventosDeParticipantes().forEach((evento) => room.on(evento, refrescar));
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) audiosRef.current?.append(track.attach());
      refrescar();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) track.detach().forEach((elemento) => elemento.remove());
      refrescar();
    });
    room.on(RoomEvent.MediaDevicesError, (e, tipo) => {
      setError(tipo === 'videoinput' ? errorDeCamara(e) : errorDeMicrofono(e));
      refrescar();
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBloqueado(!room.canPlaybackAudio));
    room.on(RoomEvent.Reconnecting, () => setEstado('RECONECTANDO'));
    room.on(RoomEvent.Reconnected, () => setEstado('CONECTADO'));
    room.on(RoomEvent.Disconnected, (razon) => perderConexion(destino, razon));
  }

  async function conectar(destino, intento, { reemplazar = false, microfono = false } = {}) {
    await loadMedia();
    if(intento !== intentoRef.current)return;
    let respuesta;
    try {
      respuesta = await joinCall(destino.id);
    } catch (e) {
      if (!reemplazar || e?.code !== 'ALREADY_IN_CALL') throw e;
      await leaveCall(e.details[0].idCanal);
      respuesta = await joinCall(destino.id);
    }
    if (intento !== intentoRef.current) {
      leaveCall(destino.id).catch(() => {});
      return;
    }
    const { llamada } = respuesta;
    setMisPermisos(llamada.misPermisos);
    const room = new Room();
    roomRef.current = room;
    escuchar(room, destino);
    try {
      await room.connect(llamada.url, llamada.token);
      for (const [kind, key] of [['audioinput','audioInput'],['audiooutput','audioOutput'],['videoinput','videoInput']]) {
        const id = preferenciasRef.current[key];
        if (id && room.switchActiveDevice) await room.switchActiveDevice(kind,id).catch(() => {});
      }
    } catch {
      if (intento !== intentoRef.current) return;
      soltarRoom()?.disconnect();
      leaveCall(destino.id).catch(() => {});
      throw new Error('No se pudo conectar con el servidor de llamadas.');
    }
    if (intento !== intentoRef.current) return;
    if (microfono && llamada.misPermisos.includes('HABLAR')) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (e) {
        setError(errorDeMicrofono(e));
      }
      if (intento !== intentoRef.current) return;
    }
    setDesde((d) => d ?? Date.now());
    setEstado('CONECTADO');
    setParticipantes(leerParticipantes(room));
    setAudioBloqueado(!room.canPlaybackAudio);
    room.startAudio().catch(() => {});
  }

  async function perderConexion(destino, razon) {
    soltarRoom();
    setParticipantes([]);
    const final = desconexionesFinales()[razon];
    if (final) {
      canalRef.current = null;
      fallar({ code: 'CALL_ENDED', message: final });
      return;
    }
    const intento = ++intentoRef.current;
    setEstado('RECONECTANDO');
    try {
      await conectar(destino, intento);
    } catch (e) {
      if (intento === intentoRef.current) fallar(e);
    }
  }

  async function salir() {
    intentoRef.current += 1;
    const anterior = canalRef.current;
    canalRef.current = null;
    setEstado('SALIENDO');
    await soltarRoom()?.disconnect();
    if (anterior) await leaveCall(anterior.id).catch(() => {});
    setCanal(null);
    setError(null);
    setMisPermisos([]);
    setParticipantes([]);
    setAudioBloqueado(false);
    setDesde(null);
    setEstado('DESCONECTADO');
  }

  async function entrar(destino, opciones) {
    if (canalRef.current?.id === destino.id && ACTIVOS.includes(estado)) return;
    if (canalRef.current || roomRef.current) await salir();
    const intento = ++intentoRef.current;
    canalRef.current = destino;
    setCanal(destino);
    setError(null);
    setEstado('CONECTANDO');
    try {
      await conectar(destino, intento, { ...opciones, microfono: true });
    } catch (e) {
      if (intento === intentoRef.current) fallar(e);
    }
  }

  async function alternarDispositivo(permiso, estaActivo, cambiar, errorDe) {
    const room = roomRef.current;
    if (!room || !(misPermisos.includes(permiso)||(['CAMARA','PANTALLA'].includes(permiso)&&misPermisos.includes('TRANSMITIR')))) return;
    const local = room.localParticipant;
    try {
      await cambiar(local, !estaActivo(local));
      setError(null);
    } catch (e) {
      setError(errorDe(e));
    }
    setParticipantes(leerParticipantes(room));
  }

  function alternarPantalla() {
    if (!soportaPantalla()) {
      setError({ code: 'SCREEN_UNSUPPORTED', message: 'Este navegador no permite compartir pantalla. Usá Chrome, Edge, Firefox o Safari en una computadora.', details: [] });
      return Promise.resolve();
    }
    return alternarDispositivo('PANTALLA', (l) => l.isScreenShareEnabled, (l, v) => l.setScreenShareEnabled(v, { audio: true }), errorDePantalla);
  }

  const alternarMicrofono = () => alternarDispositivo('HABLAR', (l) => l.isMicrophoneEnabled, (l, v) => l.setMicrophoneEnabled(v), errorDeMicrofono);
  const alternarCamara = () => alternarDispositivo('CAMARA', (l) => l.isCameraEnabled, (l, v) => l.setCameraEnabled(v), errorDeCamara);

  function activarAudio() {
    const room = roomRef.current;
    room?.startAudio().then(() => setAudioBloqueado(!room.canPlaybackAudio)).catch(() => {});
  }

  useEffect(() => () => {
    intentoRef.current += 1;
    const anterior = canalRef.current;
    canalRef.current = null;
    soltarRoom()?.disconnect();
    if (anterior) leaveCall(anterior.id).catch(() => {});
  }, []);

  const yo = participantes.find((p) => p.local);
  const value = {
    estado, canal, error, misPermisos, participantes, audioBloqueado, desde,
    microfono: yo?.microfono ?? false, camara: yo?.camara ?? false, pantalla: yo?.pantalla ?? false, puedeCompartirPantalla: soportaPantalla(),
        elegirDispositivo, entrar, salir, alternarMicrofono, alternarCamara, alternarPantalla, activarAudio,
  };

  return <CallContext.Provider value={value}>
    {children}
    <div ref={audiosRef} hidden />
  </CallContext.Provider>;
}
