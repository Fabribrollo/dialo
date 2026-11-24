import { z } from 'zod';
import { createChannelSchema } from './channelsValidation.js';
export const planInput = z.strictObject({ instrucciones: z.string().trim().min(10).max(1600) });
export const planOutput = z.strictObject({ aclaracion: z.string().max(500), canales: z.array(createChannelSchema.required().extend({ id: z.number().int().positive().nullable() })).max(100) });
export const planParams = z.object({ id: z.coerce.number().int().positive().max(2147483647), propuesta: z.uuid() });
export const emptyBody = z.strictObject({});
