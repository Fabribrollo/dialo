import { SESSION_COOKIE } from '../config/cookies.js';
import { findSessionByToken } from '../services/authService.js';
import * as calls from '../services/callsService.js';

export async function joinCall(req, res) {
  const sesion = await findSessionByToken(req.cookies?.[SESSION_COOKIE]);
  res.json({ llamada: await calls.joinCall(req.validated.params.id, req.user, sesion?.id ?? null) });
}
export async function leaveCall(req, res) {
  await calls.leaveCall(req.validated.params.id, req.user.id);
  res.status(204).end();
}
export async function listCallParticipants(req, res) {
  res.json({ items: await calls.listCallParticipants(req.validated.params.id, req.user.id) });
}
