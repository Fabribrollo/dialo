-- Recibo de confirmación: se conserva aunque se elimine la comunidad.
CREATE TABLE "creacion_comunidad" (
  "id_autor" INTEGER NOT NULL,
  "clave" UUID NOT NULL,
  "huella" VARCHAR(64) NOT NULL,
  "id_comunidad" INTEGER NOT NULL,
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creacion_comunidad_pkey" PRIMARY KEY ("id_autor", "clave"),
  CONSTRAINT "creacion_comunidad_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE
);
