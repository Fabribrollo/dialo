import { z } from 'zod';
import { searchMessages } from '../services/messageSearchService.js';

export const messageSearchQuery = z.strictObject({
  q: z.string().trim().min(2).max(120),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const searchController = (kind) => async (req, res) =>
  res.json(await searchMessages(kind, req.validated.params.id, req.user.id, req.validated.query));
