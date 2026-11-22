ALTER TABLE comunidad_baneo ADD COLUMN fecha_vencimiento TIMESTAMP(3);
CREATE TABLE canal_expulsion (
 id_canal INTEGER NOT NULL,id_comunidad INTEGER NOT NULL,id_usuario INTEGER NOT NULL,
 PRIMARY KEY(id_canal,id_usuario),
 FOREIGN KEY(id_canal,id_comunidad) REFERENCES canal(id_canal,id_comunidad) ON DELETE CASCADE,
 FOREIGN KEY(id_comunidad,id_usuario) REFERENCES membresia(id_comunidad,id_usuario) ON DELETE CASCADE
);
CREATE TABLE estado_chat (
 id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
 tipo VARCHAR(16) NOT NULL,destino INTEGER NOT NULL,
 archivado BOOLEAN NOT NULL DEFAULT FALSE,oculto BOOLEAN NOT NULL DEFAULT FALSE,leido_hasta TIMESTAMP(3),
 PRIMARY KEY(id_usuario,tipo,destino),CHECK(tipo IN ('conversacion','comunidad','canal'))
);
-- Materializar las admisiones privadas anteriores por rol antes de retirar las excepciones de rol.
INSERT INTO canal_usuario(id_canal,id_comunidad,id_usuario,permisos)
SELECT c.id_canal,c.id_comunidad,mr.id_usuario,array_agg(DISTINCT permission)
FROM canal c JOIN canal_rol_personalizado g ON g.id_canal=c.id_canal
JOIN membresia_rol mr ON mr.id_rol=g.id_rol AND mr.id_comunidad=c.id_comunidad
CROSS JOIN LATERAL unnest(g.permisos) permission
WHERE c.privado AND 'VER'=ANY(g.permisos)
GROUP BY c.id_canal,c.id_comunidad,mr.id_usuario
ON CONFLICT(id_canal,id_usuario) DO NOTHING;
-- Conservar denegaciones públicas anteriores como expulsiones explícitas del canal.
INSERT INTO canal_expulsion(id_canal,id_comunidad,id_usuario)
SELECT u.id_canal,u.id_comunidad,u.id_usuario FROM canal_usuario u JOIN canal c ON c.id_canal=u.id_canal
WHERE NOT c.privado AND NOT ('VER'=ANY(u.permisos)) ON CONFLICT DO NOTHING;
DELETE FROM canal_rol_personalizado;
DELETE FROM canal_rol;
UPDATE rol_personalizado SET permisos=ARRAY(SELECT p FROM unnest(permisos) p WHERE p IN ('ESCRIBIR','HABLAR','CAMARA','PANTALLA','ELIMINAR_MENSAJES','SILENCIAR','GESTIONAR_CANALES','EXPULSAR'));

INSERT INTO estado_chat(id_usuario,tipo,destino,leido_hasta)
SELECT id_usuario_a,'conversacion',id_conversacion,CURRENT_TIMESTAMP FROM conversacion_privada
UNION SELECT id_usuario_b,'conversacion',id_conversacion,CURRENT_TIMESTAMP FROM conversacion_privada;
INSERT INTO estado_chat(id_usuario,tipo,destino,leido_hasta)
SELECT m.id_usuario,'canal',c.id_canal,CURRENT_TIMESTAMP FROM membresia m JOIN canal c ON c.id_comunidad=m.id_comunidad;
