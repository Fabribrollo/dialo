import { z } from 'zod';

const id = z.number().int().positive().max(2_147_483_647);
const contenido = z.string().trim().min(1).max(2000);
export const sendChannelMessageSchema = z.strictObject({ idCanal: id, contenido });
export const editChannelMessageSchema = z.strictObject({ idMensaje: id, contenido });
export const deleteChannelMessageSchema = z.strictObject({ idMensaje: id });
