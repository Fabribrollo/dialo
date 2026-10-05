import * as usersService from '../services/usersService.js';

export async function getMe(req, res) {
  const usuario = await usersService.getMe(req.user.id);
  res.json({ usuario });
}

export async function updateMe(req, res) {
  const usuario = await usersService.updateMe(req.user.id, req.validated.body);
  res.json({ usuario });
}

export async function getUserById(req, res) {
  const usuario = await usersService.getUserById(req.validated.params.id);
  res.json({ usuario });
}

export async function updateAvatar(req, res) {
  const usuario = await usersService.updateAvatar(req.user.id, req.file.buffer);
  res.json({ usuario });
}
