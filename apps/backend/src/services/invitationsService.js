import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma/client.js';
import { requireNotBanned } from '../utils/communityBans.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import {
  addMember, announceJoin, getCommunity, getCommunityPreview, getMembership, requireRole,
} from './communitiesService.js';

const ERRORES = {
  REVOCADA: [410, 'INVITATION_REVOKED', 'La invitación fue revocada'],
  VENCIDA: [410, 'INVITATION_EXPIRED', 'La invitación venció'],
  AGOTADA: [410, 'INVITATION_EXHAUSTED', 'La invitación ya no tiene usos disponibles'],
};

const invitacionSelect = {
  id: true,
  codigo: true,
  idComunidad: true,
  usosMaximos: true,
  usos: true,
  fechaExpiracion: true,
  fechaRevocacion: true,
  fechaCreacion: true,
  creador: { select: usuarioPublicoSelect },
};

function estadoDe(invitacion) {
  if (invitacion.fechaRevocacion) return 'REVOCADA';
  if (invitacion.fechaExpiracion && invitacion.fechaExpiracion <= new Date()) return 'VENCIDA';
  if (invitacion.usosMaximos !== null && invitacion.usos >= invitacion.usosMaximos) return 'AGOTADA';
  return 'ACTIVA';
}

function invitationError(invitacion) {
  if (!invitacion) return new AppError(404, 'INVITATION_NOT_FOUND', 'La invitación no existe');
  const error = ERRORES[estadoDe(invitacion)];
  return error ? new AppError(...error) : null;
}

function toInvitacion(invitacion) {
  return {
    id: invitacion.id,
    codigo: invitacion.codigo,
    idComunidad: invitacion.idComunidad,
    creador: toUsuarioPublico(invitacion.creador),
    usosMaximos: invitacion.usosMaximos,
    usos: invitacion.usos,
    fechaExpiracion: invitacion.fechaExpiracion,
    estado: estadoDe(invitacion),
    fechaCreacion: invitacion.fechaCreacion,
  };
}

async function requireValidInvitation(codigo) {
  const invitacion = await prisma.invitacion.findUnique({ where: { codigo } });
  const error = invitationError(invitacion);
  if (error) throw error;
  return invitacion;
}

export async function acceptInvitation(codigo, idUsuario) {
  const { id, idComunidad } = await requireValidInvitation(codigo);
  const saved = await withCommunityChannelsLock(idComunidad, async (tx) => {
    const actual = await tx.invitacion.findUnique({ where: { id } });
    const error = invitationError(actual);
    if (error) throw error;
    await requireNotBanned(tx, idComunidad, idUsuario);
    if (await getMembership(idComunidad, idUsuario, tx)) {
      return { comunidad: await getCommunity(idComunidad, idUsuario, tx), created: false };
    }
    const integrante = await addMember(idComunidad, idUsuario, tx);
    const { count } = await tx.invitacion.updateMany({
      where: {
        id,
        fechaRevocacion: null,
        OR: [{ fechaExpiracion: null }, { fechaExpiracion: { gt: new Date() } }],
        AND: { OR: [{ usosMaximos: null }, { usos: { lt: prisma.invitacion.fields.usosMaximos } }] },
      },
      data: { usos: { increment: 1 } },
    });
    if (!count) {
      const current = await tx.invitacion.findUnique({ where: { id } });
      throw invitationError(current) ?? new AppError(410, 'INVITATION_EXHAUSTED', 'La invitación ya no tiene usos disponibles');
    }
    return { integrante, comunidad: await getCommunity(idComunidad, idUsuario, tx), created: true };
  }, () => invitationError(null), ({ integrante, comunidad }) => {
    if (integrante) announceJoin(idComunidad, integrante, comunidad);
  });
  return { comunidad: saved.comunidad, created: saved.created };
}

export async function createInvitation(idComunidad, idUsuario, { duracionHoras = null, usosMaximos = null }) {
  await requireRole(idComunidad, idUsuario, 'MODERADOR');
  const invitacion = await prisma.invitacion.create({
    data: {
      idComunidad,
      idCreador: idUsuario,
      codigo: randomBytes(8).toString('base64url'),
      usosMaximos,
      fechaExpiracion: duracionHoras === null ? null : new Date(Date.now() + duracionHoras * 3_600_000),
    },
    select: invitacionSelect,
  });
  return toInvitacion(invitacion);
}

export async function listInvitations(idComunidad, idUsuario) {
  await requireRole(idComunidad, idUsuario, 'MODERADOR');
  const invitaciones = await prisma.invitacion.findMany({
    where: { idComunidad },
    orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
    select: invitacionSelect,
  });
  return invitaciones.map(toInvitacion);
}

export async function revokeInvitation(idComunidad, idUsuario, idInvitacion) {
  await requireRole(idComunidad, idUsuario, 'MODERADOR');
  const { count } = await prisma.invitacion.updateMany({
    where: { id: idInvitacion, idComunidad, fechaRevocacion: null },
    data: { fechaRevocacion: new Date() },
  });
  if (count === 0 && !(await prisma.invitacion.count({ where: { id: idInvitacion, idComunidad } }))) {
    throw new AppError(404, 'INVITATION_NOT_FOUND', 'La invitación no existe');
  }
}

export async function previewInvitation(codigo, idUsuario) {
  const { idComunidad } = await requireValidInvitation(codigo);
  await requireNotBanned(prisma, idComunidad, idUsuario);
  return getCommunityPreview(idComunidad, idUsuario);
}
