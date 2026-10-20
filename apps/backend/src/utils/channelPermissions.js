export const CHANNEL_PERMISSIONS = {
  TEXTO: ['VER', 'ESCRIBIR'],
  VOZ: ['VER', 'HABLAR', 'TRANSMITIR'],
  VIDEO: ['VER', 'HABLAR', 'TRANSMITIR'],
};

export function effectiveChannelPermissions(canal, rol, idUsuario) {
  if (!rol) return [];
  const allowed = CHANNEL_PERMISSIONS[canal.tipo] ?? [];
  if (rol === 'ADMIN' || rol === 'PROPIETARIO') return [...allowed];
  const result = new Set(canal.privado ? [] : canal.tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR']);
  for (const grant of canal.habilitacionesRol ?? []) {
    if (grant.rol === rol) for (const permission of grant.permisos) if (allowed.includes(permission)) result.add(permission);
  }
  for (const grant of canal.habilitacionesUsuario ?? []) {
    if (grant.idUsuario === idUsuario) for (const permission of grant.permisos) if (allowed.includes(permission)) result.add(permission);
  }
  if (result.size) result.add('VER');
  return allowed.filter((permission) => result.has(permission));
}

export const canModerateChannel = (rol, permisos) =>
  ['PROPIETARIO', 'ADMIN', 'MODERADOR'].includes(rol) && permisos.includes('VER');

export const channelSelect = {
  id: true, idComunidad: true, nombre: true, tipo: true, privado: true, posicion: true, fechaCreacion: true,
  habilitacionesRol: { select: { rol: true, permisos: true } },
  habilitacionesUsuario: { select: { idUsuario: true, permisos: true } },
};

export function toChannel(canal, misPermisos) {
  return {
    id: canal.id, idComunidad: canal.idComunidad, nombre: canal.nombre, tipo: canal.tipo,
    privado: canal.privado, posicion: canal.posicion, misPermisos, fechaCreacion: canal.fechaCreacion,
  };
}
