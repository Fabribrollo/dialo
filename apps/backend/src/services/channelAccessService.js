import {securityNotice,publishNotices} from './notificationsService.js';
import {emitToUser} from '../sockets/emitter.js';
import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { channelSelect } from '../utils/channelPermissions.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import { audience, channelPermissions, mutateChannel, publishChannelChange, requireChannelPermission } from './channelsService.js';

async function toAccess(db, canal) {
  const members = await db.membresia.findMany({
    where:{idComunidad:canal.idComunidad,idUsuario:{in:canal.habilitacionesUsuario.map(g=>g.idUsuario)},rol:{notIn:['ADMIN','PROPIETARIO']}},
    select:{idUsuario:true,usuario:{select:usuarioPublicoSelect}},
  });
  const byId = new Map(members.map(m=>[m.idUsuario,toUsuarioPublico(m.usuario)]));
  return {privado:canal.privado,permisosGlobales:canal.privado?[]:canal.permisosGlobales,
    roles:canal.habilitacionesRolPersonalizado,
    habilitaciones:canal.habilitacionesUsuario.filter(g=>byId.has(g.idUsuario)).map(g=>({usuario:byId.get(g.idUsuario),permisos:g.permisos}))};
}
export async function getChannelAccess(idCanal,idUsuario) {
  const {canal,rol,permisos}=await requireChannelPermission(idCanal,idUsuario);
  if (!['ADMIN','PROPIETARIO'].includes(rol)&&!permisos.includes('GESTIONAR_CANALES')) throw new AppError(403,'INSUFFICIENT_ROLE','Tu rol no permite configurar el acceso');
  return toAccess(prisma,canal);
}
export async function replaceChannelAccess(idCanal,idUsuario,datos) {
  const saved=await mutateChannel(idCanal,idUsuario,async(tx,{canal:previous,rol,permisos},members)=>{
    if(!['ADMIN','PROPIETARIO'].includes(rol)&&[...(datos.permisosGlobales??[]),...(datos.habilitaciones??[]).flatMap(g=>g.permisos),...(datos.roles??[]).flatMap(g=>g.permisos)].some(p=>!permisos.includes(p)))throw new AppError(403,'ROLE_PRIVILEGE_ESCALATION','No podés otorgar permisos que no tenés');
    const {privado}=datos;
    if(previous.privado&&!['ADMIN','PROPIETARIO'].includes(rol))throw new AppError(403,'INSUFFICIENT_ROLE','Solo administración admite integrantes en canales privados');
    if(privado!==previous.privado)throw new AppError(409,'CHANNEL_PRIVACY_IMMUTABLE','La privacidad del canal se define al crearlo y no se puede cambiar');
    const grants=privado?(datos.habilitaciones??[]):[];
    const roles=[];
    if(datos.roles?.length)throw new AppError(400,'ROLE_CONFIG_IN_COMMUNITY','Los permisos del rol se configuran en la comunidad');
    const count=await tx.rolPersonalizado.count({where:{idComunidad:previous.idComunidad,id:{in:roles.map(g=>g.idRol)}}});
    if(count!==roles.length)throw new AppError(404,'ROLE_NOT_FOUND','Un rol ya no pertenece a la comunidad');
    if (grants.some(g=>!Number.isInteger(g.idUsuario))) throw new AppError(400,'INDIVIDUAL_ACCESS_REQUIRED','Los canales privados se habilitan por integrante');
    const memberIds=new Set(members.filter(m=>!['ADMIN','PROPIETARIO'].includes(m.rol)).map(m=>m.idUsuario));
    if(grants.some(g=>!memberIds.has(g.idUsuario))) throw new AppError(404,'MEMBER_NOT_FOUND','Elegí integrantes actuales sin acceso administrativo');
    const normalized=grants.map(g=>({...g,permisos:channelPermissions(previous.tipo,g.permisos)}));
    const global=channelPermissions(previous.tipo,privado?[]:datos.permisosGlobales??previous.permisosGlobales);
    if(normalized.length)await tx.canalExpulsion.deleteMany({where:{idCanal,idUsuario:{in:normalized.map(g=>g.idUsuario)}}});
    await tx.canalRol.deleteMany({where:{idCanal}});
    await tx.canalRolPersonalizado.deleteMany({where:{idCanal}});
    await tx.canalUsuario.deleteMany({where:{idCanal}});
    if(normalized.length)await tx.canalUsuario.createMany({data:normalized.filter(g=>g.permisos.length).map(g=>({idCanal,idComunidad:previous.idComunidad,idUsuario:g.idUsuario,permisos:g.permisos}))});
    if(roles.length)await tx.canalRolPersonalizado.createMany({data:roles.map(g=>({idCanal,idComunidad:previous.idComunidad,idRol:g.idRol,permisos:channelPermissions(previous.tipo,g.permisos)}))});
    if(!privado) await tx.solicitudAccesoCanal.deleteMany({where:{idCanal}});
    else {
      await tx.solicitudAccesoCanal.deleteMany({where:{idCanal,estado:'ACEPTADA',idUsuario:{notIn:normalized.filter(g=>g.permisos.length).map(g=>g.idUsuario)}}});
    }
    const pending=privado?await tx.solicitudAccesoCanal.findMany({where:{idCanal,estado:'PENDIENTE',idUsuario:{in:normalized.filter(g=>g.permisos.length).map(g=>g.idUsuario)}},select:{id:true}}):[];
    if(pending.length)await tx.notificacion.updateMany({where:{tipo:'solicitud_canal',referencia:{in:pending.map(q=>q.id)}},data:{leida:true}});
    if(privado&&normalized.length) await tx.solicitudAccesoCanal.updateMany({where:{idCanal,estado:'PENDIENTE',idUsuario:{in:normalized.filter(g=>g.permisos.length).map(g=>g.idUsuario)}},data:{estado:'ACEPTADA',fechaResolucion:new Date()}});
    const canal=await tx.canal.update({where:{id:idCanal},data:{privado,permisosGlobales:global},select:channelSelect});
    const before=audience(previous,members),after=audience(canal,members);
    const admitted=privado?[...after].filter(([id,perms])=>perms.includes('VER')&&!before.get(id)?.includes('VER')).map(([id])=>id):[];
    return {canal,before,after,acceso:await toAccess(tx,canal),requestNotices:admitted.length?await securityNotice(tx,admitted,'acceso_aceptado',idCanal):[],requestRecipients:pending.length?[...admitted,...members.filter(m=>['ADMIN','PROPIETARIO'].includes(m.rol)).map(m=>m.idUsuario)]:[]};
  },saved=>{
    publishChannelChange(saved.canal,saved.before,saved.after);publishNotices(saved.requestNotices);
    for(const id of saved.requestRecipients){emitToUser(id,'channel:requests-changed',{idComunidad:saved.canal.idComunidad});emitToUser(id,'notifications:changed',{});}
  });
  return saved.acceso;
}
