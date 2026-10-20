import { Router } from 'express';
import {
  createCommunity,
  deleteCommunity,
  getCommunity,
  listCommunities,
  updateCommunity,
  updateCommunityImage,
} from '../controllers/communitiesController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseImage } from '../middlewares/parseImage.js';
import { validate } from '../middlewares/validate.js';
import {
  communityIdParamsSchema,
  createCommunitySchema,
  updateCommunitySchema,
} from '../validations/communitiesValidation.js';

const router = Router();

router.use(authenticate);

router.get('/', listCommunities);
router.post('/', validate({ body: createCommunitySchema }), createCommunity);
router.get('/:id', validate({ params: communityIdParamsSchema }), getCommunity);
router.patch('/:id', validate({ params: communityIdParamsSchema, body: updateCommunitySchema }), updateCommunity);
router.post('/:id/imagen', validate({ params: communityIdParamsSchema }), parseImage('imagen'), updateCommunityImage);
router.delete('/:id', validate({ params: communityIdParamsSchema }), deleteCommunity);

export default router;
