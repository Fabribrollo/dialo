import { channelSelect } from '../utils/channelPermissions.js';
import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import { audience, mutateChannel, publishChannelChange, requireChannelPermission } from './channelsService.js';

const permissionOrder = ['VER', 'ESCRIBIR', 'HABLAR', 'TRANSMITIR'];
const normalize = (permisos) => permissionOrder.filter((permission) =>
  permisos.includes(permission) || (permission === 'VER' && permisos.length > 0));

async function toAccess(db, canal) {
  const grants = canal.habilitacionesUsuario;
  const members = grants.length ? await db.membresia.findMany({
    where: { idComunidad: canal.idComunidad, idUsuario: { in: grants.map((g) => g.idUsuario) } },
    select: { idUsuario: true, usuario: { select: usuarioPublicoSelect } },
  }) : [];
  const users = new Map(members.map((m) => [m.idUsuario, toUsuarioPublico(m.usuario)]));
  return {
    privado: canal.privado,
    habilitaciones: [
      ...[...canal.habilitacionesRol].sort((a, b) => a.rol.localeCompare(b.rol))
        .map((g) => ({ rol: g.rol, permisos: normalize(g.permisos) })),
      ...[...grants].sort((a, b) => a.idUsuario - b.idUsuario)
        .filter((g) => users.has(g.idUsuario))
        .map((g) => ({ usuario: users.get(g.idUsuario), permisos: normalize(g.permisos) })),
    ],
  };
}

export async function getChannelAccess(idCanal, idUsuario) {
  const { canal, rol } = await requireChannelPermission(idCanal, idUsuario);
  if (!['PROPIETARIO', 'ADMIN'].includes(rol)) {
    throw new AppError(403, 'INSUFFICIENT_ROLE', 'Tu rol no permite configurar el acceso');
  }
  return toAccess(prisma, canal);
}

export async function replaceChannelAccess(idCanal, idUsuario, { privado, habilitaciones }) {
  const saved = await mutateChannel(idCanal, idUsuario, async (tx, { canal: previous }, miembros) => {
    const memberIds = new Set(miembros.map((m) => m.idUsuario));
    const individual = habilitaciones.filter((g) => g.idUsuario !== undefined);
    if (individual.some((g) => !memberIds.has(g.idUsuario))) {
      throw new AppError(404, 'MEMBER_NOT_FOUND', 'Algún usuario no es integrante de esta comunidad');
    }
    // Reemplazo completo, atómico y coordinado con las demás escrituras del canal.
    await tx.canalRol.deleteMany({ where: { idCanal } });
    await tx.canalUsuario.deleteMany({ where: { idCanal } });
    // Una lista vacía no concede ni deniega: equivale a omitir la habilitación.
    // La base exige al menos un permiso en cada fila guardada.
    const roles = habilitaciones.filter((g) => g.rol && g.permisos.length);
    if (roles.length) await tx.canalRol.createMany({
      data: roles.map((g) => ({ idCanal, rol: g.rol, permisos: normalize(g.permisos) })),
    });
    const nonempty = individual.filter((g) => g.permisos.length);
    if (nonempty.length) await tx.canalUsuario.createMany({
      data: nonempty.map((g) => ({ idCanal, idComunidad: previous.idComunidad, idUsuario: g.idUsuario, permisos: normalize(g.permisos) })),
    });
    const canal = await tx.canal.update({ where: { id: idCanal }, data: { privado }, select: channelSelect });
    return { canal, before: audience(previous, miembros), after: audience(canal, miembros), acceso: await toAccess(tx, canal) };
  });
  publishChannelChange(saved.canal, saved.before, saved.after);
  return saved.acceso;
}
