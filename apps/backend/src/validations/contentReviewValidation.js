import { z } from 'zod';
export const caseParams=z.object({id:z.coerce.number().int().positive().max(2147483647),caso:z.coerce.number().int().positive().max(2147483647)});
export const caseQuery=z.strictObject({estado:z.enum(['PENDIENTE','RESUELTOS']).optional(),cursor:z.coerce.number().int().positive().optional()});
export const reviewSettingBody=z.strictObject({activa:z.boolean()});
const motivo=z.string().trim().min(3).max(300);
export const resolveCaseBody=z.discriminatedUnion('decision',[
 z.strictObject({decision:z.literal('DESCARTADO'),motivo}),
 z.strictObject({decision:z.literal('SIN_SANCION'),motivo}),
 z.strictObject({decision:z.literal('CON_MEDIDA'),motivo,medida:z.discriminatedUnion('tipo',[
  z.strictObject({tipo:z.literal('EXPULSAR')}),
  z.strictObject({tipo:z.literal('SILENCIAR'),alcance:z.enum(['TEXTO','VOZ','AMBOS']),duracion:z.enum(['15_MIN','1_HORA','24_HORAS','7_DIAS','PERMANENTE'])}),
  z.strictObject({tipo:z.literal('BANEAR'),duracion:z.enum(['30_MIN','5_HORAS','PERMANENTE'])}),
 ])}),
]);
