ALTER TABLE "comunidad" ADD COLUMN "revision_activa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "auditoria" ADD COLUMN "detalle" JSONB;
CREATE TABLE "propuesta_canales" (
 "id" UUID PRIMARY KEY, "id_comunidad" INTEGER NOT NULL REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE,
 "id_actor" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE,
 "huella" VARCHAR(64) NOT NULL, "antes" JSONB NOT NULL, "plan" JSONB NOT NULL,
 "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', "resultado" JSONB,
 "vence" TIMESTAMP(3) NOT NULL, "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "fecha_decision" TIMESTAMP(3)
);
CREATE INDEX "propuesta_canales_id_comunidad_id_actor_idx" ON "propuesta_canales"("id_comunidad","id_actor");
CREATE TABLE "caso_revision" (
 "id" SERIAL PRIMARY KEY, "id_comunidad" INTEGER NOT NULL REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE,
 "id_canal" INTEGER NOT NULL, "id_autor" INTEGER NOT NULL,
 "id_mensaje" INTEGER UNIQUE REFERENCES "mensaje"("id_mensaje") ON DELETE SET NULL ON UPDATE CASCADE,
 "motivos" TEXT[] NOT NULL, "estado" VARCHAR(24) NOT NULL DEFAULT 'PENDIENTE',
 "id_resolutor" INTEGER, "motivo_resolucion" VARCHAR(500), "medida" JSONB,
 "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "fecha_resolucion" TIMESTAMP(3)
);
CREATE INDEX "caso_revision_id_comunidad_estado_id_idx" ON "caso_revision"("id_comunidad","estado","id");
