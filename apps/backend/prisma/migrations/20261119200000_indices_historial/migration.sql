-- El historial ordena por fecha y desempata por id, los dos de más nuevo a más viejo.
CREATE INDEX "mensaje_conversacion_historial" ON "mensaje"("id_conversacion", "fecha_creacion" DESC, "id_mensaje" DESC);
CREATE INDEX "mensaje_canal_historial" ON "mensaje"("id_canal", "fecha_creacion" DESC, "id_mensaje" DESC);
DROP INDEX IF EXISTS "mensaje_id_conversacion_fecha_creacion_idx";
DROP INDEX IF EXISTS "mensaje_id_canal_fecha_creacion_idx";
