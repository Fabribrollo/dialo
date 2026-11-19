import { prisma } from "../prisma/client.js";
import { AppError } from "../utils/AppError.js";
import {
  toUsuarioPublico,
  usuarioPropioSelect,
  usuarioPublicoSelect,
} from "../utils/selects.js";
import { uploadImage } from "../utils/storage.js";
import { emitToUser } from "../sockets/emitter.js";
import { EVENTS } from "../sockets/events.js";
import { getFriendIds } from "./friendsService.js";
import { moderateImage } from "./imageModerationService.js";

export async function emitUserUpdated(usuario) {
  const payload = { usuario: toUsuarioPublico(usuario) };
  const memberships = await prisma.membresia.findMany({ where: { idUsuario: usuario.id }, select: { idComunidad: true } });
  const peers = await prisma.membresia.findMany({ where: { idComunidad: { in: memberships.map((m) => m.idComunidad) } }, select: { idUsuario: true } });
  const idsAmigos = await getFriendIds(usuario.id);
  for (const idUsuario of new Set([usuario.id, ...idsAmigos, ...peers.map((m) => m.idUsuario)]))
    emitToUser(idUsuario, EVENTS.USER_UPDATED, payload);
}

export function getMe(id) {
  return prisma.usuario.findUnique({
    where: { id },
    select: usuarioPropioSelect,
  });
}

export async function updateMe(id, cambios) {
  const usuario = await prisma.usuario.update({
    where: { id },
    data: cambios,
    select: usuarioPropioSelect,
  });
  await emitUserUpdated(usuario);
  return usuario;
}

export async function getUserById(id) {
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    select: usuarioPublicoSelect,
  });
  if (!usuario)
    throw new AppError(404, "USER_NOT_FOUND", "El usuario no existe");
  return toUsuarioPublico(usuario);
}

export async function updateAvatar(id, buffer, mimetype) {
  await moderateImage(buffer, mimetype);
  const fotoUrl = await uploadImage(buffer, {
    folder: "dialo/avatars",
    publicId: `usuario-${id}`,
    gravity: "face",
  });
  return updateMe(id, { fotoUrl });
}

export async function emitUserUpdatedById(id) { const user = await getMe(id); if (user) await emitUserUpdated(user); }
