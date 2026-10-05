export const usuarioPublicoSelect = {
  id: true,
  nombreUsuario: true,
  nombreVisible: true,
  fotoUrl: true,
  informacionPersonal: true,
  disponibilidad: true,
};

export const usuarioPropioSelect = {
  ...usuarioPublicoSelect,
  correo: true,
  fechaCreacion: true,
};

export function toUsuarioPublico(usuario) {
  if (!usuario) return null;
  const { id, nombreUsuario, nombreVisible, fotoUrl, informacionPersonal, disponibilidad } = usuario;
  return {
    id,
    nombreUsuario,
    nombreVisible,
    fotoUrl,
    informacionPersonal,
    disponibilidad: disponibilidad === 'INVISIBLE' ? 'AUSENTE' : disponibilidad,
  };
}
