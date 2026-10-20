import { mensajeSelect } from './messages.js';
import { toUsuarioPublico, usuarioPublicoSelect } from './selects.js';

// Compartido con los futuros eventos de T-26. Los campos internos de auditoría
// y el contenido de una eliminación nunca forman parte del DTO público.
export const channelMessageSelect = {
  ...mensajeSelect,
  idCanal: true,
  idUsuarioEliminacion: true,
  autor: { select: usuarioPublicoSelect },
};

export function toChannelMessage(mensaje) {
  const eliminado = mensaje.fechaEliminacion !== null;
  return {
    id: mensaje.id,
    idCanal: mensaje.idCanal,
    autor: toUsuarioPublico(mensaje.autor),
    contenido: eliminado ? null : mensaje.contenido,
    fechaCreacion: mensaje.fechaCreacion,
    fechaEdicion: mensaje.fechaEdicion,
    eliminado,
    eliminadoPorModerador: eliminado && mensaje.idUsuarioEliminacion !== null && mensaje.idUsuarioEliminacion !== mensaje.idAutor,
  };
}
