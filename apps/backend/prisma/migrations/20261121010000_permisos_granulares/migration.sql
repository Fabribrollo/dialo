ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'CAMARA';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'PANTALLA';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'SILENCIAR';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'ELIMINAR_MENSAJES';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'BANEAR';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'EXPULSAR';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'GESTIONAR_CANALES';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'GESTIONAR_INVITACIONES';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'GESTIONAR_ROLES';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'EDITAR_COMUNIDAD';
ALTER TYPE "permiso_canal" ADD VALUE IF NOT EXISTS 'GESTIONAR_MODERACION';
ALTER TABLE rol_personalizado ADD COLUMN permisos TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE canal_usuario DROP CONSTRAINT canal_usuario_con_permisos;
ALTER TABLE canal_rol_personalizado DROP CONSTRAINT canal_rol_personalizado_con_permisos;
ALTER TABLE canal_usuario ADD CONSTRAINT canal_usuario_con_permisos CHECK (permisos IS NOT NULL);
ALTER TABLE canal_rol_personalizado ADD CONSTRAINT canal_rol_personalizado_con_permisos CHECK (permisos IS NOT NULL);
-- Retirar el rol base sin perder las responsabilidades de las personas existentes.
WITH creados AS (
 INSERT INTO rol_personalizado (id_comunidad,nombre,permisos)
 SELECT id_comunidad,'Equipo anterior '||substr(md5(random()::TEXT),1,8),ARRAY['GESTIONAR_INVITACIONES','BANEAR','ELIMINAR_MENSAJES']::TEXT[]
 FROM (SELECT DISTINCT id_comunidad FROM membresia WHERE rol='MODERADOR') comunidades
 RETURNING id_rol,id_comunidad
)
INSERT INTO membresia_rol (id_comunidad,id_usuario,id_rol)
SELECT m.id_comunidad,m.id_usuario,r.id_rol FROM membresia m JOIN creados r ON r.id_comunidad=m.id_comunidad
WHERE m.rol='MODERADOR';
UPDATE membresia SET rol='INTEGRANTE' WHERE rol='MODERADOR';
UPDATE comunidad_baneo SET rol_anterior='INTEGRANTE' WHERE rol_anterior='MODERADOR';
CREATE TABLE canal_silencio (
 id_canal INTEGER NOT NULL,id_comunidad INTEGER NOT NULL,id_usuario INTEGER NOT NULL,
 PRIMARY KEY(id_canal,id_usuario),
 FOREIGN KEY(id_canal,id_comunidad) REFERENCES canal(id_canal,id_comunidad) ON DELETE CASCADE,
 FOREIGN KEY(id_comunidad,id_usuario) REFERENCES membresia(id_comunidad,id_usuario) ON DELETE CASCADE
);
