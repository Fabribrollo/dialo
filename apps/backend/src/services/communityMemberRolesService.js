import { requireCommunityPermission, protectMember } from './communityPermissionsService.js';
import { securityNotice, publishNotices } from './notificationsService.js';
import { requireRole, JERARQUIA, integranteSelect, toIntegrante } from './communitiesService.js';
import { withCommunityAccessChange } from './channelsService.js';
import { emitToCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';

export async function updateMemberRoles(idComunidad, idUsuario, actorId, { rol, idsRoles }) {
  const key = { idComunidad_idUsuario: { idComunidad, idUsuario } };
  const result = await withCommunityAccessChange(idComunidad, async (tx) => {
    const actor=await requireCommunityPermission(idComunidad,actorId,'GESTIONAR_ROLES',tx);
    const actorRole=actor.rol;
    const current = await tx.membresia.findUnique({ where: key, select: integranteSelect });
    if (!current) throw new AppError(404, 'MEMBER_NOT_FOUND', 'El usuario no es integrante de esta comunidad');
    protectMember(actorId,idUsuario,actorRole,current.rol);
    if(rol==='PROPIETARIO'||rol==='MODERADOR'||(rol==='ADMIN'&&!['ADMIN','PROPIETARIO'].includes(actorRole)))
      throw new AppError(403,'INSUFFICIENT_ROLE','No podés asignar ese rol base');
    const currentIds = current.rolesPersonalizados.map(({ rol: role }) => role.id);
    const nextIds = idsRoles === undefined ? currentIds : [...idsRoles].sort((a, b) => a - b);
    if (idsRoles !== undefined && nextIds.length) {
      const count = await tx.rolPersonalizado.count({ where: { idComunidad, id: { in: nextIds } } });
      if (count !== nextIds.length) throw new AppError(404, 'ROLE_NOT_FOUND', 'Algún rol no existe en esta comunidad');
    }
    if(!['ADMIN','PROPIETARIO'].includes(actorRole)) {
      if(rol!==undefined&&rol!==current.rol)throw new AppError(403,'INSUFFICIENT_ROLE','No podés cambiar roles base');
      const roles=await tx.rolPersonalizado.findMany({where:{idComunidad,id:{in:[...new Set([...nextIds,...currentIds])]}},select:{permisos:true}});
      if(roles.some(r=>r.permisos.some(p=>!actor.permisos.includes(p))))throw new AppError(403,'ROLE_PRIVILEGE_ESCALATION','No podés asignar permisos que no tenés');
    }
    const baseChanged = rol !== undefined && rol !== current.rol;
    const customChanged = currentIds.length !== nextIds.length || currentIds.some((id, i) => id !== nextIds[i]);
    if (!baseChanged && !customChanged) return { integrante: toIntegrante(current), changed: false };
    if (baseChanged) await tx.membresia.update({ where: key, data: { rol } });
    if (customChanged) {
      const removed = currentIds.filter((id) => !nextIds.includes(id));
      const added = nextIds.filter((id) => !currentIds.includes(id));
      if (removed.length) await tx.membresiaRol.deleteMany({ where: { idComunidad, idUsuario, idRol: { in: removed } } });
      if (added.length) await tx.membresiaRol.createMany({ data: added.map((idRol) => ({ idComunidad, idUsuario, idRol })) });
    }
    const integrante = toIntegrante(await tx.membresia.findUniqueOrThrow({ where: key, select: integranteSelect }));
    return { integrante, changed: true, notices: await securityNotice(tx, [idUsuario], 'roles', idComunidad) };
  }, undefined, ({ integrante, changed, notices }) => {
    publishNotices(notices);
    if (changed) emitToCommunity(idComunidad, EVENTS.COMMUNITY_MEMBER_UPDATED, { idComunidad, integrante });
  });
  return result.integrante;
}
