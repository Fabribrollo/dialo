import { prisma } from '../prisma/client.js';
import { media } from './mediaService.js';
import { emitToChannel } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

// Cortes de llamadas que usan comunidades, sesiones y permisos (T-40). No tiene efectos al importarse.
// Si LiveKit no responde, el registro igual se borra y la reconciliacion saca la conexion despues.

export async function sacarDeLlamada(idCanal, idUsuario) {
  await media.sacarParticipante(idCanal, idUsuario).catch(() => {});
  emitToChannel(idCanal, EVENTS.CALL_PARTICIPANT_LEFT, { idCanal, idUsuario }).catch((error) => console.error(error));
}

// Borra los registros que cumplen el filtro y saca de la sala a esas personas.
export async function cortarLlamadas(where) {
  const registros = await prisma.participanteLlamada.findMany({ where, select: { idUsuario: true, idCanal: true } });
  if (!registros.length) return [];
  await prisma.participanteLlamada.deleteMany({ where });
  for (const r of registros) await sacarDeLlamada(r.idCanal, r.idUsuario);
  return registros;
}

export async function cerrarSalas(idsCanales) {
  for (const idCanal of idsCanales) await media.cerrarSala(idCanal).catch(() => {});
}
