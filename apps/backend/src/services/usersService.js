import { prisma } from "../prisma/client.js";
import { AppError } from "../utils/AppError.js";
import {
  toUsuarioPublico,
  usuarioPropioSelect,
  usuarioPublicoSelect,
} from "../utils/selects.js";
import { uploadAvatar } from "../utils/storage.js";
import { emitToUser } from "../sockets/emitter.js";
import { EVENTS } from "../sockets/events.js";
import { getFriendIds } from "./friendsService.js";

async function emitUserUpdated(usuario) {
  const payload = { usuario: toUsuarioPublico(usuario) };
  const idsAmigos = await getFriendIds(usuario.id);
  for (const idUsuario of [usuario.id, ...idsAmigos])
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

export async function updateAvatar(id, buffer) {
  const fotoUrl = await uploadAvatar(buffer, id);
  return updateMe(id, { fotoUrl });
}
