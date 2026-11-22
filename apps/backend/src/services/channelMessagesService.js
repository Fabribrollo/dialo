import {requireReply} from './messageInteractionsService.js';
import {withSendReceipt,sendFingerprint} from '../utils/sendReceipt.js';
import { trackEffect } from '../utils/backgroundEffects.js';
import { notifyChannelMessage } from './notificationsService.js';
import { getChannelPermissions, withChannelPermission } from './channelsService.js';
import { moderateChannelMessage } from './communityModerationService.js';
import { prisma } from '../prisma/client.js';
import { JERARQUIA } from './communitiesService.js';
import { canModerateChannel } from '../utils/channelPermissions.js';
import { emitToChannel } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';
import { olderMessagesWhere } from '../utils/messages.js';
import { channelMessageSelect, toChannelMessage } from '../utils/channelMessages.js';

const messageNotFound = () => new AppError(404, 'MESSAGE_NOT_FOUND', 'El mensaje no existe');
const deleted = () => new AppError(409, 'MESSAGE_DELETED', 'El mensaje ya fue eliminado');
function requireText(canal) {
  if (canal.tipo !== 'TEXTO') throw new AppError(400, 'CHANNEL_NOT_TEXT', 'El historial y los mensajes corresponden a canales de texto');
}
function requireWrite(permisos) {
  if (!permisos.includes('ESCRIBIR')) throw new AppError(403, 'NO_WRITE_PERMISSION', 'No tenés permiso para escribir en este canal');
}

async function moderateIfWritable(idCanal, idUsuario, contenido) {
  const permisos = await getChannelPermissions(idCanal, idUsuario);
  if (permisos.includes('ESCRIBIR')) await moderateChannelMessage(idCanal, contenido, idUsuario);
}

export async function sendChannelMessage(idUsuario, { idCanal, contenido, idEnvio, idRespuesta, encuesta, idHilo }, authorize) {
  if(idHilo)throw new AppError(410,'THREADS_DISABLED','Los hilos están temporalmente deshabilitados');
  await moderateIfWritable(idCanal, idUsuario, contenido);
  const saved = await withChannelPermission(idCanal, idUsuario, 'VER', async (tx, { canal, permisos }) => {
    if (authorize) await authorize(tx);
    requireText(canal); requireWrite(permisos);
    if(/(?:^|\s)@everyone\b/i.test(contenido)&&!permisos.includes('GESTIONAR_CANALES'))throw new AppError(403,'NO_MENTION_PERMISSION','No tenés permiso para mencionar a todos');
    const rows=await withSendReceipt(tx,idUsuario,idEnvio,sendFingerprint('canal',idCanal,contenido,...(idRespuesta?[idRespuesta]:[]),...(encuesta?[encuesta]:[]),...(idHilo?[idHilo]:[])),channelMessageSelect,async()=>{await requireReply(tx,idRespuesta,'canal',idCanal);if(idHilo){const root=await tx.mensaje.findFirst({where:{id:idHilo,idCanal,idHilo:null,fechaEliminacion:null}});if(!root)throw new AppError(400,'INVALID_THREAD','El hilo no está disponible');}return [await tx.mensaje.create({data:{idCanal,idAutor:idUsuario,contenido,idRespuesta,...(encuesta?{encuesta:{create:encuesta}}:{}),idHilo,},select:channelMessageSelect})];});
    return {mensaje:toChannelMessage(rows[0]),replayed:Boolean(rows.replayed)};
  }, result => {if(!result.replayed)return emitToChannel(idCanal, EVENTS.CHANNEL_MESSAGE_NEW, { mensaje:result.mensaje });});
  if(!saved.replayed&&idHilo){const root=await prisma.mensaje.findUnique({where:{id:idHilo},select:channelMessageSelect});if(root)await emitToChannel(idCanal,EVENTS.CHANNEL_MESSAGE_UPDATED,{mensaje:toChannelMessage(root)});}
  if(!saved.replayed)trackEffect(notifyChannelMessage(idCanal, idUsuario, saved.mensaje.id, contenido));
  return { mensaje: saved.mensaje };
}

async function modifyMessage(idMensaje, idUsuario, authorize, operation, publish) {
  const original = await prisma.mensaje.findUnique({ where: { id: idMensaje }, select: { idCanal: true } });
  if (!original?.idCanal) throw messageNotFound();
  try {
    return await withChannelPermission(original.idCanal, idUsuario, 'VER', async (tx, context) => {
      if (authorize) await authorize(tx);
      requireText(context.canal);
      const mensaje = await tx.mensaje.findUnique({ where: { id: idMensaje }, select: channelMessageSelect });
      if (!mensaje || mensaje.idCanal !== original.idCanal) throw messageNotFound();
      if(mensaje.registroLlamada)throw new AppError(403,'CALL_RECORD_IMMUTABLE','Los registros de llamadas no se pueden modificar');
      return operation(tx, context, mensaje);
    }, publish);
  } catch (error) {
    if (error.code === 'CHANNEL_NOT_FOUND') throw messageNotFound();
    throw error;
  }
}

