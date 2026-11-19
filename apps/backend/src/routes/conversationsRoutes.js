import { messageSearchQuery, searchController } from '../controllers/messageSearchController.js';
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
router.get('/:id/messages/search', validate({ params: conversationIdParamsSchema, query: messageSearchQuery }), searchController('conversation'));

router.get('/', listConversations);
router.post('/', validate({ body: createConversationSchema }), getOrCreateConversation);
router.get('/:id', validate({ params: conversationIdParamsSchema }), getConversation);
router.get(
  '/:id/messages',
  validate({ params: conversationIdParamsSchema, query: messagesQuerySchema }),
  listMessages,
);

export default router;
