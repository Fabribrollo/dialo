import { z } from 'zod';

const MAX_ID = 2_147_483_647;
const idParam = z.coerce.number().int().positive().max(MAX_ID);

export const invitationCodeParamsSchema = z.object({ codigo: z.string().min(1).max(16) });

export const invitationIdParamsSchema = z.object({ id: idParam, idInvitacion: idParam });

export const createInvitationSchema = z.strictObject({
  duracionHoras: z.union([z.literal(1), z.literal(24), z.literal(168), z.null()]).optional(),
  usosMaximos: z.number().int().min(1).max(100).nullable().optional(),
});
