import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../prisma/client.js';
import {AppError} from '../utils/AppError.js';
import {requireConversationParticipant} from './conversationsService.js';
import {areFriends} from './friendsService.js';
import {withChannelPermission} from './channelsService.js';
import {mensajeSelect,toMensaje} from '../utils/messages.js';
import {channelMessageSelect,toChannelMessage} from '../utils/channelMessages.js';
import {emitToChannel,emitToConversation} from '../sockets/emitter.js';
// Las consultas SQL manuales necesitan el esquema explícito, también con poolers.
const schema=new URL(process.env.DATABASE_URL).searchParams.get('schema')||'public';
const messageTable=Prisma.raw(`"${schema.replaceAll('"','""')}"."mensaje"`);
export const REACTIONS=['👍','❤️','😂','😮','😢','🙏'];
const id=z.number().int().positive().max(2147483647);
export const interactionSchema=z.strictObject({accion:z.enum(['reaccionar','fijar','fijados']),idMensaje:id.optional(),idDestino:id.optional(),emoji:z.enum(REACTIONS).nullable().optional(),fijado:z.boolean().optional()}).superRefine((v,c)=>{
 if(v.accion==='fijados'?!v.idDestino:!v.idMensaje)c.addIssue({code:'custom',message:'Indicá el mensaje o destino'});
 if(v.accion==='reaccionar'&&v.emoji===undefined)c.addIssue({code:'custom',message:'Indicá una reacción'});
 if(v.accion==='fijar'&&v.fijado===undefined)c.addIssue({code:'custom',message:'Indicá el estado de fijado'});
});
export async function requireReply(db,idRespuesta,kind,destination){
 if(!idRespuesta)return;
 const m=await db.mensaje.findUnique({where:{id:idRespuesta},select:{idConversacion:true,idCanal:true,fechaEliminacion:true,registroLlamada:true}});
 if(!m||m[kind==='canal'?'idCanal':'idConversacion']!==destination||m.fechaEliminacion||m.registroLlamada)throw new AppError(400,'INVALID_REPLY','El mensaje al que respondés ya no está disponible en este chat');
}
export async function interactMessage(actor,data,kind,authorize){
 const channel=kind==='canal',field=channel?'idCanal':'idConversacion',select=channel?channelMessageSelect:mensajeSelect,dto=channel?toChannelMessage:toMensaje;
 const reference=data.accion==='fijados'?null:await prisma.mensaje.findUnique({where:{id:data.idMensaje},select:{[field]:true}});
 const destination=data.accion==='fijados'?data.idDestino:reference?.[field];
 if(!destination)throw new AppError(404,'MESSAGE_NOT_FOUND','El mensaje no existe');
 const operation=async(db,context)=>{
  if(authorize)await authorize(db);
  if(!channel){const c=await requireConversationParticipant(destination,actor,db);if(data.accion!=='fijados'&&!await areFriends(actor,c.idUsuarioA===actor?c.idUsuarioB:c.idUsuarioA,db))throw new AppError(403,'NOT_FRIENDS','Ya no son amigos');}
  if(data.accion==='fijados'){return {items:(await db.mensaje.findMany({where:{[field]:destination,fechaEliminacion:null,fechaFijado:{not:null}},select,orderBy:[{fechaFijado:'desc'},{id:'desc'}],take:50})).map(dto)};}
  if(channel){const permission=data.accion==='fijar'?'GESTIONAR_CANALES':'ESCRIBIR';if(!context.permisos.includes(permission))throw new AppError(403,'NO_PERMISSION','No tenés permiso para esta acción');}
  // La eliminación y las interacciones comparten el bloqueo de la fila.
  await db.$queryRaw`SELECT id_mensaje FROM ${messageTable} WHERE id_mensaje = ${data.idMensaje} FOR UPDATE`;
  const original=await db.mensaje.findUnique({where:{id:data.idMensaje},select});
  if(!original||original[field]!==destination||original.fechaEliminacion)throw new AppError(409,'MESSAGE_DELETED','El mensaje ya fue eliminado');
  if(original.registroLlamada)throw new AppError(403,'CALL_RECORD_IMMUTABLE','Los registros de llamadas no admiten estas acciones');
  if(data.accion==='fijar'&&data.fijado&&!original.fechaFijado){
   await db.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`pins:${kind}:${destination}`},0))`;
   if(await db.mensaje.count({where:{[field]:destination,fechaEliminacion:null,fechaFijado:{not:null}}})>=50)throw new AppError(409,'PIN_LIMIT','Podés mantener hasta 50 mensajes fijados. Desfijá uno antes de agregar otro.');
  }
  if(data.accion==='fijar')await db.mensaje.update({where:{id:data.idMensaje},data:{fechaFijado:data.fijado?new Date():null}});
  else if(data.emoji===null)await db.reaccionMensaje.deleteMany({where:{idMensaje:data.idMensaje,idUsuario:actor}});
  else await db.reaccionMensaje.upsert({where:{idMensaje_idUsuario:{idMensaje:data.idMensaje,idUsuario:actor}},create:{idMensaje:data.idMensaje,idUsuario:actor,emoji:data.emoji},update:{emoji:data.emoji}});
  return {mensaje:dto(await db.mensaje.findUnique({where:{id:data.idMensaje},select}))};
 };
 const publish=result=>{if(!result.mensaje)return;if(channel)return emitToChannel(destination,'channel-message:updated',result);emitToConversation(destination,'message:updated',result);};
 if(channel)return withChannelPermission(destination,actor,'VER',operation,publish);
 const result=await prisma.$transaction(operation);publish(result);return result;
}
