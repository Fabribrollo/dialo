import { prisma } from '../prisma/client.js';
import { requireConversationParticipant } from './conversationsService.js';
import { withChannelPermission } from './channelsService.js';
import { mensajeSelect, olderMessagesWhere, toMensaje } from '../utils/messages.js';
import { channelMessageSelect, toChannelMessage } from '../utils/channelMessages.js';
import { AppError } from '../utils/AppError.js';

export async function searchMessages(kind, id, actor, { q='', cursor, limit=20,autor,tipo='todos',desde,hasta,desfase=0 }) {
  const key = kind === 'channel' ? 'idCanal' : 'idConversacion';
  const search = async (db) => {
    const author=autor?await db.usuario.findFirst({where:{nombreUsuario:{equals:autor,mode:'insensitive'}},select:{id:true}}):null;
    let older = {};
    if (cursor) {
      const reference = await db.mensaje.findFirst({ where: { id: cursor, [key]: id }, select: { id: true, fechaCreacion: true } });
      if (!reference) throw new AppError(400, 'INVALID_CURSOR', 'El cursor no pertenece a este historial');
      older = olderMessagesWhere(reference);
    }
    const rows = await db.mensaje.findMany({
      where: { [key]: id, idHilo:null,fechaEliminacion: null,...(q?{contenido:{contains:q,mode:'insensitive'}}:{}),...(autor?{idAutor:author?.id??-1}:{}),...(desde||hasta?{fechaCreacion:{...(desde?{gte:new Date(new Date(desde+'T00:00:00Z').getTime()+desfase*60000)}:{}),...(hasta?{lt:new Date(new Date(hasta+'T00:00:00Z').getTime()+86400000+desfase*60000)}:{})}}:{}),...(tipo==='texto'?{adjunto:{is:null},encuesta:{is:null}}:tipo==='encuesta'?{encuesta:{isNot:null}}:tipo!=='todos'?{adjunto:{is:{tipo:tipo==='documento'?'application/pdf':{startsWith:{imagen:'image/',video:'video/',audio:'audio/'}[tipo]}}}}:{}),...(Object.keys(older).length?{AND:[older]}:{}) },
      select: kind === 'channel' ? channelMessageSelect : mensajeSelect,
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { items: page.map(kind === 'channel' ? toChannelMessage : toMensaje), nextCursor: rows.length > limit ? page.at(-1).id : null };
  };
  if (kind === 'channel') return withChannelPermission(id, actor, 'VER', (tx) => search(tx));
  await requireConversationParticipant(id, actor);
  return search(prisma);
}
