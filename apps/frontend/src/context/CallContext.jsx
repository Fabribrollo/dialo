import { createContext, useEffect, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';
import { ApiError } from '../services/api.js';
import { joinCall, leaveCall } from '../services/callsService.js';

export const CallContext = createContext(null);

const ACTIVOS = ['CONECTANDO', 'CONECTADO', 'RECONECTANDO'];

const EVENTOS_DE_PARTICIPANTES = [
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

const DESCONEXIONES_FINALES = {
  [DisconnectReason.PARTICIPANT_REMOVED]: 'Saliste de la llamada desde otro lugar o perdiste el acceso al canal.',
  [DisconnectReason.DUPLICATE_IDENTITY]: 'Entraste a esta llamada desde otra pestaña o dispositivo.',
  [DisconnectReason.ROOM_DELETED]: 'La llamada terminó.',
};

const ERRORES_DE_MICROFONO = {
  NotAllowedError: 'El navegador no dio permiso para usar el micrófono.',
  SecurityError: 'El navegador no dio permiso para usar el micrófono.',
  NotFoundError: 'No se encontró ningún micrófono.',
  NotReadableError: 'El micrófono está ocupado por otra aplicación.',
};

const idUsuarioDe = (identidad) => Number(identidad?.replace('usuario-', '')) || null;

function leerParticipantes(room) {
  return [room.localParticipant, ...room.remoteParticipants.values()].map((p) => ({
    idUsuario: idUsuarioDe(p.identity),
    nombre: p.name,
    local: Boolean(p.isLocal),
    microfono: Boolean(p.isMicrophoneEnabled),
    hablando: Boolean(p.isSpeaking),
  }));
}

function aError(e) {
  if (e instanceof ApiError) return { code: e.code, message: e.message, details: e.details };
  return { code: e?.code ?? 'CALL_CONNECTION_FAILED', message: e?.message ?? 'No se pudo conectar con el servidor de llamadas.', details: [] };
}

export function CallProvider({ children }) {
  const [estado, setEstado] = useState('DESCONECTADO');
  const [canal, setCanal] = useState(null);
  const [error, setError] = useState(null);
  const [misPermisos, setMisPermisos] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const roomRef = useRef(null);
  const canalRef = useRef(null);
  const intentoRef = useRef(0);
  const audiosRef = useRef(null);

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
  }

  function escuchar(room, destino) {
    const refrescar = () => setParticipantes(leerParticipantes(room));
    EVENTOS_DE_PARTICIPANTES.forEach((evento) => room.on(evento, refrescar));
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) audiosRef.current?.append(track.attach());
      refrescar();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((elemento) => elemento.remove());
      refrescar();
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBloqueado(!room.canPlaybackAudio));
    room.on(RoomEvent.Reconnecting, () => setEstado('RECONECTANDO'));
    room.on(RoomEvent.Reconnected, () => setEstado('CONECTADO'));
    room.on(RoomEvent.Disconnected, (razon) => perderConexion(destino, razon));
  }

  async function conectar(destino, intento, { reemplazar = false } = {}) {
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
    } catch {
      if (intento !== intentoRef.current) return;
      soltarRoom()?.disconnect();
      leaveCall(destino.id).catch(() => {});
      throw new Error('No se pudo conectar con el servidor de llamadas.');
    }
    if (intento !== intentoRef.current) return;
    setEstado('CONECTADO');
    setParticipantes(leerParticipantes(room));
    setAudioBloqueado(!room.canPlaybackAudio);
    room.startAudio().catch(() => {});
  }

  async function perderConexion(destino, razon) {
    soltarRoom();
    setParticipantes([]);
    const final = DESCONEXIONES_FINALES[razon];
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
      await conectar(destino, intento, opciones);
    } catch (e) {
      if (intento === intentoRef.current) fallar(e);
    }
  }

  async function alternarMicrofono() {
    const room = roomRef.current;
    if (!room || !misPermisos.includes('HABLAR')) return;
    const local = room.localParticipant;
    try {
      await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      setError(null);
    } catch (e) {
      setError({ code: 'MICROPHONE_ERROR', message: ERRORES_DE_MICROFONO[e?.name] ?? 'No se pudo usar el micrófono.', details: [] });
    }
    setParticipantes(leerParticipantes(room));
  }

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

  const microfono = participantes.find((p) => p.local)?.microfono ?? false;
  const value = {
    estado, canal, error, misPermisos, participantes, microfono, audioBloqueado,
    entrar, salir, alternarMicrofono, activarAudio,
  };

  return <CallContext.Provider value={value}>
    {children}
    <div ref={audiosRef} hidden />
  </CallContext.Provider>;
}
