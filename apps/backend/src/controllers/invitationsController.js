import * as invitationsService from '../services/invitationsService.js';

export async function acceptInvitation(req, res) {
  const { comunidad, created } = await invitationsService.acceptInvitation(req.validated.params.codigo, req.user.id);
  res.status(created ? 201 : 200).json({ comunidad });
}

export async function previewInvitation(req, res) {
  const comunidad = await invitationsService.previewInvitation(req.validated.params.codigo, req.user.id);
  res.json({ comunidad });
}

export async function createInvitation(req, res) {
  const invitacion = await invitationsService.createInvitation(req.validated.params.id, req.user.id, req.validated.body);
  res.status(201).json({ invitacion });
}

export async function listInvitations(req, res) {
  const items = await invitationsService.listInvitations(req.validated.params.id, req.user.id);
  res.json({ items });
}

export async function revokeInvitation(req, res) {
  const { id, idInvitacion } = req.validated.params;
  await invitationsService.revokeInvitation(id, req.user.id, idInvitacion);
  res.status(204).end();
}
