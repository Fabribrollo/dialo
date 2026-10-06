import { prisma } from '../prisma/client.js';
import { requireConversationParticipant } from './conversationsService.js';
import { areFriends } from './friendsService.js';
import { emitToConversation } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';
import { mensajeSelect, toMensaje } from '../utils/messages.js';

export async function sendMessage(idUsuario, { idConversacion, contenido }) {
  const conversacion = await requireConversationParticipant(idConversacion, idUsuario);
  const otroId = conversacion.idUsuarioA === idUsuario ? conversacion.idUsuarioB : conversacion.idUsuarioA;
  if (!(await areFriends(idUsuario, otroId))) {
    throw new AppError(403, 'NOT_FRIENDS', 'Ya no son amigos');
  }
  const mensaje = toMensaje(await prisma.mensaje.create({
    data: { idAutor: idUsuario, idConversacion, contenido },
    select: mensajeSelect,
  }));
  emitToConversation(idConversacion, EVENTS.MESSAGE_NEW, { mensaje });
  return { mensaje };
}

async function requireAuthoredMessage(idMensaje, idUsuario) {
  const mensaje = await prisma.mensaje.findUnique({ where: { id: idMensaje }, select: mensajeSelect });
  if (!mensaje || mensaje.idConversacion === null) {
    throw new AppError(404, 'MESSAGE_NOT_FOUND', 'El mensaje no existe');
  }
  if (mensaje.idAutor !== idUsuario) {
    throw new AppError(403, 'NOT_AUTHOR', 'Solo el autor puede modificar el mensaje');
  }
  await requireConversationParticipant(mensaje.idConversacion, idUsuario);
  if (mensaje.fechaEliminacion !== null) {
    throw new AppError(409, 'MESSAGE_DELETED', 'El mensaje ya fue eliminado');
  }
  return mensaje;
}

// Serializa edición/eliminación del mismo mensaje en este proceso. Así una
// edición pendiente no emite contenido después del evento de eliminación.
// La condición SQL mantiene la eliminación definitiva incluso entre procesos.
const pendientes = new Map();
async function modifyMessage(idMensaje, operation) {
  const anterior = pendientes.get(idMensaje) ?? Promise.resolve();
  const actual = anterior.catch(() => {}).then(operation);
  pendientes.set(idMensaje, actual);
  try {
    return await actual;
  } finally {
    if (pendientes.get(idMensaje) === actual) pendientes.delete(idMensaje);
  }
}

export function editMessage(idUsuario, { idMensaje, contenido }) {
  return modifyMessage(idMensaje, async () => {
    const original = await requireAuthoredMessage(idMensaje, idUsuario);
    const { count } = await prisma.mensaje.updateMany({
      where: { id: idMensaje, idAutor: idUsuario, fechaEliminacion: null },
      data: { contenido, fechaEdicion: new Date() },
    });
    if (!count) throw new AppError(409, 'MESSAGE_DELETED', 'El mensaje ya fue eliminado');
    const stored = await prisma.mensaje.findUnique({ where: { id: idMensaje }, select: mensajeSelect });
    if (!stored) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'El mensaje no existe');
    const mensaje = toMensaje(stored);
    emitToConversation(original.idConversacion, EVENTS.MESSAGE_UPDATED, { mensaje });
    return { mensaje };
  });
}

export function deleteMessage(idUsuario, { idMensaje }) {
  return modifyMessage(idMensaje, async () => {
    const original = await requireAuthoredMessage(idMensaje, idUsuario);
    const { count } = await prisma.mensaje.updateMany({
      where: { id: idMensaje, idAutor: idUsuario, fechaEliminacion: null },
      data: { fechaEliminacion: new Date(), idUsuarioEliminacion: idUsuario },
    });
    if (!count) throw new AppError(409, 'MESSAGE_DELETED', 'El mensaje ya fue eliminado');
    emitToConversation(original.idConversacion, EVENTS.MESSAGE_DELETED, {
      idMensaje, idConversacion: original.idConversacion,
    });
    return { idMensaje };
  });
}
