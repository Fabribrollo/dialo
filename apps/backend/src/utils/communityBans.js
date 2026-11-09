import { AppError } from './AppError.js';

export async function requireNotBanned(db, idComunidad, idUsuario) {
  const ban = await db.comunidadBaneo.findUnique({
    where: { idComunidad_idUsuario: { idComunidad, idUsuario } },
    select: { idUsuario: true },
  });
  if (ban) throw new AppError(403, 'COMMUNITY_BANNED', 'No podés ingresar a esta comunidad porque tu acceso fue bloqueado');
}
