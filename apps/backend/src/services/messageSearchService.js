import { prisma } from '../prisma/client.js';
import { requireConversationParticipant } from './conversationsService.js';
import { withChannelPermission } from './channelsService.js';
import { mensajeSelect, olderMessagesWhere, toMensaje } from '../utils/messages.js';
import { channelMessageSelect, toChannelMessage } from '../utils/channelMessages.js';
import { AppError } from '../utils/AppError.js';

export async function searchMessages(kind, id, actor, { q, cursor, limit }) {
  const key = kind === 'channel' ? 'idCanal' : 'idConversacion';
  const search = async (db) => {
    let older = {};
    if (cursor) {
      const reference = await db.mensaje.findFirst({ where: { id: cursor, [key]: id }, select: { id: true, fechaCreacion: true } });
      if (!reference) throw new AppError(400, 'INVALID_CURSOR', 'El cursor no pertenece a este historial');
      older = olderMessagesWhere(reference);
    }
    const rows = await db.mensaje.findMany({
      where: { [key]: id, fechaEliminacion: null, contenido: { contains: q, mode: 'insensitive' }, ...older },
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
