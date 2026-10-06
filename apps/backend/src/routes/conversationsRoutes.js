import { Router } from 'express';
import {
  getConversation,
  getOrCreateConversation,
  listConversations,
  listMessages,
} from '../controllers/conversationsController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import {
  conversationIdParamsSchema,
  createConversationSchema,
  messagesQuerySchema,
} from '../validations/conversationsValidation.js';

const router = Router();

router.use(authenticate);

router.get('/', listConversations);
router.post('/', validate({ body: createConversationSchema }), getOrCreateConversation);
router.get('/:id', validate({ params: conversationIdParamsSchema }), getConversation);
router.get(
  '/:id/messages',
  validate({ params: conversationIdParamsSchema, query: messagesQuerySchema }),
  listMessages,
);

export default router;
