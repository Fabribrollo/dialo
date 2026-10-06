// Forma pública compartida por el historial, el último mensaje y los sockets.
export const mensajeSelect = {
  id: true,
  idConversacion: true,
  idAutor: true,
  contenido: true,
  fechaCreacion: true,
  fechaEdicion: true,
  fechaEliminacion: true,
};

export function toMensaje(mensaje) {
  const eliminado = mensaje.fechaEliminacion !== null;
  return {
    id: mensaje.id,
    idConversacion: mensaje.idConversacion,
    idAutor: mensaje.idAutor,
    contenido: eliminado ? null : mensaje.contenido,
    fechaCreacion: mensaje.fechaCreacion,
    fechaEdicion: mensaje.fechaEdicion,
    eliminado,
  };
}
