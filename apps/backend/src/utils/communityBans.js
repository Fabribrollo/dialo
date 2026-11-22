import { AppError } from './AppError.js';

export async function requireNotBanned(db, idComunidad, idUsuario) {
  const ban = await db.comunidadBaneo.findUnique({
    where: { idComunidad_idUsuario: { idComunidad, idUsuario } },
    select: { idUsuario: true,fechaVencimiento:true },
  });
  if(ban?.fechaVencimiento&&ban.fechaVencimiento<=new Date()){await db.comunidadBaneo.deleteMany({where:{idComunidad,idUsuario,fechaVencimiento:{lte:new Date()}}});return;}
  if (ban) throw new AppError(403, 'COMMUNITY_BANNED', 'No podés ingresar a esta comunidad porque tu acceso fue bloqueado');
}
