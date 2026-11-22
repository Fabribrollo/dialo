ALTER TABLE "mensaje" ADD COLUMN "registro_llamada" BOOLEAN NOT NULL DEFAULT false;
-- Recuperar solo registros que coinciden con una llamada terminada persistida.
UPDATE "mensaje" m SET "registro_llamada" = true
FROM "llamada_privada" l
WHERE m."id_conversacion" = l."id_conversacion"
  AND m."id_autor" = l."id_emisor"
  AND l."fecha_fin" IS NOT NULL
  AND ABS(EXTRACT(EPOCH FROM (m."fecha_creacion" - l."fecha_fin"))) < 10
  AND m."contenido" = 'Llamada ' || CASE WHEN l."video" THEN 'de video' ELSE 'de voz' END || ': ' || lower(l."estado"::text) || '.';
