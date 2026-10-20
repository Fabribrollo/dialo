import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { channelIdParamsSchema, updateChannelSchema } from '../validations/channelsValidation.js';
import { getChannel, updateChannel, deleteChannel } from '../controllers/channelsController.js';

const router = Router();
router.use(authenticate);
router.get('/:id', validate({ params: channelIdParamsSchema }), getChannel);
router.patch('/:id', validate({ params: channelIdParamsSchema, body: updateChannelSchema }), updateChannel);
router.delete('/:id', validate({ params: channelIdParamsSchema }), deleteChannel);
export default router;
