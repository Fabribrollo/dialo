CREATE TABLE "llamada_privada" (
  "id" UUID PRIMARY KEY,
  "id_conversacion" INTEGER NOT NULL REFERENCES "conversacion_privada"("id_conversacion") ON DELETE CASCADE,
  "id_emisor" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE,
  "id_receptor" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE,
  "sesion_emisor" INTEGER,
  "sesion_receptor" INTEGER,
  "video" BOOLEAN NOT NULL DEFAULT false,
  "estado" VARCHAR(16) NOT NULL DEFAULT 'LLAMANDO',
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_fin" TIMESTAMP(3),
  CONSTRAINT "llamada_estados" CHECK ("estado" IN ('LLAMANDO','ACEPTADA','FINALIZADA','RECHAZADA','CANCELADA','PERDIDA','OCUPADA'))
);
CREATE INDEX "llamada_emisor_estado" ON "llamada_privada"("id_emisor","estado");
CREATE INDEX "llamada_receptor_estado" ON "llamada_privada"("id_receptor","estado");
