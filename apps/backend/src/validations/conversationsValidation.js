import { z } from 'zod';

// Los IDs del schema son enteros de PostgreSQL, no números arbitrarios.
const MAX_ID = 2_147_483_647;
const idParam = z.coerce.number().int().positive().max(MAX_ID);

export const createConversationSchema = z.object({
  idUsuario: z.number().int().positive().max(MAX_ID),
});

export const conversationIdParamsSchema = z.object({ id: idParam });

export const messagesQuerySchema = z.object({
  cursor: idParam.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
