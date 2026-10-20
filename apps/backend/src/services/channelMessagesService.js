import { withChannelPermission } from './channelsService.js';
import { AppError } from '../utils/AppError.js';
import { olderMessagesWhere } from '../utils/messages.js';
import { channelMessageSelect, toChannelMessage } from '../utils/channelMessages.js';

export async function listChannelMessages(idCanal, idUsuario, { cursor, limit = 30 } = {}) {
  // Se coordina con revocaciones, abandono, cambios de tipo y borrado. Cada
  // página revalida VER: no alcanza con conocer un ID o estar en una room.
  return withChannelPermission(idCanal, idUsuario, 'VER', async (tx, { canal }) => {
    if (canal.tipo !== 'TEXTO') {
      throw new AppError(400, 'CHANNEL_NOT_TEXT', 'El historial de mensajes corresponde a canales de texto');
    }
    let anteriores = {};
    if (cursor !== undefined) {
      const referencia = await tx.mensaje.findFirst({
        where: { id: cursor, idCanal }, select: { id: true, fechaCreacion: true },
      });
      if (!referencia) throw new AppError(400, 'VALIDATION_ERROR', 'El cursor no pertenece a este canal', [
        { campo: 'cursor', message: 'Indicá un mensaje existente de este canal' },
      ]);
      anteriores = olderMessagesWhere(referencia);
    }
    const mensajes = await tx.mensaje.findMany({
      where: { idCanal, ...anteriores },
      select: channelMessageSelect,
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const pagina = mensajes.slice(0, limit);
    return { items: pagina.map(toChannelMessage), nextCursor: mensajes.length > limit ? pagina.at(-1).id : null };
  });
}
