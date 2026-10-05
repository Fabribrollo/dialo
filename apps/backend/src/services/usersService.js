import { prisma } from '../prisma/client.js';
import { AppError } from '../utils/AppError.js';
import { toUsuarioPublico, usuarioPropioSelect, usuarioPublicoSelect } from '../utils/selects.js';
import { uploadAvatar } from '../utils/storage.js';

export function getMe(id) {
  return prisma.usuario.findUnique({ where: { id }, select: usuarioPropioSelect });
}

export function updateMe(id, cambios) {
  return prisma.usuario.update({ where: { id }, data: cambios, select: usuarioPropioSelect });
}

export async function getUserById(id) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: usuarioPublicoSelect });
  if (!usuario) throw new AppError(404, 'USER_NOT_FOUND', 'El usuario no existe');
  return toUsuarioPublico(usuario);
}

export async function updateAvatar(id, buffer) {
  const fotoUrl = await uploadAvatar(buffer, id);
  return updateMe(id, { fotoUrl });
}
