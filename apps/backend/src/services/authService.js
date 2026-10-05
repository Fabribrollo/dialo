import { prisma } from '../prisma/client.js';

const authUserSelect = { id: true, nombreUsuario: true, nombreVisible: true };

export async function findAuthUserById(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.usuario.findUnique({ where: { id }, select: authUserSelect });
}

export async function findAuthUserBySessionToken(token) {
  if (!token) return null;
  return null;
}
