import * as service from '../services/channelRequestsService.js';
export async function requestAccess(req,res) {res.status(200).json({solicitud:await service.requestChannelAccess(req.validated.params.id,req.user.id)});}
export async function listRequests(req,res) {res.json({items:await service.listChannelRequests(req.validated.params.id,req.user.id)});}
export async function resolveRequest(req,res) {res.json(await service.resolveChannelRequest(req.validated.params.id,req.validated.params.solicitud,req.user.id,req.validated.body));}
