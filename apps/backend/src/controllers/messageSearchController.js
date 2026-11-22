import { z } from 'zod';
import { searchMessages } from '../services/messageSearchService.js';

export const messageSearchQuery = z.strictObject({
  q: z.string().trim().max(120).default(''),
  autor:z.string().trim().max(32).optional(),tipo:z.enum(['todos','texto','imagen','video','documento','audio','encuesta']).default('todos'),desde:z.string().date().optional(),hasta:z.string().date().optional(),
  desfase:z.coerce.number().int().min(-840).max(840).default(0),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine(v=>!v.desde||!v.hasta||v.desde<=v.hasta,'El rango de fechas no es válido');
export const searchController = (kind) => async (req, res) =>
  res.json(await searchMessages(kind, req.validated.params.id, req.user.id, req.validated.query));
