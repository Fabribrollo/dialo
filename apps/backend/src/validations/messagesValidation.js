import { z } from 'zod';

const id = z.number().int().positive().max(2_147_483_647);
const contenido = z.string().trim().min(1).max(2000);

export const sendMessageSchema = z.object({ idConversacion: id, contenido, idRespuesta:id.optional(),encuesta:z.strictObject({opciones:z.array(z.string().trim().min(1).max(100)).min(2).max(10).refine(a=>new Set(a).size===a.length),multiple:z.boolean().default(false)}).optional(), idEnvio:z.string().uuid().optional() });
export const editMessageSchema = z.object({ idMensaje: id, contenido });
export const deleteMessageSchema = z.object({ idMensaje: id });
