import { readdir, readFile } from "node:fs/promises";

const MIGRATIONS = new URL("../prisma/migrations/", import.meta.url);

// desde/hasta permiten aplicar solo una parte, por ejemplo para probar una migracion sobre datos anteriores.
export async function applyMigrations(admin, schema, { desde, hasta } = {}) {
  const carpetas = (await readdir(MIGRATIONS, { withFileTypes: true }))
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort()
    .filter(
      (carpeta) => (!desde || carpeta > desde) && (!hasta || carpeta <= hasta),
    );
  const sql = await Promise.all(
    carpetas.map((carpeta) =>
      readFile(new URL(`${carpeta}/migration.sql`, MIGRATIONS), "utf8"),
    ),
  );
  await admin.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const statement of sql
        .join(";")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        await tx.$executeRawUnsafe(statement);
      }
    },
    { timeout: 30000 },
  );
}
