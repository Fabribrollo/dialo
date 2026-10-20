import { z } from 'zod';

const id = z.number().int().positive().max(2_147_483_647);
export const channelIdParamsSchema = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
const nombre = z.string().min(1).max(32).refine((value) => value === value.trim(), 'El nombre no puede empezar ni terminar con espacios');
const fields = { nombre, tipo: z.enum(['TEXTO', 'VOZ', 'VIDEO']), privado: z.boolean() };
export const createChannelSchema = z.strictObject({ ...fields, privado: fields.privado.optional() });
export const updateChannelSchema = z.strictObject(fields).partial().refine((data) => Object.keys(data).length > 0, 'Enviá al menos un campo para modificar');
export const orderChannelsSchema = z.strictObject({ orden: z.array(id) });
