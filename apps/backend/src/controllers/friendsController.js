import * as friendsService from "../services/friendsService.js";

// GET /api/users/search?q=texto&limit=20
// q y limit ya vienen validados por searchQuerySchema.
export async function searchUsers(req, res) {
  const { q, limit } = req.validated.query;
  const items = await friendsService.searchUsers(req.user.id, q, limit);
  res.json({ items });
}

// POST /api/friends/requests  body: { idReceptor }
// El emisor es el usuario de la sesion (req.user).
export async function sendRequest(req, res) {
  const solicitud = await friendsService.sendRequest(
    req.user.id,
    req.validated.body.idReceptor,
  );
  res.status(201).json({ solicitud });
}

// GET /api/friends/requests?tipo=recibidas|enviadas
export async function listRequests(req, res) {
  const items = await friendsService.listRequests(
    req.user.id,
    req.validated.query.tipo,
  );
  res.json({ items });
}

// POST /api/friends/requests/:id/accept
export async function acceptRequest(req, res) {
  const amigo = await friendsService.acceptRequest(
    req.validated.params.id,
    req.user.id,
  );
  res.json({ amigo });
}

// POST /api/friends/requests/:id/reject
export async function rejectRequest(req, res) {
  await friendsService.rejectRequest(req.validated.params.id, req.user.id);
  res.status(204).end();
}

// GET /api/friends
export async function listFriends(req, res) {
  const items = await friendsService.listFriends(req.user.id);
  res.json({ items });
}

// DELETE /api/friends/:idUsuario
export async function removeFriend(req, res) {
  await friendsService.removeFriend(
    req.user.id,
    req.validated.params.idUsuario,
  );
  res.status(204).end();
}
