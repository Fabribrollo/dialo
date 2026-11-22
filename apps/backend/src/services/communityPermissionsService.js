import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { PERMISSIONS, ADMIN_ACTIONS, LEGACY_MODERATOR } from '../utils/permissionCatalog.js';
// No importa services de canales/comunidades: evita ciclos en la autorización.
export async function communityPermissions(idComunidad,idUsuario,db=prisma) {
 const member=await db.membresia.findUnique({where:{idComunidad_idUsuario:{idComunidad,idUsuario}},select:{rol:true,rolesPersonalizados:{select:{rol:{select:{permisos:true}}}}}});
 if(!member)return {rol:null,permisos:[]};
 return {rol:member.rol,permisos:['ADMIN','PROPIETARIO'].includes(member.rol)?[...PERMISSIONS,...ADMIN_ACTIONS]:[...new Set([...(member.rol==='MODERADOR'?LEGACY_MODERATOR:[]),...member.rolesPersonalizados.flatMap(r=>r.rol.permisos.filter(p=>PERMISSIONS.includes(p)))])]};
}
export async function requireCommunityPermission(id,user,permission,db=prisma) {
 const result=await communityPermissions(id,user,db);
 if(!result.rol)throw new AppError(404,'COMMUNITY_NOT_FOUND','La comunidad no existe');
 if((permission==='EXPULSAR'&&!['ADMIN','PROPIETARIO'].includes(result.rol))||!result.permisos.includes(permission))throw new AppError(403,'INSUFFICIENT_ROLE','No tenés permiso para esta acción');
 return result;
}
export function protectMember(actor,target,actorRole,targetRole) {
 if(actor===target||targetRole==='PROPIETARIO'||(targetRole==='ADMIN'&&actorRole!=='PROPIETARIO'))throw new AppError(403,'INSUFFICIENT_ROLE','Solo el propietario puede modificar a otro administrador');
}