export async function editChannelMessage(idUsuario, { idMensaje, contenido }, authorize) {
  const actual = await prisma.mensaje.findUnique({ where: { id: idMensaje }, select: { idCanal: true, idAutor: true,adjunto:{select:{id:true}} } });
  if(actual?.adjunto&&actual.idAutor===idUsuario)throw new AppError(403,'ATTACHMENT_NOT_EDITABLE','Los recursos solo se pueden eliminar');
  if (actual?.idCanal && actual.idAutor === idUsuario) await moderateIfWritable(actual.idCanal, idUsuario, contenido);
  const mensaje = await modifyMessage(idMensaje, idUsuario, authorize, async (tx, { permisos }, original) => {
    if (original.idAutor !== idUsuario) throw new AppError(403, 'NOT_AUTHOR', 'Solo el autor puede editar el mensaje');
    if(original.encuesta)throw new AppError(403,'POLL_IMMUTABLE','Las encuestas publicadas no se pueden editar');
    if(original.adjunto)throw new AppError(403,'ATTACHMENT_NOT_EDITABLE','Los recursos solo se pueden eliminar');
    requireWrite(permisos);
    if (original.fechaEliminacion !== null) throw deleted();
    const { count } = await tx.mensaje.updateMany({
      where: { id: idMensaje, idAutor: idUsuario, fechaEliminacion: null }, data: { contenido, fechaEdicion: new Date() },
    });
    if (!count) throw deleted();
    const saved = await tx.mensaje.findUnique({ where: { id: idMensaje }, select: channelMessageSelect });
    if (!saved) throw messageNotFound();
    return toChannelMessage(saved);
  }, (mensaje) => emitToChannel(mensaje.idCanal, EVENTS.CHANNEL_MESSAGE_UPDATED, { mensaje }));
  return { mensaje };
}

export async function deleteChannelMessage(idUsuario, { idMensaje }, authorize) {
  return modifyMessage(idMensaje, idUsuario, authorize, async (tx, context, original) => {
    let permitted = original.idAutor === idUsuario && context.permisos.includes('ESCRIBIR');
    if (original.idAutor !== idUsuario && canModerateChannel(context.rol, context.permisos)) {
      const author = await tx.membresia.findUnique({
        where: { idComunidad_idUsuario: { idComunidad: context.canal.idComunidad, idUsuario: original.idAutor } }, select: { rol: true },
      });
      // Un autor que abandonó no conserva autoridad dentro de la comunidad.
      permitted = author?.rol !== 'PROPIETARIO' && (author?.rol !== 'ADMIN' || context.rol === 'PROPIETARIO');
    }
    if (!permitted) throw new AppError(403, 'CANNOT_DELETE_MESSAGE', 'No podés eliminar este mensaje');
    if (original.fechaEliminacion !== null) throw deleted();
    const { count } = await tx.mensaje.updateMany({
      where: { id: idMensaje, fechaEliminacion: null }, data: { fechaEliminacion: new Date(), idUsuarioEliminacion: idUsuario },
    });
    if (!count) throw deleted();
    return { idMensaje, idCanal: original.idCanal, eliminadoPorModerador: original.idAutor !== idUsuario };
  }, (data) => emitToChannel(data.idCanal, EVENTS.CHANNEL_MESSAGE_DELETED, data));
}

export async function listChannelMessages(idCanal, idUsuario, { cursor, limit = 30 } = {}) {
  // Se coordina con revocaciones, abandono, cambios de tipo y borrado. Cada
  // página revalida VER: no alcanza con conocer un ID o estar en una room.
  return withChannelPermission(idCanal, idUsuario, 'VER', async (tx, { canal }) => {
    requireText(canal);
    let anteriores = {};
    if (cursor !== undefined) {
      const referencia = await tx.mensaje.findFirst({
        where: { id: cursor, idCanal }, select: { id: true, fechaCreacion: true },
      });
      if (!referencia) throw new AppError(400, 'VALIDATION_ERROR', 'El cursor no pertenece a este canal', [
        { campo: 'cursor', message: 'Indicá un mensaje existente de este canal' },
      ]);
      anteriores = olderMessagesWhere(referencia);
    }
    const mensajes = await tx.mensaje.findMany({
      where: { idCanal, idHilo:null, ...anteriores },
      select: channelMessageSelect,
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const pagina = mensajes.slice(0, limit);
    return { items: pagina.map(toChannelMessage), nextCursor: mensajes.length > limit ? pagina.at(-1).id : null };
  });
}
