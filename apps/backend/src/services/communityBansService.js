import { requireRole, JERARQUIA, getMembership } from './communitiesService.js';
import { withCommunityAccessChange } from './channelsService.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { AppError } from '../utils/AppError.js';
import { usuarioPublicoSelect, toUsuarioPublico } from '../utils/selects.js';
import { emitToCommunity, emitToUser, leaveCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';

const banKey = (idComunidad, idUsuario) => ({ idComunidad_idUsuario: { idComunidad, idUsuario } });
const lowerRoles = (rol) => Object.keys(JERARQUIA).filter((other) => JERARQUIA[other] < JERARQUIA[rol]);

function requireTarget(actor, target, rol, rolAnterior) {
  if (actor === target || (rolAnterior && !lowerRoles(rol).includes(rolAnterior))) {
    throw new AppError(403, 'BAN_HIERARCHY', 'Solo podés gestionar baneos de integrantes con un rol base inferior al tuyo');
  }
}

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
    const { rol } = await requireRole(idComunidad, actor, 'MODERADOR', tx);
    const bans = await tx.comunidadBaneo.findMany({
      where: { idComunidad, rolAnterior: { in: lowerRoles(rol) } },
      orderBy: [{ fechaCreacion: 'desc' }, { idUsuario: 'asc' }],
      select: { motivo: true, rolAnterior: true, fechaCreacion: true, usuario: { select: usuarioPublicoSelect }, autor: { select: usuarioPublicoSelect } },
    });
    return bans.map(({ usuario, autor, ...ban }) => ({
      ...ban, usuario: toUsuarioPublico(usuario), autor: autor ? toUsuarioPublico(autor) : null,
    }));
  });
}

export async function banMember(idComunidad, actor, target, { motivo }) {
  await withCommunityAccessChange(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad, actor, 'MODERADOR', tx);
    const existing = await tx.comunidadBaneo.findUnique({ where: banKey(idComunidad, target) });
    requireTarget(actor, target, rol, existing?.rolAnterior);
    if (existing) return null;
    const member = await getMembership(idComunidad, target, tx);
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'El usuario no es integrante de esta comunidad');
    requireTarget(actor, target, rol, member.rol);
    await tx.comunidadBaneo.create({ data: { idComunidad, idUsuario: target, idAutor: actor, rolAnterior: member.rol, motivo } });
    await tx.membresia.delete({ where: banKey(idComunidad, target) });
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: { id: true } });
    return { channels: canales.map(({ id }) => id), staff: await staffIds(tx, idComunidad, member.rol) };
  }, undefined, (result) => {
    if (!result) return;
    leaveCommunity(idComunidad, target, result.channels);
    emitToUser(target, EVENTS.COMMUNITY_LEFT, { idComunidad });
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MEMBER_LEFT, { idComunidad, idUsuario: target });
    notifyStaff(idComunidad, result.staff);
  });
}

export async function removeBan(idComunidad, actor, target) {
  await withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad, actor, 'MODERADOR', tx);
    const existing = await tx.comunidadBaneo.findUnique({ where: banKey(idComunidad, target) });
    requireTarget(actor, target, rol, existing?.rolAnterior);
    if (!existing) return null;
    await tx.comunidadBaneo.delete({ where: banKey(idComunidad, target) });
    return staffIds(tx, idComunidad, existing.rolAnterior);
  }, undefined, (staff) => { if (staff) notifyStaff(idComunidad, staff); });
}
