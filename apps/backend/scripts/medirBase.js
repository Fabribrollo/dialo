import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function medir(nombre, operacion, veces = 5) {
  const tiempos = [];
  for (let i = 0; i < veces; i++) {
    const inicio = performance.now();
    await operacion();
    tiempos.push(Math.round(performance.now() - inicio));
  }
  console.log(nombre.padEnd(22), tiempos.map((t) => `${t} ms`).join('  '));
}

await medir('Conexión inicial', () => prisma.$connect(), 1);
await medir('SELECT 1', () => prisma.$queryRawUnsafe('SELECT 1'));
await medir('Buscar una sesión', () => prisma.sesion.findFirst({ select: { id: true } }));
await medir('Transacción simple', () => prisma.$transaction(async (tx) => { await tx.$queryRawUnsafe('SELECT 1'); }));
await prisma.$disconnect();
