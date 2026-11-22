-- Conservar permisos efectivos previos de todas las configuraciones públicas existentes.
UPDATE "canal_rol" AS r SET "permisos" = ARRAY(
  SELECT DISTINCT p FROM unnest(r."permisos" || CASE WHEN c."tipo" = 'TEXTO'
    THEN ARRAY['VER','ESCRIBIR']::"permiso_canal"[]
    ELSE ARRAY['VER','HABLAR']::"permiso_canal"[] END) AS p
) FROM "canal" AS c WHERE c."id_canal" = r."id_canal" AND NOT c."privado";

ALTER TABLE "canal_rol" DROP CONSTRAINT "canal_rol_con_permisos";
ALTER TABLE "canal_rol" ADD CONSTRAINT "canal_rol_con_permisos" CHECK ("permisos" IS NOT NULL);
