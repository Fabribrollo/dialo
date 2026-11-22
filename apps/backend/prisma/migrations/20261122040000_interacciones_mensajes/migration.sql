ALTER TABLE "mensaje" ADD COLUMN "id_respuesta" INTEGER, ADD COLUMN "fecha_fijado" TIMESTAMP(3);
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_respuesta_fkey" FOREIGN KEY ("id_respuesta") REFERENCES "mensaje"("id_mensaje") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "reaccion_mensaje" (
 "id_mensaje" INTEGER NOT NULL,
 "id_usuario" INTEGER NOT NULL,
 "emoji" VARCHAR(16) NOT NULL,
 CONSTRAINT "reaccion_mensaje_pkey" PRIMARY KEY ("id_mensaje", "id_usuario"),
 CONSTRAINT "reaccion_mensaje_mensaje_fkey" FOREIGN KEY ("id_mensaje") REFERENCES "mensaje"("id_mensaje") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "reaccion_mensaje_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "mensaje_respuesta_idx" ON "mensaje"("id_respuesta");
CREATE INDEX "mensaje_fijados_canal_idx" ON "mensaje"("id_canal", "fecha_fijado") WHERE "fecha_fijado" IS NOT NULL AND "fecha_eliminacion" IS NULL;
CREATE INDEX "mensaje_fijados_conversacion_idx" ON "mensaje"("id_conversacion", "fecha_fijado") WHERE "fecha_fijado" IS NOT NULL AND "fecha_eliminacion" IS NULL;
