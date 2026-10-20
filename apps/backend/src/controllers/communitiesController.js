import * as communitiesService from '../services/communitiesService.js';

export async function listCommunities(req, res) {
  const items = await communitiesService.listCommunities(req.user.id);
  res.json({ items });
}

export async function createCommunity(req, res) {
  const comunidad = await communitiesService.createCommunity(req.user.id, req.validated.body);
  res.status(201).json({ comunidad });
}

export async function getCommunity(req, res) {
  const comunidad = await communitiesService.getCommunity(req.validated.params.id, req.user.id);
  res.json({ comunidad });
}

export async function updateCommunity(req, res) {
  const comunidad = await communitiesService.updateCommunity(
    req.validated.params.id,
    req.user.id,
    req.validated.body,
  );
  res.json({ comunidad });
}

export async function updateCommunityImage(req, res) {
  const comunidad = await communitiesService.updateCommunityImage(
    req.validated.params.id,
    req.user.id,
    req.file.buffer,
  );
  res.json({ comunidad });
}

export async function deleteCommunity(req, res) {
  await communitiesService.deleteCommunity(req.validated.params.id, req.user.id);
  res.status(204).end();
}

export async function listMembers(req, res) {
  const items = await communitiesService.listMembers(req.validated.params.id, req.user.id);
  res.json({ items });
}

export async function leaveCommunity(req, res) {
  await communitiesService.abandonCommunity(req.validated.params.id, req.user.id);
  res.status(204).end();
}
