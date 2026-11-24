import { z } from 'zod';

const regla = z.string().trim().min(1).max(100);

export const updateModerationSchema = z.strictObject({
  activa: z.boolean(),
  reglas: z.array(regla).max(10)
    .refine((values) => new Set(values).size === values.length, 'No repitas reglas'),
});
// F-14: medidas manuales y propuestas preparadas por IA.
export const ALCANCES = ['TEXTO', 'VOZ', 'AMBOS'];
export const DURACIONES_SILENCIO = ['15_MIN', '1_HORA', '24_HORAS', '7_DIAS', 'PERMANENTE'];
const motivo = z.string().trim().min(1).max(300).optional();
export const silenceMemberSchema = z.strictObject({ alcance: z.enum(ALCANCES), duracion: z.enum(DURACIONES_SILENCIO), motivo });
export const kickMemberSchema = z.strictObject({ motivo });
export const proposalRequestSchema = z.strictObject({
  pedido: z.string().trim().min(5).max(600),
  idDestinatario: z.number().int().positive().max(2147483647).optional(),
});
export const proposalParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(2147483647),
  idPropuesta: z.coerce.number().int().positive().max(2147483647),
});
