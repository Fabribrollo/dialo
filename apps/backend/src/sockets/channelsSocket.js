import { requireSocketUser } from './authenticate.js';
import { EVENTS } from './events.js';
import { rooms } from './emitter.js';
import { channelSubscriptionSchema } from '../validations/channelsValidation.js';
import { withChannelPermission } from '../services/channelsService.js';
import { toChannel } from '../utils/channelPermissions.js';
import { AppError } from '../utils/AppError.js';

export function registerChannelHandlers(socket, ready) {
  for (const event of [EVENTS.CHANNEL_SUBSCRIBE, EVENTS.CHANNEL_UNSUBSCRIBE]) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        await ready;
        const user = await requireSocketUser(socket);
        const parsed = channelSubscriptionSchema.safeParse(payload);
        if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Datos inválidos');
        const { idCanal } = parsed.data;
        if (event === EVENTS.CHANNEL_UNSUBSCRIBE) {
          // Se puede salir incluso después de perder acceso o borrarse el canal.
          await socket.leave(rooms.channel(idCanal));
          reply({ ok: true, data: {} });
        } else {
          const canal = await withChannelPermission(idCanal, user.id, 'VER', async (tx, context) => {
            await requireSocketUser(socket, tx);
            // No permitir que una revocación se intercale entre comprobar y unir.
            if (!socket.connected) throw new AppError(401, 'UNAUTHORIZED', 'La sesión no está conectada');
            await socket.join(rooms.channel(idCanal));
            return toChannel(context.canal, context.permisos);
          });
          reply({ ok: true, data: { canal } });
        }
      } catch (error) {
        if (!(error instanceof AppError)) console.error(error);
        reply({ ok: false, error: error instanceof AppError
          ? { code: error.code, message: error.message }
          : { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
        if (error.code === 'UNAUTHORIZED') socket.disconnect(true);
      }
    });
  }
}
