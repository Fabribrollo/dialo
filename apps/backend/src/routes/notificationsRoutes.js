import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { listNotifications, readNotifications } from '../services/notificationsService.js';
const router = Router();
router.use(authenticate);
router.get('/', validate({ query: z.strictObject({ cursor: z.coerce.number().int().positive().optional() }) }), async (req, res) => res.json(await listNotifications(req.user.id, req.validated.query.cursor)));
const readBody = z.union([
  z.strictObject({ id: z.number().int().positive() }),
  z.strictObject({ tipo: z.enum(['canal', 'conversacion', 'amistad']), referencia: z.number().int().positive() }),
  z.strictObject({}),
]);
router.post('/read', validate({ body: readBody }), async (req, res) => { await readNotifications(req.user.id, req.validated.body); res.status(204).end(); });
export default router;
