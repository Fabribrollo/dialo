import { Router } from 'express';
import { getMe, getUserById, updateAvatar, updateMe } from '../controllers/usersController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseAvatar } from '../middlewares/parseAvatar.js';
import { validate } from '../middlewares/validate.js';
import { updateMeSchema, userIdParamsSchema } from '../validations/usersValidation.js';

const router = Router();

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', validate({ body: updateMeSchema }), updateMe);
router.post('/me/foto', parseAvatar, updateAvatar);
router.get('/:id', validate({ params: userIdParamsSchema }), getUserById);

export default router;
