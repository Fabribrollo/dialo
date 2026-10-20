import { prisma } from '../prisma/client.js';
import { closeCommunity, emitToCommunity, emitToUser, joinCommunity, leaveCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPublicoSelect } from '../utils/selects.js';
import { uploadImage } from '../utils/storage.js';
import { withCommunityChannelsLock } from '../utils/communityChannelsLock.js';

export const JERARQUIA = { INTEGRANTE: 1, MODERADOR: 2, ADMIN: 3, PROPIETARIO: 4 };

const comunidadSelect = {
  id: true,
  nombre: true,
  imagenUrl: true,
  tipo: true,
  fechaCreacion: true,
  membresias: { where: { rol: 'PROPIETARIO' }, select: { idUsuario: true } },
  _count: { select: { membresias: true } },
};

function toComunidad(comunidad, miRol) {
  return {
    id: comunidad.id,
    nombre: comunidad.nombre,
    imagenUrl: comunidad.imagenUrl,
    tipo: comunidad.tipo,
    idPropietario: comunidad.membresias[0]?.idUsuario ?? null,
    cantidadIntegrantes: comunidad._count.membresias,
    miRol,
    fechaCreacion: comunidad.fechaCreacion,
  };
}

const integranteSelect = { rol: true, fechaIngreso: true, usuario: { select: usuarioPublicoSelect } };

export function toIntegrante(membresia) {
  return { usuario: toUsuarioPublico(membresia.usuario), rol: membresia.rol, fechaIngreso: membresia.fechaIngreso };
}

export function getMembership(idComunidad, idUsuario) {
  return prisma.membresia.findUnique({
    where: { idComunidad_idUsuario: { idComunidad, idUsuario } },
    select: { rol: true },
  });
}

export async function requireRole(idComunidad, idUsuario, rolMinimo = 'INTEGRANTE', db = prisma) {
  const comunidad = await db.comunidad.findUnique({
    where: { id: idComunidad },
    select: { tipo: true, membresias: { where: { idUsuario }, select: { rol: true } } },
  });
  const rol = comunidad?.membresias[0]?.rol;
  if (!comunidad || (!rol && comunidad.tipo === 'PRIVADA')) {
    throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe');
  }
  if (!rol) throw new AppError(403, 'NOT_MEMBER', 'No sos integrante de esta comunidad');
  if (JERARQUIA[rol] < JERARQUIA[rolMinimo]) {
    throw new AppError(403, 'INSUFFICIENT_ROLE', 'Tu rol no te permite hacer esto');
  }
  return { rol };
}

export async function getCommunityPreview(idComunidad, idUsuario) {
  const comunidad = await prisma.comunidad.findUnique({
    where: { id: idComunidad },
    select: {
      id: true,
      nombre: true,
      imagenUrl: true,
      tipo: true,
      _count: { select: { membresias: true } },
      membresias: { where: { idUsuario }, select: { rol: true } },
    },
  });
  if (!comunidad) throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe');
  return {
    id: comunidad.id,
    nombre: comunidad.nombre,
    imagenUrl: comunidad.imagenUrl,
    tipo: comunidad.tipo,
    cantidadIntegrantes: comunidad._count.membresias,
    esIntegrante: comunidad.membresias.length > 0,
  };
}

export async function listCommunities(idUsuario) {
  const membresias = await prisma.membresia.findMany({
    where: { idUsuario },
    orderBy: [{ fechaIngreso: 'desc' }, { idComunidad: 'desc' }],
    select: { rol: true, comunidad: { select: comunidadSelect } },
  });
  return membresias.map((m) => toComunidad(m.comunidad, m.rol));
}

export async function createCommunity(idUsuario, { nombre, tipo }) {
  const creada = await prisma.comunidad.create({
    data: {
      nombre,
      tipo,
      membresias: { create: { idUsuario, rol: 'PROPIETARIO' } },
      canales: { create: { nombre: 'general', tipo: 'TEXTO', privado: false } },
    },
    select: comunidadSelect,
  });
  const comunidad = toComunidad(creada, 'PROPIETARIO');
  joinCommunity(comunidad.id, [idUsuario]);
  emitToUser(idUsuario, EVENTS.COMMUNITY_NEW, { comunidad });
  return comunidad;
}

