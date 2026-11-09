import { z } from 'zod';

const MAX_ID = 2_147_483_647;

const nombre = z
  .string()
  .min(2)
  .max(64)
  .refine((valor) => valor === valor.trim(), 'El nombre no puede empezar ni terminar con espacios');
const tipo = z.enum(['PUBLICA', 'PRIVADA']);

export const communityIdParamsSchema = z.object({ id: z.coerce.number().int().positive().max(MAX_ID) });

export const createCommunitySchema = z.strictObject({ nombre, tipo: tipo.optional() });

export const updateCommunitySchema = z
  .strictObject({ nombre, tipo })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'Enviá al menos un campo para modificar');


const memberRoleId = z.number().int().positive().max(MAX_ID);
export const communityMemberParamsSchema = communityIdParamsSchema.extend({
  idUsuario: z.coerce.number().int().positive().max(MAX_ID),
});
export const updateMemberRolesSchema = z.strictObject({
  rol: z.enum(['ADMIN', 'MODERADOR', 'INTEGRANTE']).optional(),
  idsRoles: z.array(memberRoleId).max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'No repitas roles').optional(),
}).refine((body) => body.rol !== undefined || body.idsRoles !== undefined, 'Indicá el rol base o los roles personalizados');
