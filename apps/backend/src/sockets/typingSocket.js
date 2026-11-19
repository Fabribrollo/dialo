import { z } from 'zod';
import { requireSocketUser } from './authenticate.js';
import { requireConversationParticipant } from '../services/conversationsService.js';
import { areFriends } from '../services/friendsService.js';
import { withChannelPermission } from '../services/channelsService.js';
import { emitToChannel, emitToConversation } from './emitter.js';
const payload = z.strictObject({ tipo: z.enum(['canal', 'conversacion']), id: z.number().int().positive().max(2147483647), escribiendo: z.boolean() });

export function registerTyping(socket, ready) {
  let last = 0;
  socket.on('typing:update', async (input, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      await ready;
      const parsed = payload.safeParse(input);
      if (!parsed.success) return reply({ ok: false });
      const user = await requireSocketUser(socket), data = parsed.data;
      if (Date.now() - last < 1000 && data.escribiendo) return reply({ ok: true });
      last = Date.now();
      const event = { ...data, idUsuario: user.id, nombre: user.nombreVisible, hasta: Date.now() + 4500 };
      if (data.tipo === 'canal') {
        await withChannelPermission(data.id, user.id, 'ESCRIBIR', async () => {}, () => emitToChannel(data.id, 'typing:updated', event));
      } else {
        const c = await requireConversationParticipant(data.id, user.id);
        const other = c.idUsuarioA === user.id ? c.idUsuarioB : c.idUsuarioA;
        if (!await areFriends(user.id, other)) return reply({ ok: false });
        emitToConversation(data.id, 'typing:updated', event);
      }
      reply({ ok: true });
    } catch { reply({ ok: false }); }
  });
}
