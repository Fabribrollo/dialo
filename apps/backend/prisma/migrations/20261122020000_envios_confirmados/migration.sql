CREATE TABLE "envio_confirmado" (
 "id_autor" INTEGER NOT NULL REFERENCES "usuario"("id_usuario") ON DELETE CASCADE,
 "clave" UUID NOT NULL,
 "huella" VARCHAR(64) NOT NULL,
 "mensajes" INTEGER[] NOT NULL,
 "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("id_autor", "clave")
);
