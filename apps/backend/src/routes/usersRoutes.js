import { Router } from 'express';
import { getMe, getUserById, updateAvatar, updateMe } from '../controllers/usersController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseImage } from '../middlewares/parseImage.js';
import { validate } from '../middlewares/validate.js';
import { updateMeSchema, userIdParamsSchema } from '../validations/usersValidation.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', validate({ body: updateMeSchema }), updateMe);
router.post('/me/foto', parseImage('foto'), updateAvatar);
router.get('/:id', validate({ params: userIdParamsSchema }), getUserById);

export default router;
