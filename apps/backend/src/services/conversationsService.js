import { prisma } from '../prisma/client.js';
import { areFriends, getFriendIds } from './friendsService.js';
import { emitToUser, joinConversation } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';
import { mensajeSelect, toMensaje } from '../utils/messages.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';

const conversacionSelect = {
  id: true,
  idUsuarioA: true,
  idUsuarioB: true,
  fechaCreacion: true,
  usuarioA: { select: usuarioPublicoSelect },
  usuarioB: { select: usuarioPublicoSelect },
  mensajes: {
    select: mensajeSelect,
    orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
    take: 1,
  },
};

function parOrdenado(idA, idB) {
  return idA < idB
    ? { idUsuarioA: idA, idUsuarioB: idB }
    : { idUsuarioA: idB, idUsuarioB: idA };
}

function otroId(conversacion, idUsuario) {
  return conversacion.idUsuarioA === idUsuario
    ? conversacion.idUsuarioB
    : conversacion.idUsuarioA;
}

function toConversacion(conversacion, idUsuario, puedeEscribir) {
  const otro = conversacion.idUsuarioA === idUsuario
    ? conversacion.usuarioB
    : conversacion.usuarioA;
  return {
    id: conversacion.id,
    otroUsuario: toUsuarioPublico(otro),
    ultimoMensaje: conversacion.mensajes[0] ? toMensaje(conversacion.mensajes[0]) : null,
    puedeEscribir,
    fechaCreacion: conversacion.fechaCreacion,
  };
}

// También se puede reutilizar desde T-11 antes de operar sobre una conversación.
export async function requireConversationParticipant(idConversacion, idUsuario) {
  const conversacion = await prisma.conversacionPrivada.findUnique({
    where: { id: idConversacion },
    select: conversacionSelect,
  });
  if (!conversacion) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'La conversación no existe');
  }
  if (conversacion.idUsuarioA !== idUsuario && conversacion.idUsuarioB !== idUsuario) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'No participás de esta conversación');
  }
  return conversacion;
}

export async function listConversations(idUsuario) {
  // Una consulta de amistades para toda la lista, en lugar de una por conversación.
  const [conversaciones, idsAmigos] = await Promise.all([
    prisma.conversacionPrivada.findMany({
      where: { OR: [{ idUsuarioA: idUsuario }, { idUsuarioB: idUsuario }] },
      select: conversacionSelect,
    }),
    getFriendIds(idUsuario),
  ]);
  const amigos = new Set(idsAmigos);
  conversaciones.sort((a, b) => {
    const actividadA = a.mensajes[0]?.fechaCreacion ?? a.fechaCreacion;
    const actividadB = b.mensajes[0]?.fechaCreacion ?? b.fechaCreacion;
    return actividadB.getTime() - actividadA.getTime() || b.id - a.id;
  });
  return conversaciones.map((c) => toConversacion(c, idUsuario, amigos.has(otroId(c, idUsuario))));
}

export async function getOrCreateConversation(idUsuario, idDestinatario) {
  if (idUsuario === idDestinatario) {
    throw new AppError(400, 'SELF_CONVERSATION', 'No podés iniciar una conversación con vos mismo');
  }
  if (!(await areFriends(idUsuario, idDestinatario))) {
    throw new AppError(403, 'NOT_FRIENDS', 'Solo podés iniciar conversaciones con tus amigos');
  }

  const par = parOrdenado(idUsuario, idDestinatario);
  const where = { idUsuarioA_idUsuarioB: par };
  let conversacion = await prisma.conversacionPrivada.findUnique({ where, select: conversacionSelect });
  let created = false;
  if (!conversacion) {
    // ON CONFLICT evita duplicados cuando dos solicitudes crean el mismo par.
    // Solo la solicitud que inserta la fila anuncia la nueva conversación.
    const resultado = await prisma.conversacionPrivada.createMany({ data: [par], skipDuplicates: true });
    created = resultado.count === 1;
    conversacion = await prisma.conversacionPrivada.findUnique({ where, select: conversacionSelect });
    if (!conversacion) {
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'La conversación no existe');
    }
  }

  if (created) {
    joinConversation(conversacion.id, [par.idUsuarioA, par.idUsuarioB]);
    for (const id of [par.idUsuarioA, par.idUsuarioB]) {
      emitToUser(id, EVENTS.CONVERSATION_NEW, { conversacion: toConversacion(conversacion, id, true) });
    }
  }
  return { conversacion: toConversacion(conversacion, idUsuario, true), created };
}

export async function getConversation(idConversacion, idUsuario) {
  const conversacion = await requireConversationParticipant(idConversacion, idUsuario);
  const puedeEscribir = await areFriends(idUsuario, otroId(conversacion, idUsuario));
  return toConversacion(conversacion, idUsuario, puedeEscribir);
}

export async function listMessages(idConversacion, idUsuario, { cursor, limit }) {
  await requireConversationParticipant(idConversacion, idUsuario);

  let anteriores = {};
  if (cursor !== undefined) {
    // El cursor debe pertenecer al historial autorizado, no a otro chat.
    const referencia = await prisma.mensaje.findFirst({
      where: { id: cursor, idConversacion },
      select: { id: true, fechaCreacion: true },
    });
    if (!referencia) {
      throw new AppError(400, 'VALIDATION_ERROR', 'El cursor no pertenece a esta conversación', [
        { campo: 'cursor', message: 'Indicá un mensaje existente de esta conversación' },
      ]);
    }
    anteriores = {
      OR: [
        { fechaCreacion: { lt: referencia.fechaCreacion } },
        { fechaCreacion: referencia.fechaCreacion, id: { lt: referencia.id } },
      ],
    };
  }

  const mensajes = await prisma.mensaje.findMany({
    where: { idConversacion, ...anteriores },
    select: mensajeSelect,
    orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hayMas = mensajes.length > limit;
  const pagina = mensajes.slice(0, limit);
  return {
    items: pagina.map(toMensaje),
    nextCursor: hayMas ? pagina[pagina.length - 1].id : null,
  };
}
