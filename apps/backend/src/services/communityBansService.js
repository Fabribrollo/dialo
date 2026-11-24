import { requireChannelPermission } from './channelsService.js';
import { protectMember, requireCommunityPermission } from './communityPermissionsService.js';
import { securityNotice, publishNotices } from './notificationsService.js';
import { requireRole, JERARQUIA, getMembership } from './communitiesService.js';
import { withCommunityAccessChange } from './channelsService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { AppError } from '../utils/AppError.js';
import { usuarioPublicoSelect, toUsuarioPublico } from '../utils/selects.js';
import { emitToCommunity, emitToUser, leaveCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { protectModerationTarget, auditModeration, etiquetaDuracion } from './moderationMeasuresService.js';

const banKey = (idComunidad, idUsuario) => ({ idComunidad_idUsuario: { idComunidad, idUsuario } });
const lowerRoles = rol => rol === 'PROPIETARIO' ? ['ADMIN','INTEGRANTE','MODERADOR'] : ['INTEGRANTE','MODERADOR'];

function requireTarget(actor,target,rol,rolAnterior) { protectMember(actor,target,rol,rolAnterior); }

async function staffIds(tx, idComunidad, rolAnterior) {
  const staff = await tx.membresia.findMany({
    where: { idComunidad, rol: { in: Object.keys(JERARQUIA).filter((rol) => JERARQUIA[rol] > JERARQUIA[rolAnterior]) } },
    select: { idUsuario: true },
  });
  return staff.map((member) => member.idUsuario);
}

function notifyStaff(idComunidad, staff) {
  for (const id of staff) emitToUser(id, EVENTS.COMMUNITY_BANS_CHANGED, { idComunidad });
}

export async function listBans(idComunidad, actor) {
  return withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad,actor,'ADMIN',tx);
    const bans = await tx.comunidadBaneo.findMany({
      where: { idComunidad, OR:[{fechaVencimiento:null},{fechaVencimiento:{gt:new Date()}}],rolAnterior: { in: lowerRoles(rol) } },
      orderBy: [{ fechaCreacion: 'desc' }, { idUsuario: 'asc' }],
      select: { fechaVencimiento:true,motivo: true, rolAnterior: true, fechaCreacion: true, usuario: { select: usuarioPublicoSelect }, autor: { select: usuarioPublicoSelect } },
    });
    return bans.map(({ usuario, autor, ...ban }) => ({
      ...ban, usuario: toUsuarioPublico(usuario), autor: autor ? toUsuarioPublico(autor) : null,
    }));
  });
}

// `options.inTx` corre en la misma transacción antes de banear (confirmación de propuestas, T-52).
export async function banMember(idComunidad, actor, target, { motivo,duracion='PERMANENTE' }, idCanal, options = {}) {
  return withCommunityAccessChange(idComunidad, async (tx) => {
    const context=await requireRole(idComunidad,actor,'ADMIN',tx);
    if(idCanal&&(await tx.canal.findUnique({where:{id:idCanal},select:{idComunidad:true}}))?.idComunidad!==idComunidad)throw new AppError(404,'CHANNEL_NOT_FOUND','El canal no existe');
    if(idCanal)await requireChannelPermission(idCanal,target,'VER',tx);
    const {rol}=context;
    const existing = await tx.comunidadBaneo.findUnique({ where: banKey(idComunidad, target) });
    requireTarget(actor, target, rol, existing?.rolAnterior);
    if(existing&&(!existing.fechaVencimiento||existing.fechaVencimiento>new Date()))return null;
    if(existing)await tx.comunidadBaneo.delete({where:banKey(idComunidad,target)});
    const member = await getMembership(idComunidad, target, tx);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'El usuario no es integrante de esta comunidad');
    requireTarget(actor, target, rol, member.rol);
    protectModerationTarget(actor, target, rol, member.rol);
    await options.inTx?.(tx);
    await tx.comunidadBaneo.create({ data: { idComunidad, idUsuario: target, idAutor: actor, rolAnterior: member.rol, motivo,fechaVencimiento:duracion==='PERMANENTE'?null:new Date(Date.now()+(duracion==='30_MIN'?30*60:5*60*60)*1000) } });
    await tx.membresia.delete({ where: banKey(idComunidad, target) });
    const handle = (await tx.usuario.findUnique({ where: { id: target }, select: { nombreUsuario: true } }))?.nombreUsuario;
    await auditModeration(tx, idComunidad, options.auditActor ?? actor, `${options.auditPrefix ?? ''}Baneó a @${handle} (${etiquetaDuracion(duracion)})${motivo ? `. Motivo: ${motivo}` : ''}`);
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: { id: true } });
    return { notices: await securityNotice(tx, [target], 'baneo', idComunidad), channels: canales.map(({ id }) => id), staff: await staffIds(tx, idComunidad, member.rol) };
  }, undefined, (result) => {
    if (!result) return;
    publishNotices(result.notices);
    leaveCommunity(idComunidad, target, result.channels);
    emitToUser(target, EVENTS.COMMUNITY_LEFT, { idComunidad });
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MEMBER_LEFT, { idComunidad, idUsuario: target });
    notifyStaff(idComunidad, result.staff);
  });
}

export async function removeBan(idComunidad, actor, target) {
  await withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad,actor,'ADMIN',tx);
    const existing = await tx.comunidadBaneo.findUnique({ where: banKey(idComunidad, target) });
    requireTarget(actor, target, rol, existing?.rolAnterior);
    if (!existing) return null;
    await tx.comunidadBaneo.delete({ where: banKey(idComunidad, target) });
    const handle = (await tx.usuario.findUnique({ where: { id: target }, select: { nombreUsuario: true } }))?.nombreUsuario;
    await auditModeration(tx, idComunidad, actor, `Levantó el baneo de @${handle}`);
    return { staff: await staffIds(tx, idComunidad, existing.rolAnterior), notices: await securityNotice(tx, [target], 'rehabilitado', idComunidad) };
  }, undefined, (result) => { if (result) { publishNotices(result.notices); notifyStaff(idComunidad, result.staff); } });
}
