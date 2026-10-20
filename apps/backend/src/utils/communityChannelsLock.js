import { prisma } from '../prisma/client.js';
import { Prisma } from '@prisma/client';
import { AppError } from './AppError.js';

// Prisma califica sus consultas, pero $queryRaw no adopta automáticamente el
// schema de DATABASE_URL. Escapar el identificador conserva el aislamiento.
const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
const communityTable = Prisma.raw(`"${schema.replaceAll('"', '""')}"."comunidad"`);

// Una fila de comunidad coordina todas las escrituras de sus canales, también
// entre procesos. También coordina acceso, suscripciones, abandono y borrado.
export function withCommunityChannelsLock(idComunidad, operation, missing = () => new AppError(404, 'COMMUNITY_NOT_FOUND', 'La comunidad no existe')) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id_comunidad FROM ${communityTable} WHERE id_comunidad = ${idComunidad} FOR UPDATE`;
    if (!rows.length) throw missing();
    return operation(tx);
  }, { maxWait: 10000, timeout: 30000 });
}
