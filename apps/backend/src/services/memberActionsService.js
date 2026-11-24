import { memberSelect,memberRoleIds,effectiveChannelPermissions } from '../utils/channelPermissions.js';
import {usuarioPublicoSelect,toUsuarioPublico} from '../utils/selects.js';
import { prisma } from '../prisma/client.js';
import { requireCommunityPermission, protectMember } from './communityPermissionsService.js';
import { requireChannelPermission, withCommunityAccessChange, withChannelPermission } from './channelsService.js';
import { AppError } from '../utils/AppError.js';
import { leaveCommunity,emitToCommunity,emitToUser } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { protectModerationTarget, auditModeration } from './moderationMeasuresService.js';

async function targetMember(tx,community,actor,target,actorRole){
 const member=await tx.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad:community,idUsuario:target}},select:{rol:true}});
 if(!member)throw new AppError(404,'MEMBER_NOT_FOUND','El usuario ya no es integrante');
 protectMember(actor,target,actorRole,member.rol);return member;
}
// Expulsar retira la membresía actual sin bloquear el reingreso: volver requiere una invitación válida.
// `options.inTx` permite que una propuesta confirmada se reclame en la misma transacción (T-52).
export async function kickMember(community,actor,target,channel,options={}){
 await withCommunityAccessChange(community,async tx=>{
  const context=channel?await requireChannelPermission(channel,actor,'EXPULSAR',tx):await requireCommunityPermission(community,actor,'EXPULSAR',tx);
  if(channel&&context.canal.idComunidad!==community)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
  if(channel)await requireChannelPermission(channel,target,'VER',tx);
  const member=await targetMember(tx,community,actor,target,context.rol);
  protectModerationTarget(actor,target,context.rol,member.rol);
  await options.inTx?.(tx);
  await tx.membresia.delete({where:{idComunidad_idUsuario:{idComunidad:community,idUsuario:target}}});
  const handle=(await tx.usuario.findUnique({where:{id:target},select:{nombreUsuario:true}}))?.nombreUsuario;
  await auditModeration(tx,community,options.auditActor??actor,`${options.auditPrefix??''}Expulsó a @${handle}${options.motivo?`. Motivo: ${options.motivo}`:''}`);
  return tx.canal.findMany({where:{idComunidad:community},select:{id:true}});
 },undefined,channels=>{leaveCommunity(community,target,channels.map(c=>c.id));emitToUser(target,EVENTS.COMMUNITY_LEFT,{idComunidad:community});emitToCommunity(community,EVENTS.COMMUNITY_MEMBER_LEFT,{idComunidad:community,idUsuario:target});});
}
export async function silenceMember(channel,actor,target,silenciado){
 const original=await prisma.canal.findUnique({where:{id:channel},select:{idComunidad:true}});
 if(!original)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
 await withCommunityAccessChange(original.idComunidad,async tx=>{
  const context=await requireChannelPermission(channel,actor,'SILENCIAR',tx);
  if(context.canal.tipo!=='VOZ')throw new AppError(400,'NOT_A_CALL_CHANNEL','Solo se puede silenciar en canales de voz');
  await requireChannelPermission(channel,target,'VER',tx);
  const member=await targetMember(tx,original.idComunidad,actor,target,context.rol);
  if(member.rol==='ADMIN')throw new AppError(403,'INSUFFICIENT_ROLE','Administradores conservan el control de su micrófono');
  const where={idCanal_idUsuario:{idCanal:channel,idUsuario:target}};
  if(silenciado)await tx.canalSilencio.upsert({where,create:{idCanal:channel,idComunidad:original.idComunidad,idUsuario:target},update:{}});
  else await tx.canalSilencio.deleteMany({where:{idCanal:channel,idUsuario:target}});
 });
}

export async function managedMembers(channel,actor){
 return withChannelPermission(channel,actor,'VER',async(tx,context)=>{
  if(!['SILENCIAR','BANEAR','EXPULSAR'].some(p=>context.permisos.includes(p)))throw new AppError(403,'INSUFFICIENT_ROLE','No podés gestionar integrantes del canal');
  const members=await tx.membresia.findMany({where:{idComunidad:context.canal.idComunidad},select:{...memberSelect,rolesPersonalizados:{select:{rol:{select:{id:true,nombre:true,permisos:true}}}},usuario:{select:usuarioPublicoSelect}}});
  return members.filter(m=>m.idUsuario!==actor&&m.rol!=='PROPIETARIO'&&(m.rol!=='ADMIN'||context.rol==='PROPIETARIO')&&(effectiveChannelPermissions(context.canal,m.rol,m.idUsuario,memberRoleIds(m)).includes('VER')||context.canal.expulsiones.some(e=>e.idUsuario===m.idUsuario))).map(m=>({usuario:toUsuarioPublico(m.usuario),rol:m.rol,expulsado:context.canal.expulsiones.some(e=>e.idUsuario===m.idUsuario),silenciado:context.canal.silencios.some(s=>s.idUsuario===m.idUsuario),permisosEfectivos:effectiveChannelPermissions(context.canal,m.rol,m.idUsuario,memberRoleIds(m)),origenPermisos:{globales:context.canal.privado?[]:context.canal.permisosGlobales,personales:context.canal.habilitacionesUsuario.find(g=>g.idUsuario===m.idUsuario)?.permisos??[],roles:memberRoleIds(m).map(r=>({nombre:r.nombre,permisos:r.permisos}))}}));
 });
}

export async function kickChannelMember(channel,actor,target,restore=false){
 const original=await prisma.canal.findUnique({where:{id:channel},select:{idComunidad:true}});
 if(!original)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
 await withCommunityAccessChange(original.idComunidad,async tx=>{
  const context=await requireChannelPermission(channel,actor,'EXPULSAR',tx);
  await targetMember(tx,original.idComunidad,actor,target,context.rol);
  const where={idCanal_idUsuario:{idCanal:channel,idUsuario:target}};
  if(restore)await tx.canalExpulsion.deleteMany({where:{idCanal:channel,idUsuario:target}});
  else {
   await tx.canalUsuario.deleteMany({where:{idCanal:channel,idUsuario:target}});
   await tx.solicitudAccesoCanal.deleteMany({where:{idCanal:channel,idUsuario:target,estado:'ACEPTADA'}});
   if(!context.canal.privado)await tx.canalExpulsion.upsert({where,create:{idCanal:channel,idComunidad:original.idComunidad,idUsuario:target},update:{}});
  }
 });
}
