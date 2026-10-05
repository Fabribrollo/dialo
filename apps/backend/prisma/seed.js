import { prisma } from '../src/prisma/client.js';

async function main() {}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
