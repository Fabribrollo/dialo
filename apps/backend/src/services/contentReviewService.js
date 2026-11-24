import { silenceMember } from './moderationMeasuresService.js';
import { prisma } from '../prisma/client.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { requireCommunityPermission } from './communityPermissionsService.js';
import { requireChannelPermission } from './channelsService.js';
import { askDecisions } from '../utils/decisions.js';
import { AppError } from '../utils/AppError.js';
import { banMember } from './communityBansService.js';
import { kickMember } from './memberActionsService.js';

const selection={id:true,idCanal:true,idAutor:true,contenido:true,fechaEdicion:true,fechaCreacion:true,fechaEliminacion:true,idHilo:true,registroLlamada:true,adjunto:{select:{id:true}},canal:{select:{idComunidad:true,comunidad:{select:{revisionActiva:true,reglasModeracion:{select:{id:true,descripcion:true}}}}}}};
export async function reviewPublishedMessage(messageId,evaluate=askDecisions){
 const original=await prisma.mensaje.findUnique({where:{id:messageId},select:selection});
 if(!original?.canal?.comunidad.revisionActiva||original.fechaEliminacion||original.idHilo||original.registroLlamada)return;
 if(original.adjunto&&original.contenido==='Archivo adjunto')return;
 const rules=original.canal.comunidad.reglasModeracion;
 let scores=null;
 try {if(rules.length)scores=await evaluate(original.contenido,rules.map(r=>({type:'predicate',name:`regla_${r.id}`,instructions:`¿El mensaje contiene ${r.descripcion}?`})));}catch{ /* El proveedor no bloquea la publicación. */ }
 const reasons=rules.filter(r=>typeof scores?.[`regla_${r.id}`]==='number'&&scores[`regla_${r.id}`]>=.8).map(r=>r.descripcion);
 return withCommunityChannelsLock(original.canal.idComunidad,async tx=>{
  const current=await tx.mensaje.findUnique({where:{id:messageId},select:selection});
  if(!current?.canal?.comunidad.revisionActiva||current.fechaEliminacion||current.contenido!==original.contenido||String(current.fechaEdicion)!==String(original.fechaEdicion))return;
  const activeRules=new Set(current.canal.comunidad.reglasModeracion.map(r=>r.descripcion));
  const motivos=reasons.filter(r=>activeRules.has(r));
  const repeats=await tx.mensaje.count({where:{idCanal:current.idCanal,idAutor:current.idAutor,id:{lte:current.id},fechaCreacion:{gte:new Date(current.fechaCreacion.getTime()-60000),lte:current.fechaCreacion},fechaEliminacion:null,contenido:{equals:current.contenido,mode:'insensitive'}}});
  if(repeats>=3)motivos.push('Repetición: al menos 3 mensajes iguales en 60 segundos');
  if(!motivos.length)return;
  return tx.casoRevision.upsert({where:{idMensaje:messageId},update:{},create:{idComunidad:current.canal.idComunidad,idCanal:current.idCanal,idAutor:current.idAutor,idMensaje:messageId,motivos}});
 });
}
async function visibleCase(tx,id,actor,row){
 let visible=false;
 try{await requireChannelPermission(row.idCanal,actor,'VER',tx);visible=true;}catch(e){if(![403,404].includes(e.status))throw e;}
 const message=visible&&row.idMensaje?await tx.mensaje.findFirst({where:{id:row.idMensaje,idCanal:row.idCanal,fechaEliminacion:null},select:{contenido:true,fechaCreacion:true,fechaEdicion:true,autor:{select:{id:true,nombreVisible:true,nombreUsuario:true}}}}):null;
 const resolver=row.idResolutor?await tx.usuario.findUnique({where:{id:row.idResolutor},select:{nombreVisible:true}}):null;
 return {id:row.id,idComunidad:id,idCanal:visible?row.idCanal:null,idMensaje:message?row.idMensaje:null,estado:row.estado,motivos:visible?row.motivos:['Contenido no disponible'],mensaje:message,fechaCreacion:row.fechaCreacion,fechaResolucion:row.fechaResolucion,motivoResolucion:row.motivoResolucion,resolutor:resolver?.nombreVisible??null,medida:row.medida};
}
export const reviewSettings=(id,actor,value)=>withCommunityChannelsLock(id,async tx=>{
 await requireCommunityPermission(id,actor,'GESTIONAR_MODERACION',tx);
 if(value===undefined)return tx.comunidad.findUnique({where:{id},select:{revisionActiva:true}});
 const result=await tx.comunidad.update({where:{id},data:{revisionActiva:value},select:{revisionActiva:true}});
 await tx.auditoria.create({data:{idComunidad:id,idActor:actor,accion:`Revisión humana ${value?'activada':'desactivada'}`}});
 return result;
});
export async function listReviewCases(id,actor,{estado='PENDIENTE',cursor}={}){
 return withCommunityChannelsLock(id,async tx=>{
  await requireCommunityPermission(id,actor,'GESTIONAR_MODERACION',tx);
  const rows=await tx.casoRevision.findMany({where:{idComunidad:id,...(estado==='RESUELTOS'?{estado:{not:'PENDIENTE'}}:{estado:'PENDIENTE'}),...(cursor?{id:{lt:cursor}}:{})},orderBy:{id:'desc'},take:31});
  const items=[];for(const row of rows.slice(0,30))items.push(await visibleCase(tx,id,actor,row));
  return {items,nextCursor:rows.length>30?rows[29].id:null};
 });
}
async function requireCase(tx,id,actor,caseId){
 await requireCommunityPermission(id,actor,'GESTIONAR_MODERACION',tx);
 const row=await tx.casoRevision.findFirst({where:{id:caseId,idComunidad:id}});
 if(!row)throw new AppError(404,'CASE_NOT_FOUND','El caso no está disponible');return row;
}
export const getReviewCase=(id,actor,caseId)=>withCommunityChannelsLock(id,async tx=>visibleCase(tx,id,actor,await requireCase(tx,id,actor,caseId)));
const sameDecision=(row,input)=>row.estado===input.decision&&row.motivoResolucion===input.motivo&&JSON.stringify(row.medida??null)===JSON.stringify(input.medida??null);
async function closeCase(tx,id,actor,caseId,input,measure=false){
 const row=await requireCase(tx,id,actor,caseId);
 if(row.estado!=='PENDIENTE'){
  if(!measure&&sameDecision(row,input))return row;
  throw new AppError(409,'CASE_CLOSED','Otra decisión ya resolvió este caso. Actualizá la bandeja.');
 }
 if(measure){
  await requireChannelPermission(row.idCanal,actor,'VER',tx);
  const message=row.idMensaje?await tx.mensaje.findFirst({where:{id:row.idMensaje,idCanal:row.idCanal,fechaEliminacion:null}}):null;
  if(!message)throw new AppError(409,'CASE_CONTENT_UNAVAILABLE','El mensaje ya no está disponible para iniciar una medida');
  if(!await tx.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad:id,idUsuario:row.idAutor}}}))throw new AppError(409,'CASE_TARGET_UNAVAILABLE','La persona ya no integra la comunidad');
 }
 const updated=await tx.casoRevision.update({where:{id:caseId},data:{estado:input.decision,idResolutor:actor,motivoResolucion:input.motivo,medida:input.medida??undefined,fechaResolucion:new Date()}});
 await tx.auditoria.create({data:{idComunidad:id,idActor:actor,accion:`Caso #${caseId}: ${{DESCARTADO:'descartado',SIN_SANCION:'cerrado sin sanción',CON_MEDIDA:'medida confirmada'}[input.decision]}`,detalle:{caso:caseId,decision:input.decision,motivo:input.motivo,medida:input.medida??null}}});
 return updated;
}
export async function resolveReviewCase(id,actor,caseId,input){
 if(input.decision!=='CON_MEDIDA'){
  await withCommunityChannelsLock(id,tx=>closeCase(tx,id,actor,caseId,input));
 }else{
  const initial=await withCommunityChannelsLock(id,tx=>requireCase(tx,id,actor,caseId));
  if(initial.estado!=='PENDIENTE'){
   if(sameDecision(initial,input))return getReviewCase(id,actor,caseId);
   throw new AppError(409,'CASE_CLOSED','El caso ya tiene una decisión');
  }
  let claimed=false;
  const hook=async tx=>{const row=await closeCase(tx,id,actor,caseId,input,true);claimed=true;return row;};
  try {
   if(input.medida.tipo==='SILENCIAR')await silenceMember(id,actor,initial.idAutor,{alcance:input.medida.alcance,duracion:input.medida.duracion,motivo:input.motivo},{inTx:hook,auditPrefix:`Caso #${caseId}: `});
   else if(input.medida.tipo==='BANEAR')await banMember(id,actor,initial.idAutor,{motivo:input.motivo,duracion:input.medida.duracion},undefined,{inTx:hook,auditPrefix:`Caso #${caseId}: `,motivo:input.motivo});
   else await kickMember(id,actor,initial.idAutor,undefined,{inTx:hook,auditPrefix:`Caso #${caseId}: `,motivo:input.motivo});
   if(!claimed){const current=await withCommunityChannelsLock(id,tx=>requireCase(tx,id,actor,caseId));if(!sameDecision(current,input))throw new AppError(409,'CASE_TARGET_UNAVAILABLE','La medida ya estaba aplicada. Actualizá el caso antes de resolverlo.');}
  }catch(e){
   if(e.code!=='CASE_CLOSED')throw e;
   const current=await withCommunityChannelsLock(id,tx=>requireCase(tx,id,actor,caseId));
   if(!sameDecision(current,input))throw e;
  }
 }
 return getReviewCase(id,actor,caseId);
}
