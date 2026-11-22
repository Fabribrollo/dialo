import { PERMISSIONS } from '../utils/permissionCatalog.js';
import { z } from 'zod';

const id = z.coerce.number().int().positive().max(2_147_483_647);
const reserved = new Set(['propietario', 'admin', 'moderador', 'integrante']);
export const communityRoleParamsSchema = z.object({ id, idRol: id });
export const roleBodySchema = z.strictObject({
  permisos: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).refine(v=>new Set(v).size===v.length,'No repitas permisos').optional(),
  nombre: z.string().min(1).max(32)
    .refine((value) => value === value.trim(), 'El nombre no puede empezar ni terminar con espacios')
    .refine((value) => !reserved.has(value.toLowerCase()), 'El nombre está reservado para un rol base'),
});
