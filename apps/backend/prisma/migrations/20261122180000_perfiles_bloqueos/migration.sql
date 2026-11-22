ALTER TABLE "usuario" ADD COLUMN "portada_url" TEXT;
-- Aplicar el nuevo contrato a bloqueos creados antes de esta actualización.
DELETE FROM "amistad" a USING "bloqueo_usuario" b
WHERE a."id_usuario_a"=LEAST(b."id_actor",b."id_objetivo") AND a."id_usuario_b"=GREATEST(b."id_actor",b."id_objetivo");
UPDATE "solicitud_amistad" s SET "estado"='RECHAZADA',"fecha_respuesta"=CURRENT_TIMESTAMP
FROM "bloqueo_usuario" b WHERE s."estado"='PENDIENTE'
AND LEAST(s."id_emisor",s."id_receptor")=LEAST(b."id_actor",b."id_objetivo")
AND GREATEST(s."id_emisor",s."id_receptor")=GREATEST(b."id_actor",b."id_objetivo");
