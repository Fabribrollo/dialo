import { z } from "zod";

/*
Validaciones:
q => busqueda
limit => num
id => positivo-entero
*/
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(32),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const sendRequestSchema = z.object({
  idReceptor: z.number().int().positive(),
});
