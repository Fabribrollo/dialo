import { isOnline } from './presence.js';
export const usuarioPublicoSelect = {
  portadaUrl:true,tituloPerfil:true,pronombres:true,colorPerfil:true,
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
    ...(usuario.portadaUrl&&{portadaUrl:usuario.portadaUrl}),...(usuario.fechaCreacion&&{fechaCreacion:usuario.fechaCreacion}),
    ...(usuario.tituloPerfil&&{tituloPerfil:usuario.tituloPerfil}),...(usuario.pronombres&&{pronombres:usuario.pronombres}),...(usuario.colorPerfil&&{colorPerfil:usuario.colorPerfil}),
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
