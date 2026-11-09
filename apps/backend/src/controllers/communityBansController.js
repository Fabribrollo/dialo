import * as service from '../services/communityBansService.js';

export async function listBans(req, res) {
  res.json({ items: await service.listBans(req.validated.params.id, req.user.id) });
}

export async function banMember(req, res) {
  const { id, idUsuario } = req.validated.params;
  await service.banMember(id, req.user.id, idUsuario, req.validated.body);
  res.status(204).end();
}

export async function removeBan(req, res) {
  const { id, idUsuario } = req.validated.params;
  await service.removeBan(id, req.user.id, idUsuario);
  res.status(204).end();
}
