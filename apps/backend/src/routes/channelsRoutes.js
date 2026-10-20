import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { channelAccessSchema, channelIdParamsSchema, updateChannelSchema } from '../validations/channelsValidation.js';
import { getChannel, updateChannel, deleteChannel, getChannelAccess, replaceChannelAccess } from '../controllers/channelsController.js';

const router = Router();
router.use(authenticate);
router.get('/:id/access', validate({ params: channelIdParamsSchema }), getChannelAccess);
router.put('/:id/access', validate({ params: channelIdParamsSchema, body: channelAccessSchema }), replaceChannelAccess);
router.get('/:id', validate({ params: channelIdParamsSchema }), getChannel);
router.patch('/:id', validate({ params: channelIdParamsSchema, body: updateChannelSchema }), updateChannel);
router.delete('/:id', validate({ params: channelIdParamsSchema }), deleteChannel);
export default router;
