import { Router } from 'express';
import { acceptInvitation, previewInvitation } from '../controllers/invitationsController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { invitationCodeParamsSchema } from '../validations/invitationsValidation.js';

const router = Router();

router.use(authenticate);

router.get('/:codigo', validate({ params: invitationCodeParamsSchema }), previewInvitation);
router.post('/:codigo/accept', validate({ params: invitationCodeParamsSchema }), acceptInvitation);

export default router;
