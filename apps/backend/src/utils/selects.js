import { isOnline } from './presence.js';
export const usuarioPublicoSelect = {
  id: true,
  nombreUsuario: true,
  nombreVisible: true,
  fotoUrl: true,
  colorAvatar: true,
  informacionPersonal: true,
  disponibilidad: true,
};

export const usuarioPropioSelect = {
  ...usuarioPublicoSelect,
  preferencias: true,
  correo: true,
  fechaCreacion: true,
};

export function toUsuarioPublico(usuario) {
  if (!usuario) return null;
  const { id, nombreUsuario, nombreVisible, fotoUrl, colorAvatar, informacionPersonal, disponibilidad } = usuario;
  return {
    id,
    enLinea: disponibilidad !== 'INVISIBLE' && isOnline(id),
    nombreUsuario,
    nombreVisible,
    fotoUrl,
    ...(colorAvatar && { colorAvatar }),
    informacionPersonal,
    disponibilidad: disponibilidad === 'INVISIBLE' ? 'AUSENTE' : disponibilidad,
  };
}
