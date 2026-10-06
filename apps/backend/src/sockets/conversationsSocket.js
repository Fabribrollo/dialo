import { requireSocketUser } from './authenticate.js';
import { EVENTS } from './events.js';
import * as messagesService from '../services/messagesService.js';
import {
  sendMessageSchema, editMessageSchema, deleteMessageSchema,
} from '../validations/messagesValidation.js';
import { AppError } from '../utils/AppError.js';

export function registerConversationHandlers(socket, ready) {
  for (const [event, schema, service] of [
    [EVENTS.MESSAGE_SEND, sendMessageSchema, messagesService.sendMessage],
    [EVENTS.MESSAGE_EDIT, editMessageSchema, messagesService.editMessage],
    [EVENTS.MESSAGE_DELETE, deleteMessageSchema, messagesService.deleteMessage],
  ]) {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        // Los handlers se registran inmediatamente; el primer mensaje espera
        // la unión a rooms, sin perder eventos enviados al conectar.
        await ready;
        const user = await requireSocketUser(socket);
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw new AppError(400, 'VALIDATION_ERROR', 'Datos inválidos', parsed.error.issues.map((i) => ({
            campo: i.path.join('.'), message: i.message,
          })));
        }
        const data = await service(user.id, parsed.data);
        reply({ ok: true, data });
      } catch (error) {
        if (!(error instanceof AppError)) console.error(error);
        reply({
          ok: false,
          error: error instanceof AppError
            ? { code: error.code, message: error.message, ...(error.details && { details: error.details }) }
            : { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
        });
        if (error.code === 'UNAUTHORIZED') socket.disconnect(true);
      }
    });
  }
}
