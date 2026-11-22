import { z } from 'zod';
import * as users from '../services/usersService.js';
import { Router } from 'express';
import { getMe, getUserById, updateAvatar, updateMe } from '../controllers/usersController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseImage } from '../middlewares/parseImage.js';
import { validate } from '../middlewares/validate.js';
import { limitImageUploads } from '../utils/rateLimit.js';
import { updateMeSchema, userIdParamsSchema } from '../validations/usersValidation.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me/preferences', validate({ body: z.strictObject({
  silenciarNotificaciones: z.boolean().optional(),tema:z.enum(["claro","oscuro"]).optional(),
  audioInput: z.string().max(256).optional(), audioOutput: z.string().max(256).optional(), videoInput: z.string().max(256).optional(),
}) }), async (req, res) => res.json({ usuario: await users.updateMe(req.user.id, { preferencias: req.validated.body }) }));
router.patch('/me', validate({ body: updateMeSchema }), updateMe);
router.delete('/me/foto', async (req, res) => res.json({ usuario: await users.updateMe(req.user.id, { fotoUrl: null }) }));
router.post('/me/foto', limitImageUploads, parseImage('foto'), updateAvatar);
router.post('/me/portada',limitImageUploads,parseImage('portada'),async(req,res)=>res.json({usuario:await users.updateCover(req.user.id,req.file.buffer,req.file.mimetype)}));
router.delete('/me/portada',async(req,res)=>res.json({usuario:await users.updateMe(req.user.id,{portadaUrl:null})}));
router.get('/:id', validate({ params: userIdParamsSchema }), getUserById);

export default router;
