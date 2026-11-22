import { PERMISSIONS } from '../utils/permissionCatalog.js';
import { z } from 'zod';

const id = z.number().int().positive().max(2_147_483_647);
export const channelIdParamsSchema = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) });
const nombre = z.string().min(1).max(32).refine((value) => value === value.trim(), 'El nombre no puede empezar ni terminar con espacios');
export const permisosCanal = z.array(z.enum([...PERMISSIONS,'VER','TRANSMITIR']))
  .max(PERMISSIONS.length+2).refine((values) => new Set(values).size === values.length, 'No repitas permisos');

const fields = { nombre, tipo: z.enum(['TEXTO', 'VOZ']), privado: z.boolean() };
export const createChannelSchema = z.strictObject({ ...fields, privado: fields.privado.optional(), permisosGlobales: permisosCanal.optional() });
export const updateChannelSchema = z.strictObject({ nombre }).partial().refine((data) => Object.keys(data).length > 0, 'Enviá al menos un campo para modificar');
export const orderChannelsSchema = z.strictObject({ orden: z.array(id) });

const individual = z.strictObject({idUsuario:id,permisos:permisosCanal});
const roleGrant = z.strictObject({idRol:id,permisos:permisosCanal});
export const channelAccessSchema = z.strictObject({
 privado:z.boolean(),permisosGlobales:permisosCanal.optional(),
 habilitaciones:z.array(individual).max(50).refine(v=>new Set(v.map(g=>g.idUsuario)).size===v.length,'No repitas integrantes').optional(),
 roles:z.array(roleGrant).max(50).refine(v=>new Set(v.map(g=>g.idRol)).size===v.length,'No repitas roles').optional(),
}).refine(d=>d.privado?(d.habilitaciones!==undefined||d.roles!==undefined):d.permisosGlobales!==undefined,'Enviá la configuración completa').refine(d=>!d.roles?.length,'Los roles se configuran únicamente en la comunidad');
export const emptyChannelRequestSchema = z.strictObject({});
export const resolveChannelRequestSchema = z.strictObject({ aceptar: z.boolean(), permisos: permisosCanal.optional() }).refine(d => !d.aceptar || Boolean(d.permisos?.length), 'Elegí al menos un permiso para aceptar');
export const requestIdParamsSchema = z.object({ id: z.coerce.number().int().positive().max(2_147_483_647), solicitud: z.coerce.number().int().positive().max(2_147_483_647) });
export const channelSubscriptionSchema = z.strictObject({ idCanal: id });
