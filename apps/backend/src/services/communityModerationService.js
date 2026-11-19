import { emitToCommunity } from '../sockets/emitter.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { prisma } from '../prisma/client.js';
import { requireRole } from './communitiesService.js';
import { askDecisions } from '../utils/decisions.js';
import { AppError } from '../utils/AppError.js';

const UMBRAL = 0.8;

const moderacionSelect = {
  moderacionActiva: true,
  reglasModeracion: { orderBy: { id: 'asc' }, select: { descripcion: true } },
};

function toModeration(comunidad) {
  return {
    activa: comunidad.moderacionActiva,
    reglas: comunidad.reglasModeracion.map((regla) => regla.descripcion),
  };
}

export async function getModeration(idComunidad, idUsuario) {
  await requireRole(idComunidad, idUsuario, 'ADMIN');
  const comunidad = await prisma.comunidad.findUnique({ where: { id: idComunidad }, select: moderacionSelect });
  return toModeration(comunidad);
}

export async function replaceModeration(idComunidad, idUsuario, { activa, reglas }) {
  const comunidad = await withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'ADMIN', tx);
    await tx.reglaModeracion.deleteMany({ where: { idComunidad } });
    await tx.reglaModeracion.createMany({ data: reglas.map((descripcion) => ({ idComunidad, descripcion })) });
    return tx.comunidad.update({ where: { id: idComunidad }, data: { moderacionActiva: activa }, select: moderacionSelect });
  });
  emitToCommunity(idComunidad, 'community:moderation-changed', { idComunidad, activa });
  return toModeration(comunidad);
}

export async function moderateChannelMessage(idCanal, contenido, idAutor) {
  const canal = await prisma.canal.findUnique({
    where: { id: idCanal },
    select: { idComunidad: true, comunidad: { select: { moderacionActiva: true, reglasModeracion: { select: { id: true, descripcion: true } } } } },
  });
  const comunidad = canal?.comunidad;
  if (!comunidad?.moderacionActiva || comunidad.reglasModeracion.length === 0) return;

  const questions = comunidad.reglasModeracion.map((regla) => ({
    type: 'predicate',
    name: `regla_${regla.id}`,
    instructions: `¿El mensaje contiene ${regla.descripcion}?`,
  }));
  const resultado = await askDecisions(contenido, questions);
  if (!resultado) return;

  const bloqueada = comunidad.reglasModeracion.find((regla) => resultado[`regla_${regla.id}`] >= UMBRAL);
  if (bloqueada && idAutor) await prisma.bloqueoMensaje.create({
    data: { idComunidad: canal.idComunidad, idCanal, idAutor, contenido, motivo: bloqueada.descripcion },
  });
  if (bloqueada) throw new AppError(422, 'MESSAGE_BLOCKED', `Bloqueado: contiene ${bloqueada.descripcion}`);
}
