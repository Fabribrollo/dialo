import { listChannelMessages } from '../services/channelMessagesService.js';

export async function listMessages(req, res) {
  res.json(await listChannelMessages(req.validated.params.id, req.user.id, req.validated.query));
}
