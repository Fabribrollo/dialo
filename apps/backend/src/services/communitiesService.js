import { prisma } from '../prisma/client.js';
import { closeCommunity, emitToCommunity, emitToUser, joinCommunity } from '../sockets/emitter.js';
import { EVENTS } from '../sockets/events.js';
import { AppError } from '../utils/AppError.js';
import { uploadImage } from '../utils/storage.js';

const JERARQUIA = { INTEGRANTE: 1, MODERADOR: 2, ADMIN: 3, PROPIETARIO: 4 };

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

export function getMembership(idComunidad, idUsuario) {
  return prisma.membresia.findUnique({
    where: { idComunidad_idUsuario: { idComunidad, idUsuario } },
    select: { rol: true },
  });
}

export async function requireRole(idComunidad, idUsuario, rolMinimo = 'INTEGRANTE') {
  const comunidad = await prisma.comunidad.findUnique({
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
  await requireRole(idComunidad, idUsuario, 'PROPIETARIO');
  const canales = await prisma.canal.findMany({ where: { idComunidad }, select: { id: true } });
  await prisma.comunidad.delete({ where: { id: idComunidad } });
  emitToCommunity(idComunidad, EVENTS.COMMUNITY_DELETED, { idComunidad });
  closeCommunity(idComunidad, canales.map((c) => c.id));
}
