import { z } from 'zod';

const regla = z.string().trim().min(1).max(100);

export const updateModerationSchema = z.strictObject({
  activa: z.boolean(),
  reglas: z.array(regla).max(10)
    .refine((values) => new Set(values).size === values.length, 'No repitas reglas'),
});