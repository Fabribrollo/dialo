ALTER TABLE "usuario" ADD COLUMN "preferencias" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "notificacion" (
  "id" SERIAL PRIMARY KEY,
  "id_usuario" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE,
  "tipo" VARCHAR(24) NOT NULL,
  "referencia" INTEGER NOT NULL,
  "origen" VARCHAR(80) NOT NULL,
  "leida" BOOLEAN NOT NULL DEFAULT false,
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notificacion_destino_origen" UNIQUE ("id_usuario", "origen")
);
CREATE INDEX "notificacion_usuario_id" ON "notificacion"("id_usuario", "id");
