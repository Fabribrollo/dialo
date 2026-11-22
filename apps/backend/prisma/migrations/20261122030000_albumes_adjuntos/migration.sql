ALTER TABLE "mensaje" ADD COLUMN "id_grupo_adjuntos" UUID, ADD COLUMN "cantidad_grupo_adjuntos" INTEGER;
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_grupo_adjuntos_valido" CHECK (
 ("id_grupo_adjuntos" IS NULL AND "cantidad_grupo_adjuntos" IS NULL) OR
 ("id_grupo_adjuntos" IS NOT NULL AND "cantidad_grupo_adjuntos" IS NOT NULL AND "cantidad_grupo_adjuntos" BETWEEN 4 AND 6)
);
-- Un recibo identifica una tanda real, sin inferir grupos por fechas o autores.
UPDATE "mensaje" m SET "id_grupo_adjuntos" = e."clave", "cantidad_grupo_adjuntos" = cardinality(e."mensajes")
FROM "envio_confirmado" e
WHERE cardinality(e."mensajes") BETWEEN 4 AND 6 AND m."id_mensaje" = ANY(e."mensajes")
 AND m."id_autor" = e."id_autor" AND EXISTS (SELECT 1 FROM "adjunto" a WHERE a."id_mensaje" = m."id_mensaje");
