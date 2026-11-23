import { z } from 'zod';
import { createCommunitySchema } from './communitiesValidation.js';
import { createChannelSchema } from './channelsValidation.js';
import { roleBodySchema } from './rolesValidation.js';
import { CHANNEL_PERMISSIONS } from '../utils/channelPermissions.js';

export const communityPurposeSchema = z.strictObject({ proposito: z.string().trim().min(10).max(1200) });
const channel = createChannelSchema.required().superRefine((value, ctx) => {
  const allowed = CHANNEL_PERMISSIONS[value.tipo];
  if (value.permisosGlobales.some(p => !allowed.includes(p)) || (value.privado && value.permisosGlobales.length)) {
    ctx.addIssue({ code: 'custom', path: ['permisosGlobales'], message: 'Los permisos deben corresponder al tipo y privacidad del canal' });
  }
});
// El orden del arreglo es el orden inicial; no se aceptan IDs, asignaciones ni roles base.
export const communityDraftSchema = z.strictObject({
  ...createCommunitySchema.shape,
  tipo: z.enum(['PUBLICA', 'PRIVADA']),
  canales: z.array(channel).min(1).max(20),
  roles: z.array(roleBodySchema.required()).max(10),
}).superRefine((value, ctx) => {
  for (const key of ['canales', 'roles']) {
    const names = value[key].map(item => item.nombre.normalize('NFKC').toLocaleLowerCase('es'));
    if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', path: [key], message: 'No repitas nombres' });
  }
});
export const confirmCommunitySchema = z.strictObject({ clave: z.uuid(), borrador: communityDraftSchema });
