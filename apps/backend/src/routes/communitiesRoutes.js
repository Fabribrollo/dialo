import { Router } from 'express';
import {
  createCommunity,
  deleteCommunity,
  getCommunity,
  leaveCommunity,
  listCommunities,
  listMembers,
  updateCommunity,
  updateCommunityImage,
  updateMemberRoles,
} from '../controllers/communitiesController.js';
import { createInvitation, listInvitations, revokeInvitation } from '../controllers/invitationsController.js';
import { listBans, banMember, removeBan } from '../controllers/communityBansController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseImage } from '../middlewares/parseImage.js';
import { validate } from '../middlewares/validate.js';
import {
  communityIdParamsSchema,
  communityMemberParamsSchema,
  banMemberSchema,
  updateMemberRolesSchema,
  createCommunitySchema,
  updateCommunitySchema,
} from '../validations/communitiesValidation.js';
import { createInvitationSchema, invitationIdParamsSchema } from '../validations/invitationsValidation.js';
import { listChannels, createChannel, reorderChannels } from '../controllers/channelsController.js';
import { createChannelSchema, orderChannelsSchema } from '../validations/channelsValidation.js';
import rolesRoutes from './rolesRoutes.js';

const router = Router();

router.use(authenticate);
router.use('/:id/roles', rolesRoutes);

router.get('/', listCommunities);
router.post('/', validate({ body: createCommunitySchema }), createCommunity);
router.get('/:id', validate({ params: communityIdParamsSchema }), getCommunity);
router.patch('/:id', validate({ params: communityIdParamsSchema, body: updateCommunitySchema }), updateCommunity);
router.post('/:id/imagen', validate({ params: communityIdParamsSchema }), parseImage('imagen'), updateCommunityImage);
router.delete('/:id', validate({ params: communityIdParamsSchema }), deleteCommunity);
router.get('/:id/members', validate({ params: communityIdParamsSchema }), listMembers);
router.patch('/:id/members/:idUsuario', validate({ params: communityMemberParamsSchema, body: updateMemberRolesSchema }), updateMemberRoles);
router.get('/:id/bans', validate({ params: communityIdParamsSchema }), listBans);
router.put('/:id/bans/:idUsuario', validate({ params: communityMemberParamsSchema, body: banMemberSchema }), banMember);
router.delete('/:id/bans/:idUsuario', validate({ params: communityMemberParamsSchema }), removeBan);
router.post('/:id/leave', validate({ params: communityIdParamsSchema }), leaveCommunity);
router.post('/:id/invitations', validate({ params: communityIdParamsSchema, body: createInvitationSchema }), createInvitation);
router.get('/:id/invitations', validate({ params: communityIdParamsSchema }), listInvitations);
router.delete('/:id/invitations/:idInvitacion', validate({ params: invitationIdParamsSchema }), revokeInvitation);
router.get('/:id/channels', validate({ params: communityIdParamsSchema }), listChannels);
router.post('/:id/channels', validate({ params: communityIdParamsSchema, body: createChannelSchema }), createChannel);
router.put('/:id/channels/order', validate({ params: communityIdParamsSchema, body: orderChannelsSchema }), reorderChannels);

export default router;
