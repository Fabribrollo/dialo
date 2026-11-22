import { requireCommunityPermission } from './communityPermissionsService.js';
import { securityNotice, publishNotices } from './notificationsService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { AppError } from '../utils/AppError.js';
import { requireRole } from './communitiesService.js';
import { audience, getChannelMembers, publishChannelChange, withCommunityAccessChange } from './channelsService.js';
import { channelSelect } from '../utils/channelPermissions.js';
import { emitToCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

const roleSelect = { id: true, idComunidad: true, nombre: true, permisos: true, fechaCreacion: true };
const notFound = () => new AppError(404, 'ROLE_NOT_FOUND', 'El rol no existe en esta comunidad');

async function requireCustomRole(tx, idComunidad, idRol) {
  const rol = await tx.rolPersonalizado.findFirst({ where: { id: idRol, idComunidad }, select: roleSelect });
  if (!rol) throw notFound();
  return rol;
}

// No se publican asignaciones, permisos ni IDs de canales privados en los eventos de roles.
export function listRoles(idComunidad, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    return tx.rolPersonalizado.findMany({
      where: { idComunidad }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], select: roleSelect,
    });
  });
}

export function getRole(idComunidad, idRol, idUsuario) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    return requireCustomRole(tx, idComunidad, idRol);
  });
}

export function createRole(idComunidad, idUsuario, { nombre, permisos = [] }) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    await authorizeRole(tx,idComunidad,idUsuario,null,permisos);
    return tx.rolPersonalizado.create({ data: { idComunidad, nombre, permisos }, select: roleSelect });
  }, undefined, (rol) => emitToCommunity(idComunidad, EVENTS.COMMUNITY_ROLE_CREATED, { idComunidad, rol }));
}

async function authorizeRole(tx,community,user,previous,next) {
 const actor=await requireCommunityPermission(community,user,'GESTIONAR_ROLES',tx);
 if(!['ADMIN','PROPIETARIO'].includes(actor.rol) && [...(previous?.permisos??[]),...(next??[])].some(p=>!actor.permisos.includes(p)))
  throw new AppError(403,'ROLE_PRIVILEGE_ESCALATION','No podés administrar permisos que no tenés');
 return actor;
}
export function updateRole(idComunidad,idRol,idUsuario,{nombre,permisos}) {
 return withCommunityAccessChange(idComunidad,async tx=>{
  const previous=await requireCustomRole(tx,idComunidad,idRol);
  await authorizeRole(tx,idComunidad,idUsuario,previous,permisos);
  return tx.rolPersonalizado.update({where:{id:idRol},data:{nombre,...(permisos===undefined?{}:{permisos})},select:roleSelect});
 },undefined,rol=>emitToCommunity(idComunidad,EVENTS.COMMUNITY_ROLE_UPDATED,{idComunidad,rol}));
}

export function deleteRole(idComunidad,idRol,idUsuario){
 return withCommunityAccessChange(idComunidad,async tx=>{
  const previous=await requireCustomRole(tx,idComunidad,idRol);
  await authorizeRole(tx,idComunidad,idUsuario,previous,[]);
  const affected=await tx.membresiaRol.findMany({where:{idComunidad,idRol},select:{idUsuario:true}});
  await tx.rolPersonalizado.delete({where:{id:idRol}});
  return {notices:await securityNotice(tx,affected.map(m=>m.idUsuario),'roles',idComunidad)};
 },undefined,({notices})=>{publishNotices(notices);emitToCommunity(idComunidad,EVENTS.COMMUNITY_ROLE_DELETED,{idComunidad,idRol});});
}
