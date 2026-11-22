import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { requireRole } from './communitiesService.js';
import { channelPermissions, withCommunityAccessChange } from './channelsService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { channelSelect, effectiveChannelPermissions, memberSelect, memberRoleIds } from '../utils/channelPermissions.js';
import { securityNotice, publishNotices } from './notificationsService.js';
import { emitToUser } from '../sockets/emitter.js';
import { usuarioPublicoSelect, toUsuarioPublico } from '../utils/selects.js';

async function original(id) {
  const channel=await prisma.canal.findUnique({where:{id},select:{idComunidad:true}});
  if(!channel)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
  return channel.idComunidad;
}
async function context(tx,id,idComunidad,user,manage=false) {
  const member=await requireRole(idComunidad,user,manage?'ADMIN':'INTEGRANTE',tx);
  const canal=await tx.canal.findUnique({where:{id},select:channelSelect});
  if(!canal)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
  return {canal,member};
}
const staff=async(tx,idComunidad)=>(await tx.membresia.findMany({where:{idComunidad,rol:{in:['ADMIN','PROPIETARIO']}},select:{idUsuario:true}})).map(m=>m.idUsuario);
function publish(result,idComunidad) {
  publishNotices(result.notices);
  for(const id of result.refreshNotices??[])emitToUser(id,'notifications:changed',{});
  for(const user of result.recipients??[])emitToUser(user,'channel:requests-changed',{idComunidad});
}
export async function requestChannelAccess(id,user) {
  const idComunidad=await original(id);
  const result=await withCommunityChannelsLock(idComunidad,async tx=>{
    const {canal,member}=await context(tx,id,idComunidad,user);
    if(!canal.privado)throw new AppError(400,'PUBLIC_CHANNEL','Los canales públicos no requieren solicitud');
    if(effectiveChannelPermissions(canal,member.rol,user,memberRoleIds(await tx.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad,idUsuario:user}},select:memberSelect}))).includes('VER'))throw new AppError(409,'ALREADY_HAS_ACCESS','Ya tenés acceso al canal');
    const existing=await tx.solicitudAccesoCanal.findUnique({where:{idCanal_idUsuario:{idCanal:id,idUsuario:user}}});
    if(existing && existing.estado!=='RECHAZADA')return {solicitud:{id:existing.id,estado:existing.estado},notices:[],recipients:[]};
    const solicitud=existing
      ?await tx.solicitudAccesoCanal.update({where:{id:existing.id},data:{estado:'PENDIENTE',fechaCreacion:new Date(),fechaResolucion:null},select:{id:true,estado:true}})
      :await tx.solicitudAccesoCanal.create({data:{idCanal:id,idComunidad,idUsuario:user},select:{id:true,estado:true}});
    const admins=await staff(tx,idComunidad);
    return {solicitud,notices:await securityNotice(tx,admins,'solicitud_canal',solicitud.id),recipients:[user,...admins]};
  },undefined,result=>publish(result,idComunidad));
  return result.solicitud;
}
export async function listChannelRequests(id,user) {
  const idComunidad=await original(id);
  return withCommunityChannelsLock(idComunidad,async tx=>{
    await context(tx,id,idComunidad,user,true);
    const rows=await tx.solicitudAccesoCanal.findMany({where:{idCanal:id,estado:'PENDIENTE'},orderBy:{id:'asc'},take:50,
      select:{id:true,fechaCreacion:true,membresia:{select:{usuario:{select:usuarioPublicoSelect}}}}});
    return rows.map(q=>({...q,membresia:{usuario:toUsuarioPublico(q.membresia.usuario)}}));
  });
}
export async function resolveChannelRequest(id,requestId,user,{aceptar,permisos}) {
  const idComunidad=await original(id);
  const saved=await withCommunityAccessChange(idComunidad,async tx=>{
    const {canal}=await context(tx,id,idComunidad,user,true);
    if(!canal.privado)throw new AppError(409,'PUBLIC_CHANNEL','El canal ya es público');
    const request=await tx.solicitudAccesoCanal.findFirst({where:{id:requestId,idCanal:id,idComunidad}});
    if(!request)throw new AppError(404,'REQUEST_NOT_FOUND','La solicitud ya no está disponible');
    const estado=aceptar?'ACEPTADA':'RECHAZADA';
    if(request.estado!=='PENDIENTE') {
      if(request.estado!==estado)throw new AppError(409,'REQUEST_RESOLVED','La solicitud ya fue resuelta');
      return {estado,notices:[],recipients:[]};
    }
    if(aceptar) {
      const normalized=channelPermissions(canal.tipo,permisos??[]);
      if(!normalized.length)throw new AppError(400,'EMPTY_PERMISSIONS','Elegí al menos un permiso');
      await tx.canalUsuario.upsert({where:{idCanal_idUsuario:{idCanal:id,idUsuario:request.idUsuario}},create:{idCanal:id,idComunidad,idUsuario:request.idUsuario,permisos:normalized},update:{permisos:normalized}});
    }
    await tx.solicitudAccesoCanal.update({where:{id:requestId},data:{estado,fechaResolucion:new Date()}});
    await tx.notificacion.updateMany({where:{tipo:'solicitud_canal',referencia:requestId},data:{leida:true}});
    const admins=await staff(tx,idComunidad);
    return {estado,notices:await securityNotice(tx,[request.idUsuario],aceptar?'acceso_aceptado':'acceso_rechazado',id),refreshNotices:admins,recipients:[request.idUsuario,...admins]};
  },undefined,result=>publish(result,idComunidad));
  return {estado:saved.estado};
}
