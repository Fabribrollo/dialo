import { z } from 'zod';
import { nombreVisible } from './authValidation.js';

export const updateMeSchema = z
  .object({
    nombreVisible: nombreVisible.min(2).max(40),
    colorAvatar: z.enum(['#756222', '#6A3CF5', '#156B64', '#A63D40', '#305C91', '#765174']),
    informacionPersonal: z.string().trim().max(190).nullable(),
    disponibilidad: z.enum(['EN_LINEA', 'AUSENTE', 'NO_MOLESTAR', 'INVISIBLE']),
  })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'Enviá al menos un campo para modificar');

export const userIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
