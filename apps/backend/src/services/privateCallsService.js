import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma/client.js';
import { requireConversationParticipant } from './conversationsService.js';
import { areFriends } from './friendsService.js';
import { findAuthUserBySessionId } from './authService.js';
import { media, onMediaEvent } from './mediaService.js';
import { onSessionEnded, emitToUser, emitToConversation } from '../sockets/emitter.js';
import { usuarioPublicoSelect, toUsuarioPublico } from '../utils/selects.js';
import { mensajeSelect, toMensaje } from '../utils/messages.js';
import { AppError } from '../utils/AppError.js';

const active = ['LLAMANDO','ACEPTADA'];
const people = { emisor:{select:usuarioPublicoSelect}, receptor:{select:usuarioPublicoSelect} };
const own = (c,id) => c.idEmisor === id || c.idReceptor === id;
const room = (id) => `privada-${id}`;
const shape = ({emisor,receptor,sesionEmisor,sesionReceptor,...c}) => ({...c,emisor:toUsuarioPublico(emisor),receptor:toUsuarioPublico(receptor)});
export async function lockCallUsers(tx, users) {
  for(const id of [...new Set(users)].sort((a,b)=>a-b)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(9321, ${id}::integer)`;
}
async function getCall(id,actor,db=prisma) {
  const c=await db.llamadaPrivada.findUnique({where:{id},include:people});
  if(!c||!own(c,actor))throw new AppError(404,'CALL_NOT_FOUND','La llamada no está disponible');
  return c;
}
function announce(c) { for(const id of [c.idEmisor,c.idReceptor])emitToUser(id,'private-call:changed',{llamada:shape(c)}); }
export async function startPrivateCall(actor,session,{idConversacion,video}) {
  if(!media.configurado)throw new AppError(503,'MEDIA_UNAVAILABLE','Las llamadas no están configuradas');
  const c=await requireConversationParticipant(idConversacion,actor.id);
  const other=c.idUsuarioA===actor.id?c.idUsuarioB:c.idUsuarioA;
  if(!await areFriends(actor.id,other))throw new AppError(403,'NOT_FRIENDS','Solo podés llamar a tus amigos');
  const saved=await prisma.$transaction(async(tx)=>{
    await lockCallUsers(tx,[actor.id,other]);
    const privateBusy=await tx.llamadaPrivada.count({where:{estado:{in:active},OR:[{idEmisor:{in:[actor.id,other]}},{idReceptor:{in:[actor.id,other]}}]}});
    const channelBusy=await tx.participanteLlamada.count({where:{idUsuario:{in:[actor.id,other]}}});
    if(privateBusy||channelBusy)return null;
    return tx.llamadaPrivada.create({data:{id:randomUUID(),idConversacion,idEmisor:actor.id,idReceptor:other,sesionEmisor:session,video},include:people});
  });
  if (!saved) {
    const mensaje = toMensaje(await prisma.mensaje.create({ data: {idConversacion,idAutor:actor.id,contenido:'Llamada no iniciada: línea ocupada.'}, select:mensajeSelect }));
    emitToConversation(idConversacion,'message:new',{mensaje});
    throw new AppError(409,'CALL_BUSY','Una de las personas ya está en una llamada');
  }
  announce(saved);return shape(saved);
}
export async function currentPrivateCall(user) {
  const c=await prisma.llamadaPrivada.findFirst({where:{estado:{in:active},OR:[{idEmisor:user},{idReceptor:user}]},orderBy:{fechaCreacion:'desc'},include:people});
  return c?shape(c):null;
}
export async function acceptPrivateCall(id,user,session) {
  const initial=await getCall(id,user);
  if(initial.idReceptor!==user)throw new AppError(403,'CALL_FORBIDDEN','Solo quien recibe puede aceptar');
  const c=await prisma.$transaction(async(tx)=>{
    await lockCallUsers(tx,[initial.idEmisor,initial.idReceptor]);
    const actual=await getCall(id,user,tx);
    if(actual.estado==='ACEPTADA') {
      if(actual.sesionReceptor!==session)throw new AppError(409,'CALL_BUSY','Ya aceptaste desde otra sesión');
      return actual;
    }
    if(actual.estado!=='LLAMANDO'||Date.now()-actual.fechaCreacion.getTime()>60000)throw new AppError(409,'CALL_EXPIRED','La llamada ya terminó');
    if(actual.sesionEmisor && !await findAuthUserBySessionId(actual.sesionEmisor))throw new AppError(409,'CALL_EXPIRED','La sesión de quien llamó terminó');
    if(!await areFriends(actual.idEmisor,actual.idReceptor))throw new AppError(403,'NOT_FRIENDS','Ya no son amigos');
    return tx.llamadaPrivada.update({where:{id},data:{estado:'ACEPTADA',sesionReceptor:session},include:people});
  });
  announce(c);return shape(c);
}
export async function finishPrivateCall(id,user,state='FINALIZADA') {
  const initial=await getCall(id,user);
  const result=await prisma.$transaction(async(tx)=>{
    await lockCallUsers(tx,[initial.idEmisor,initial.idReceptor]);
    const c=await getCall(id,user,tx);
    if(!active.includes(c.estado))return null;
    const estado=c.estado==='LLAMANDO'?(state==='PERDIDA'?'PERDIDA':c.idReceptor===user?'RECHAZADA':'CANCELADA'):'FINALIZADA';
    const saved=await tx.llamadaPrivada.update({where:{id},data:{estado,fechaFin:new Date()},include:people});
    const message=toMensaje(await tx.mensaje.create({data:{idConversacion:c.idConversacion,idAutor:c.idEmisor,contenido:`Llamada ${c.video?'de video':'de voz'}: ${estado.toLowerCase()}.`},select:mensajeSelect}));
    return {saved,message};
  });
  if(result) {
    announce(result.saved);
    emitToConversation(result.saved.idConversacion,'message:new',{mensaje:result.message});
    await media.cerrarPrivada(room(id)).catch(()=>{});
  }
}
export async function privateCallToken(id,user,session) {
  const c=await getCall(id,user.id);
  const expected=c.idEmisor===user.id?c.sesionEmisor:c.sesionReceptor;
  if(c.estado!=='ACEPTADA'||expected!==session)throw new AppError(403,'CALL_FORBIDDEN','Esta sesión no aceptó la llamada');
  if(!await areFriends(c.idEmisor,c.idReceptor))throw new AppError(403,'NOT_FRIENDS','Ya no son amigos');
  if(expected&&!await findAuthUserBySessionId(expected))throw new AppError(401,'UNAUTHORIZED','La sesión terminó');
  return media.crearTokenPrivado({sala:room(c.id),idUsuario:user.id,nombre:user.nombreVisible,ingreso:c.id,video:c.video});
}
export async function reconcilePrivateCalls() {
  if (!media.configurado) return;
  // Reintenta cierres que fallaron aunque el registro ya sea terminal.
  try {
    for (const sala of await media.listarPrivadas()) {
      const id = sala.slice(8);
      const c = await prisma.llamadaPrivada.findUnique({where:{id}});
      if (!c || c.estado !== 'ACEPTADA') await media.cerrarPrivada(sala).catch(() => {});
    }
  } catch {}
  const calls=await prisma.llamadaPrivada.findMany({where:{estado:{in:active}}});
  for(const c of calls) {
    if(c.estado==='LLAMANDO'&&Date.now()-c.fechaCreacion.getTime()>60000)await finishPrivateCall(c.id,c.idEmisor,'PERDIDA');
    else if((c.sesionEmisor&&!await findAuthUserBySessionId(c.sesionEmisor))||(c.sesionReceptor&&!await findAuthUserBySessionId(c.sesionReceptor))||!await areFriends(c.idEmisor,c.idReceptor))await finishPrivateCall(c.id,c.idEmisor);
  }
}
onSessionEnded(async({idSesion,idUsuario})=>{
  const calls=await prisma.llamadaPrivada.findMany({where:{estado:{in:active},OR:[...(idUsuario?[{idEmisor:idUsuario},{idReceptor:idUsuario}]:[]),...(idSesion?[{sesionEmisor:idSesion},{sesionReceptor:idSesion}]:[])]}});
  for(const c of calls)await finishPrivateCall(c.id,c.idEmisor);
});
onMediaEvent(async(e)=>{
  if(!e.sala?.startsWith('privada-')||!e.idUsuario)return;
  const id=e.sala.slice(8);
  if(!/^[\da-f-]{36}$/i.test(id))return;
  const c=await prisma.llamadaPrivada.findUnique({where:{id}});
  const session=c&&(c.idEmisor===e.idUsuario?c.sesionEmisor:c.sesionReceptor);
  const valid=c&&own(c,e.idUsuario)&&c.estado==='ACEPTADA'&&e.ingreso===c.id&&(!session||await findAuthUserBySessionId(session))&&await areFriends(c.idEmisor,c.idReceptor);
  if(!valid){await media.retirarPrivada(e.sala,e.idUsuario).catch(()=>{});return;}
  if(e.tipo==='participant_left')await finishPrivateCall(c.id,e.idUsuario);
});
