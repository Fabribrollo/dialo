import * as conversationsService from '../services/conversationsService.js';

export async function listConversations(req, res) {
  const items = await conversationsService.listConversations(req.user.id);
  res.json({ items });
}

export async function getOrCreateConversation(req, res) {
  const { conversacion, created } = await conversationsService.getOrCreateConversation(
    req.user.id,
    req.validated.body.idUsuario,
  );
  res.status(created ? 201 : 200).json({ conversacion });
}

export async function getConversation(req, res) {
  const conversacion = await conversationsService.getConversation(req.validated.params.id, req.user.id);
  res.json({ conversacion });
}

export async function listMessages(req, res) {
  const historial = await conversationsService.listMessages(
    req.validated.params.id,
    req.user.id,
    req.validated.query,
  );
  res.json(historial);
}
