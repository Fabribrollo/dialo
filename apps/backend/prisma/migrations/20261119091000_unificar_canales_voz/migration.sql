-- VIDEO pasa a VOZ conservando canal, mensajes, grants y participantes.
-- Los permisos TRANSMITIR siguen habilitando cámara y pantalla.
UPDATE "canal" SET "tipo" = 'VOZ' WHERE "tipo" = 'VIDEO';
ALTER TABLE "canal" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TYPE "tipo_canal" RENAME TO "tipo_canal_anterior";
CREATE TYPE "tipo_canal" AS ENUM ('TEXTO', 'VOZ');
ALTER TABLE "canal" ALTER COLUMN "tipo" TYPE "tipo_canal" USING ("tipo"::text::"tipo_canal");
ALTER TABLE "canal" ALTER COLUMN "tipo" SET DEFAULT 'TEXTO';
DROP TYPE "tipo_canal_anterior";
