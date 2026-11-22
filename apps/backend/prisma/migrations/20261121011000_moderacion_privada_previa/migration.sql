-- El enum agregado en la migración anterior ya está confirmado.
-- Conservar la moderación privada anterior solo donde la persona ya tenía VER.
UPDATE canal_usuario u SET permisos = u.permisos || ARRAY['ELIMINAR_MENSAJES']::permiso_canal[]
FROM canal c
WHERE c.id_canal=u.id_canal AND c.privado AND c.tipo='TEXTO'
AND 'VER'=ANY(u.permisos) AND NOT ('ELIMINAR_MENSAJES'=ANY(u.permisos))
AND EXISTS (
 SELECT 1 FROM membresia_rol mr JOIN rol_personalizado r ON r.id_rol=mr.id_rol
 WHERE mr.id_usuario=u.id_usuario AND mr.id_comunidad=u.id_comunidad
 AND r.nombre LIKE 'Equipo anterior %' AND 'ELIMINAR_MENSAJES'=ANY(r.permisos)
);
