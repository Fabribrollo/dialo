ALTER TABLE "canal" ADD COLUMN "permisos_globales" "permiso_canal"[] NOT NULL DEFAULT ARRAY['VER','ESCRIBIR']::"permiso_canal"[];
-- Política global conservadora: intersección de ambos roles base, sin ampliar accesos.
UPDATE "canal" AS c SET "permisos_globales" = ARRAY(
 SELECT p FROM unnest(CASE WHEN c.tipo='TEXTO' THEN ARRAY['VER','ESCRIBIR']::"permiso_canal"[] ELSE ARRAY['VER','HABLAR','TRANSMITIR']::"permiso_canal"[] END) AS p
 WHERE p = ANY(COALESCE((SELECT permisos FROM canal_rol WHERE id_canal=c.id_canal AND rol='MODERADOR'),CASE WHEN c.tipo='TEXTO' THEN ARRAY['VER','ESCRIBIR']::"permiso_canal"[] ELSE ARRAY['VER','HABLAR']::"permiso_canal"[] END))
 AND p = ANY(COALESCE((SELECT permisos FROM canal_rol WHERE id_canal=c.id_canal AND rol='INTEGRANTE'),CASE WHEN c.tipo='TEXTO' THEN ARRAY['VER','ESCRIBIR']::"permiso_canal"[] ELSE ARRAY['VER','HABLAR']::"permiso_canal"[] END))
) WHERE NOT c.privado;
UPDATE canal SET permisos_globales=ARRAY[]::"permiso_canal"[] WHERE privado;
-- Materializar las habilitaciones privadas actuales en cada integrante autorizado.
INSERT INTO canal_usuario (id_canal,id_comunidad,id_usuario,permisos)
SELECT c.id_canal,c.id_comunidad,m.id_usuario,array_agg(DISTINCT p)
FROM canal c JOIN membresia m ON m.id_comunidad=c.id_comunidad
CROSS JOIN LATERAL unnest(
 COALESCE((SELECT permisos FROM canal_rol r WHERE r.id_canal=c.id_canal AND r.rol=m.rol),ARRAY[]::"permiso_canal"[])
 || COALESCE((SELECT array_agg(x) FROM canal_rol_personalizado r JOIN membresia_rol mr ON mr.id_rol=r.id_rol AND mr.id_usuario=m.id_usuario CROSS JOIN LATERAL unnest(r.permisos) x WHERE r.id_canal=c.id_canal),ARRAY[]::"permiso_canal"[])
 || COALESCE((SELECT permisos FROM canal_usuario u WHERE u.id_canal=c.id_canal AND u.id_usuario=m.id_usuario),ARRAY[]::"permiso_canal"[])
) p
WHERE c.privado AND m.rol IN ('MODERADOR','INTEGRANTE') AND (p='VER' OR (c.tipo='TEXTO' AND p='ESCRIBIR') OR (c.tipo<>'TEXTO' AND p IN ('HABLAR','TRANSMITIR')))
GROUP BY c.id_canal,c.id_comunidad,m.id_usuario
ON CONFLICT(id_canal,id_usuario) DO UPDATE SET permisos=EXCLUDED.permisos;
DELETE FROM canal_usuario WHERE id_canal IN (SELECT id_canal FROM canal WHERE NOT privado);
DELETE FROM canal_rol;
DELETE FROM canal_rol_personalizado;
CREATE TABLE "solicitud_acceso_canal" (
 "id" SERIAL PRIMARY KEY,
 "id_canal" INTEGER NOT NULL,
 "id_comunidad" INTEGER NOT NULL,
 "id_usuario" INTEGER NOT NULL,
 "estado" VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE',
 "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "fecha_resolucion" TIMESTAMP(3),
 CONSTRAINT "solicitud_acceso_estado" CHECK (estado IN ('PENDIENTE','ACEPTADA','RECHAZADA')),
 CONSTRAINT "solicitud_acceso_canal_fk" FOREIGN KEY (id_canal,id_comunidad) REFERENCES canal(id_canal,id_comunidad) ON DELETE CASCADE,
 CONSTRAINT "solicitud_acceso_membresia_fk" FOREIGN KEY (id_comunidad,id_usuario) REFERENCES membresia(id_comunidad,id_usuario) ON DELETE CASCADE
);
CREATE UNIQUE INDEX "solicitud_acceso_canal_id_canal_id_usuario_key" ON "solicitud_acceso_canal" (id_canal,id_usuario);
CREATE INDEX "solicitud_acceso_canal_id_comunidad_estado_idx" ON "solicitud_acceso_canal" (id_comunidad,estado);
