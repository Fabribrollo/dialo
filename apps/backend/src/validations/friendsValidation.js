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

// GET /api/friends/requests?tipo=recibidas|enviadas
export const listRequestsQuerySchema = z.object({
  tipo: z.enum(["recibidas", "enviadas"]),
});

// :id de la solicitud en /requests/:id/accept y /requests/:id/reject
export const requestIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// :idUsuario del amigo en DELETE /api/friends/:idUsuario
export const friendIdParamsSchema = z.object({
  idUsuario: z.coerce.number().int().positive(),
});
