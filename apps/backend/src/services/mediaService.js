import { randomUUID } from 'node:crypto';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Vida corta: un token viejo deja de servir para reingresar en pocos minutos.
export const TOKEN_TTL_SEGUNDOS = 10 * 60;
const TIMEOUT_MS = 3000;

const FUENTES = {
  microfono: [TrackSource.MICROPHONE],
  camara: [TrackSource.CAMERA],
  pantalla: [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO],
};

export const salaDeCanal = (idCanal) => `canal-${idCanal}`;
export const identidadDeUsuario = (idUsuario) => `usuario-${idUsuario}`;
export function idCanalDeSala(sala) {
  const match = /^canal-(\d+)$/.exec(sala ?? '');
  return match ? Number(match[1]) : null;
}
export function idUsuarioDeIdentidad(identidad) {
  const match = /^usuario-(\d+)$/.exec(identidad ?? '');
  return match ? Number(match[1]) : null;
}
function leerIngreso(metadata) {
  try { return JSON.parse(metadata).ingreso ?? null; } catch { return null; }
}

const noDisponible = () => new AppError(503, 'MEDIA_UNAVAILABLE', 'Las llamadas no estan disponibles en este momento');
const esNoEncontrado = (error) => error?.code === 'not_found' || error?.status === 404;

// Unico lugar que habla con LiveKit. El resto del backend usa estas funciones.
export function crearAdaptadorMedia({ url, apiKey, apiSecret, roomService } = {}) {
  const configurado = Boolean(url && apiKey && apiSecret);
  const rooms = roomService ?? (configurado ? new RoomServiceClient(url.replace(/^ws/, 'http'), apiKey, apiSecret) : null);
  const receptor = configurado ? new WebhookReceiver(apiKey, apiSecret) : null;

  const exigir = () => { if (!configurado) throw noDisponible(); };
  // Una llamada a LiveKit que no responde no puede trabar al backend.
  const conLimite = (promesa) => {
    let timer;
    const limite = new Promise((_, reject) => { timer = setTimeout(() => reject(noDisponible()), TIMEOUT_MS); });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(timer));
  };

  return {
    configurado,

    // Credencial para la sala de un canal. Las fuentes que puede publicar salen de sus permisos:
    // microfono con HABLAR, camara y pantalla con TRANSMITIR. Sin fuentes solo puede escuchar y ver.
    async crearToken({ idUsuario, nombre, idCanal, fuentes = [], ingreso = randomUUID() }) {
      exigir();
      const token = new AccessToken(apiKey, apiSecret, {
        identity: identidadDeUsuario(idUsuario),
        name: nombre,
        ttl: TOKEN_TTL_SEGUNDOS,
        metadata: JSON.stringify({ ingreso }),
      });
      token.addGrant({
        room: salaDeCanal(idCanal),
        roomJoin: true,
        canSubscribe: true,
        canPublish: fuentes.length > 0,
        canPublishData: false,
        canPublishSources: fuentes.flatMap((fuente) => FUENTES[fuente] ?? []),
      });
      return { token: await token.toJwt(), url, sala: salaDeCanal(idCanal), ingreso, expiraEn: TOKEN_TTL_SEGUNDOS };
    },

    // Corta la conexion activa. Devuelve false si el usuario ya no estaba en la sala.
    async sacarParticipante(idCanal, idUsuario) {
      exigir();
      try {
        await conLimite(rooms.removeParticipant(salaDeCanal(idCanal), identidadDeUsuario(idUsuario)));
        return true;
      } catch (error) {
        if (esNoEncontrado(error)) return false;
        throw noDisponible();
      }
    },

    async listarParticipantes(idCanal) {
      exigir();
      try {
        const lista = await conLimite(rooms.listParticipants(salaDeCanal(idCanal)));
        return lista.map((p) => ({ idUsuario: idUsuarioDeIdentidad(p.identity), ingreso: leerIngreso(p.metadata) }));
      } catch (error) {
        if (esNoEncontrado(error)) return [];
        throw noDisponible();
      }
    },

    async verificarDisponibilidad() {
      if (!configurado) return { disponible: false, motivo: 'NO_CONFIGURADO' };
      try {
        await conLimite(rooms.listRooms());
        return { disponible: true };
      } catch {
        return { disponible: false, motivo: 'SIN_CONEXION' };
      }
    },

    // Verifica la firma del evento que manda LiveKit antes de usarlo.
    async recibirEvento(cuerpo, autorizacion) {
      exigir();
      try {
        const evento = await receptor.receive(cuerpo, autorizacion);
        return {
          tipo: evento.event,
          sala: evento.room?.name ?? null,
          idUsuario: idUsuarioDeIdentidad(evento.participant?.identity),
          ingreso: leerIngreso(evento.participant?.metadata),
          id: evento.id,
          fecha: Number(evento.createdAt ?? 0),
        };
      } catch {
        throw new AppError(401, 'INVALID_WEBHOOK', 'Evento de LiveKit no autenticado');
      }
    },
  };
}

export const media = crearAdaptadorMedia({ url: env.livekitUrl, apiKey: env.livekitApiKey, apiSecret: env.livekitApiSecret });

const oyentes = new Set();
// T-35 se registra aca para mantener los participantes reales y revisar cada ingreso.
export function onMediaEvent(oyente) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}
export async function notificarEventoMedia(evento) {
  for (const oyente of oyentes) {
    try { await oyente(evento); } catch (error) { console.error(error); }
  }
}
