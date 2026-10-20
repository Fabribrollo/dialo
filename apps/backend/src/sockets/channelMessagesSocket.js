import { requireSocketUser } from './authenticate.js';
import { AppError } from '../utils/AppError.js';
import { EVENTS } from './events.js';
import * as service from '../services/channelMessagesService.js';
import { sendChannelMessageSchema, editChannelMessageSchema, deleteChannelMessageSchema } from '../validations/channelMessagesValidation.js';

export function registerChannelMessageHandlers(socket, ready) {
  for (const [event, schema, operation] of [
    [EVENTS.CHANNEL_MESSAGE_SEND, sendChannelMessageSchema, service.sendChannelMessage],
    [EVENTS.CHANNEL_MESSAGE_EDIT, editChannelMessageSchema, service.editChannelMessage],
    [EVENTS.CHANNEL_MESSAGE_DELETE, deleteChannelMessageSchema, service.deleteChannelMessage],
  ]) socket.on(event, async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      await ready;
      const user = await requireSocketUser(socket);
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new AppError(400, 'VALIDATION_ERROR', 'Datos inválidos', parsed.error.issues.map((issue) => ({ campo: issue.path.join('.'), message: issue.message })));
      const data = await operation(user.id, parsed.data, (tx) => requireSocketUser(socket, tx));
      await requireSocketUser(socket);
      reply({ ok: true, data });
    } catch (error) {
      if (!(error instanceof AppError)) console.error(error);
      reply({ ok: false, error: error instanceof AppError
        ? { code: error.code, message: error.message, ...(error.details && { details: error.details }) }
        : { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
      if (error.code === 'UNAUTHORIZED') socket.disconnect(true);
    }
  });
}
