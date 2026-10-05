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
