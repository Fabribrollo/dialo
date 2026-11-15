import * as service from '../services/communityModerationService.js';

export async function getModeration(req, res) {
  res.json({ moderacion: await service.getModeration(req.validated.params.id, req.user.id) });
}

export async function replaceModeration(req, res) {
  res.json({ moderacion: await service.replaceModeration(req.validated.params.id, req.user.id, req.validated.body) });
}