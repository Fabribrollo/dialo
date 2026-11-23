import {auditCommunity} from '../middlewares/auditCommunity.js';
import { suggestCommunity, confirmCommunity } from '../services/communityProposalService.js';
import { communityPurposeSchema, confirmCommunitySchema } from '../validations/communityProposalValidation.js';
import { kickMember } from '../services/memberActionsService.js';
import { communityActivity } from '../services/communityActivityService.js';
import { suggestChannel, suggestionInput } from '../services/channelSuggestionService.js';
import { z } from 'zod';
import { transferOwnership, listBlockedMessages } from '../services/communityExtrasService.js';
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
import { getModeration, replaceModeration } from '../controllers/communityModerationController.js';
import { createInvitation, listInvitations, revokeInvitation } from '../controllers/invitationsController.js';
import { listBans, banMember, removeBan } from '../controllers/communityBansController.js';
import { authenticate } from '../middlewares/authenticate.js';
import { parseImage } from '../middlewares/parseImage.js';
import { validate } from '../middlewares/validate.js';
import { limitImageUploads } from '../utils/rateLimit.js';
import {
  communityIdParamsSchema,
  communityMemberParamsSchema,
  banMemberSchema,
  updateMemberRolesSchema,
  createCommunitySchema,
  updateCommunitySchema,
} from '../validations/communitiesValidation.js';
import { updateModerationSchema } from '../validations/communityModerationValidation.js';
import { createInvitationSchema, invitationIdParamsSchema } from '../validations/invitationsValidation.js';
import { listChannels, createChannel, reorderChannels } from '../controllers/channelsController.js';
import { createChannelSchema, orderChannelsSchema } from '../validations/channelsValidation.js';
import rolesRoutes from './rolesRoutes.js';

const router = Router();

router.use(authenticate);router.use(auditCommunity('comunidad'));
router.post('/suggestion', validate({ body: communityPurposeSchema }), async (req, res) => {
  res.json({ propuesta: await suggestCommunity(req.user.id, req.validated.body) });
});
router.post('/from-draft', validate({ body: confirmCommunitySchema }), async (req, res) => {
  const result = await confirmCommunity(req.user.id, req.validated.body);
  res.status(result.repetida ? 200 : 201).json(result);
});
router.post('/:id/ownership', validate({ params: communityIdParamsSchema, body: z.strictObject({ idUsuario: z.number().int().positive().max(2147483647) }) }), async (req, res) => {
  await transferOwnership(req.validated.params.id, req.user.id, req.validated.body.idUsuario);
  res.status(204).end();
});
router.get('/:id/moderation/blocked', validate({ params: communityIdParamsSchema, query: z.strictObject({ cursor: z.coerce.number().int().positive().optional() }) }), async (req, res) => {
  res.json(await listBlockedMessages(req.validated.params.id, req.user.id, req.validated.query.cursor));
});
router.use('/:id/roles', rolesRoutes);

router.get('/', listCommunities);
router.post('/', validate({ body: createCommunitySchema }), createCommunity);
router.get('/:id/activity', validate({ params: communityIdParamsSchema }), async (req, res) => res.json(await communityActivity(req.validated.params.id, req.user.id)));
router.get('/:id', validate({ params: communityIdParamsSchema }), getCommunity);
router.patch('/:id', validate({ params: communityIdParamsSchema, body: updateCommunitySchema }), updateCommunity);
router.post('/:id/imagen', validate({ params: communityIdParamsSchema }), limitImageUploads, parseImage('imagen'), updateCommunityImage);
router.delete('/:id', validate({ params: communityIdParamsSchema }), deleteCommunity);
router.get('/:id/members', validate({ params: communityIdParamsSchema }), listMembers);
router.patch('/:id/members/:idUsuario', validate({ params: communityMemberParamsSchema, body: updateMemberRolesSchema }), updateMemberRoles);
router.post('/:id/members/:idUsuario/kick',validate({params:communityMemberParamsSchema,body:z.strictObject({})}),async(req,res)=>{await kickMember(req.validated.params.id,req.user.id,req.validated.params.idUsuario);res.status(204).end();});
router.get('/:id/bans', validate({ params: communityIdParamsSchema }), listBans);
router.put('/:id/bans/:idUsuario', validate({ params: communityMemberParamsSchema, body: banMemberSchema }), banMember);
router.delete('/:id/bans/:idUsuario', validate({ params: communityMemberParamsSchema }), removeBan);
router.post('/:id/leave', validate({ params: communityIdParamsSchema }), leaveCommunity);
router.post('/:id/invitations', validate({ params: communityIdParamsSchema, body: createInvitationSchema }), createInvitation);
router.get('/:id/invitations', validate({ params: communityIdParamsSchema }), listInvitations);
router.delete('/:id/invitations/:idInvitacion', validate({ params: invitationIdParamsSchema }), revokeInvitation);
router.get('/:id/channels', validate({ params: communityIdParamsSchema }), listChannels);
router.post('/:id/channels/suggestion', validate({ params: communityIdParamsSchema, body: suggestionInput }), async (req, res) => {
  res.json({ propuesta: await suggestChannel(req.validated.params.id, req.user.id, req.validated.body) });
});
router.post('/:id/channels', validate({ params: communityIdParamsSchema, body: createChannelSchema }), createChannel);
router.put('/:id/channels/order', validate({ params: communityIdParamsSchema, body: orderChannelsSchema }), reorderChannels);
router.get('/:id/moderation', validate({ params: communityIdParamsSchema }), getModeration);
router.put('/:id/moderation', validate({ params: communityIdParamsSchema, body: updateModerationSchema }), replaceModeration);

export default router;
