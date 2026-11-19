-- Conserva los textos existentes. Las nuevas ediciones aplican los límites de la UI.
ALTER TABLE "usuario" ADD COLUMN "color_avatar" VARCHAR(7) NOT NULL DEFAULT '#756222';
CREATE TABLE "bloqueo_mensaje" (
  "id" SERIAL PRIMARY KEY,
  "id_comunidad" INTEGER NOT NULL REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE,
  "id_canal" INTEGER NOT NULL REFERENCES "canal"("id_canal") ON DELETE CASCADE,
  "id_autor" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE,
  "contenido" VARCHAR(2000) NOT NULL,
  "motivo" VARCHAR(100) NOT NULL,
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bloqueo_mensaje_comunidad_fecha" ON "bloqueo_mensaje"("id_comunidad", "id");
