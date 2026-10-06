import { z } from 'zod';

const id = z.number().int().positive().max(2_147_483_647);
const contenido = z.string().trim().min(1).max(2000);

export const sendMessageSchema = z.object({ idConversacion: id, contenido });
export const editMessageSchema = z.object({ idMensaje: id, contenido });
export const deleteMessageSchema = z.object({ idMensaje: id });