export async function getCommunity(idComunidad, idUsuario) {
  const { rol } = await requireRole(idComunidad, idUsuario);
  const comunidad = await prisma.comunidad.findUnique({ where: { id: idComunidad }, select: comunidadSelect });
  if (!comunidad) throw new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe');
  return toComunidad(comunidad, rol);
}

async function saveChanges(idComunidad, rol, data) {
  const comunidad = await prisma.comunidad.update({ where: { id: idComunidad }, data, select: comunidadSelect });
  emitToCommunity(idComunidad, EVENTS.COMMUNITY_UPDATED, { comunidad: toComunidad(comunidad) });
  return toComunidad(comunidad, rol);
}

export async function updateCommunity(idComunidad, idUsuario, cambios) {
  const { rol } = await requireRole(idComunidad, idUsuario, 'ADMIN');
  return saveChanges(idComunidad, rol, cambios);
}

export async function updateCommunityImage(idComunidad, idUsuario, buffer) {
  const { rol } = await requireRole(idComunidad, idUsuario, 'ADMIN');
  const imagenUrl = await uploadImage(buffer, {
    folder: 'dialo/communities',
    publicId: `comunidad-${idComunidad}`,
  });
  return saveChanges(idComunidad, rol, { imagenUrl });
}

export async function deleteCommunity(idComunidad, idUsuario) {
  await withCommunityChannelsLock(idComunidad, async (tx) => {
    await requireRole(idComunidad, idUsuario, 'PROPIETARIO', tx);
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: { id: true } });
    await tx.comunidad.delete({ where: { id: idComunidad } });
    return canales;
  }, undefined, (canales) => {
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_DELETED, { idComunidad });
    closeCommunity(idComunidad, canales.map((c) => c.id));
  });
}

export async function listMembers(idComunidad, idUsuario) {
  await requireRole(idComunidad, idUsuario);
  const membresias = await prisma.membresia.findMany({
    where: { idComunidad },
    orderBy: [{ rol: 'asc' }, { usuario: { nombreVisible: 'asc' } }, { idUsuario: 'asc' }],
    select: integranteSelect,
  });
  return membresias.map(toIntegrante);
}

export async function addMember(idComunidad, idUsuario, tx = prisma) {
  const membresia = await tx.membresia.create({
    data: { idComunidad, idUsuario, rol: 'INTEGRANTE' },
    select: integranteSelect,
  });
  return toIntegrante(membresia);
}

export async function announceJoin(idComunidad, integrante) {
  const idUsuario = integrante.usuario.id;
  joinCommunity(idComunidad, [idUsuario]);
  emitToCommunity(idComunidad, EVENTS.COMMUNITY_MEMBER_JOINED, { idComunidad, integrante });
  const comunidad = await getCommunity(idComunidad, idUsuario);
  emitToUser(idUsuario, EVENTS.COMMUNITY_NEW, { comunidad });
  return comunidad;
}

export async function abandonCommunity(idComunidad, idUsuario) {
  await withCommunityChannelsLock(idComunidad, async (tx) => {
    const { rol } = await requireRole(idComunidad, idUsuario, 'INTEGRANTE', tx);
    if (rol === 'PROPIETARIO') {
      throw new AppError(409, 'OWNER_CANNOT_LEAVE', 'Transferí la propiedad o eliminá la comunidad antes de abandonarla');
    }
    const canales = await tx.canal.findMany({ where: { idComunidad }, select: { id: true } });
    await tx.membresia.delete({ where: { idComunidad_idUsuario: { idComunidad, idUsuario } } });
    return canales;
  }, undefined, (canales) => {
    leaveCommunity(idComunidad, idUsuario, canales.map((c) => c.id));
    emitToCommunity(idComunidad, EVENTS.COMMUNITY_MEMBER_LEFT, { idComunidad, idUsuario });
    emitToUser(idUsuario, EVENTS.COMMUNITY_LEFT, { idComunidad });
  });
}
