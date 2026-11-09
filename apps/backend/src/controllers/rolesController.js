import * as service from '../services/rolesService.js';

export async function listRoles(req, res) {
  res.json({ items: await service.listRoles(req.validated.params.id, req.user.id) });
}
export async function getRole(req, res) {
  const { id, idRol } = req.validated.params;
  res.json({ rol: await service.getRole(id, idRol, req.user.id) });
}
export async function createRole(req, res) {
  res.status(201).json({ rol: await service.createRole(req.validated.params.id, req.user.id, req.validated.body) });
}
export async function updateRole(req, res) {
  const { id, idRol } = req.validated.params;
  res.json({ rol: await service.updateRole(id, idRol, req.user.id, req.validated.body) });
}
export async function deleteRole(req, res) {
  const { id, idRol } = req.validated.params;
  await service.deleteRole(id, idRol, req.user.id);
  res.status(204).end();
}
