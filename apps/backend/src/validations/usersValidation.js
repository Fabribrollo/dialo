import { z } from 'zod';
import { nombreVisible } from './authValidation.js';

export const updateMeSchema = z
  .object({
    nombreVisible,
    informacionPersonal: z.string().trim().max(500).nullable(),
    disponibilidad: z.enum(['EN_LINEA', 'AUSENTE', 'NO_MOLESTAR', 'INVISIBLE']),
  })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'Enviá al menos un campo para modificar');

export const userIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
