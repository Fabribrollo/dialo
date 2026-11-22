// Solo un grupo persistido por el servidor puede convertirse en álbum.
export function groupAttachmentMessages(messages){
 const groups=new Map(),keyOf=m=>m.grupoAdjuntos?.id&&m.grupoAdjuntos.total>=4?JSON.stringify([m.grupoAdjuntos.id,m.idAutor??m.autor?.id,m.idCanal??null,m.idConversacion??null]):null;
 for(const m of messages){const key=keyOf(m);if(key&&m.adjunto&&!m.eliminado){const group=groups.get(key)??[];group.push(m);groups.set(key,group);}}
 const rendered=new Set();return messages.flatMap(m=>{const key=keyOf(m),items=groups.get(key);if(!key||!m.adjunto||m.eliminado||items.length<4)return [m];if(rendered.has(key))return [];rendered.add(key);return [{...m,album:items}];});
}
