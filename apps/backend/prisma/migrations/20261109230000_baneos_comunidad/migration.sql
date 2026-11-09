CREATE TABLE "comunidad_baneo" (
    "id_comunidad" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_autor" INTEGER,
    "rol_anterior" "rol_comunidad" NOT NULL,
    "motivo" VARCHAR(300),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunidad_baneo_pkey" PRIMARY KEY ("id_comunidad", "id_usuario"),
    CONSTRAINT "comunidad_baneo_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comunidad_baneo_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comunidad_baneo_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "comunidad_baneo_id_usuario_idx" ON "comunidad_baneo"("id_usuario");
CREATE INDEX "comunidad_baneo_id_autor_idx" ON "comunidad_baneo"("id_autor");
