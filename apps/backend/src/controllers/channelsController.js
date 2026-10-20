import * as service from '../services/channelsService.js';
import * as accessService from '../services/channelAccessService.js';

export async function getChannelAccess(req, res) {
  res.json({ acceso: await accessService.getChannelAccess(req.validated.params.id, req.user.id) });
}
export async function replaceChannelAccess(req, res) {
  res.json({ acceso: await accessService.replaceChannelAccess(req.validated.params.id, req.user.id, req.validated.body) });
}

export async function listChannels(req, res) {
  res.json({ items: await service.listChannels(req.validated.params.id, req.user.id) });
}
export async function createChannel(req, res) {
  res.status(201).json({ canal: await service.createChannel(req.validated.params.id, req.user.id, req.validated.body) });
}
export async function getChannel(req, res) {
  res.json({ canal: await service.getChannel(req.validated.params.id, req.user.id) });
}
export async function updateChannel(req, res) {
  res.json({ canal: await service.updateChannel(req.validated.params.id, req.user.id, req.validated.body) });
}
export async function deleteChannel(req, res) {
  await service.deleteChannel(req.validated.params.id, req.user.id);
  res.status(204).end();
}
export async function reorderChannels(req, res) {
  await service.reorderChannels(req.validated.params.id, req.user.id, req.validated.body.orden);
  res.status(204).end();
}
