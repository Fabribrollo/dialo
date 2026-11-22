// Forma pública compartida por el historial, el último mensaje y los sockets.
export const mensajeSelect = {
  adjunto: { select: { id: true, nombre: true, tipo: true } },
  idHilo:true,fechaEntrega:true,fechaLectura:true,
  encuesta:{select:{opciones:true,multiple:true,cerrada:true,votos:{select:{idUsuario:true,opcion:true}}}},
  _count:{select:{hijosHilo:true}},
  fechaFijado:true,
  reacciones:{select:{idUsuario:true,emoji:true}},
  respuesta:{select:{id:true,idAutor:true,contenido:true,fechaEliminacion:true,autor:{select:{nombreVisible:true}},adjunto:{select:{tipo:true}}}},
  registroLlamada: true,
  idGrupoAdjuntos:true, cantidadGrupoAdjuntos:true,
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
    ...(mensaje.adjunto && !eliminado && { adjunto: mensaje.adjunto }),
    ...(mensaje.registroLlamada && {registroLlamada:true}),
    ...(mensaje.idGrupoAdjuntos&&{grupoAdjuntos:{id:mensaje.idGrupoAdjuntos,total:mensaje.cantidadGrupoAdjuntos}}),
    ...messageInteractions(mensaje),
    id: mensaje.id,
    idConversacion: mensaje.idConversacion,
    idAutor: mensaje.idAutor,
    contenido: eliminado ? null : mensaje.contenido,
    fechaCreacion: mensaje.fechaCreacion,
    fechaEdicion: mensaje.fechaEdicion,
    eliminado,
  };
}

// Cursor por fecha e ID: el ID solo desempata mensajes con la misma fecha.
export function olderMessagesWhere(referencia) {
  return {
    OR: [
      { fechaCreacion: { lt: referencia.fechaCreacion } },
      { fechaCreacion: referencia.fechaCreacion, id: { lt: referencia.id } },
    ],
  };
}

export function messageInteractions(m){
 if(m.fechaEliminacion)return {fechaFijado:null,reacciones:[]};
 const groups=new Map();for(const item of m.reacciones??[]){const users=groups.get(item.emoji)??[];users.push(item.idUsuario);groups.set(item.emoji,users);}
 return {
 ...(m.idHilo&&{idHilo:m.idHilo}),...(m._count?.hijosHilo&&{respuestasHilo:m._count.hijosHilo}),...(m.encuesta&&{encuesta:m.encuesta}),...(m.fechaEntrega&&{fechaEntrega:m.fechaEntrega}),...(m.fechaLectura&&{fechaLectura:m.fechaLectura}),
 fechaFijado:m.fechaFijado??null,
 reacciones:[...groups].map(([emoji,usuarios])=>({emoji,usuarios})),
 ...(m.respuesta&&{respuesta:{id:m.respuesta.id,idAutor:m.respuesta.idAutor,autor:m.respuesta.autor.nombreVisible,eliminado:Boolean(m.respuesta.fechaEliminacion),contenido:m.respuesta.fechaEliminacion?null:m.respuesta.contenido,...(!m.respuesta.fechaEliminacion&&m.respuesta.adjunto&&{tipoAdjunto:m.respuesta.adjunto.tipo})}})
 };
}
