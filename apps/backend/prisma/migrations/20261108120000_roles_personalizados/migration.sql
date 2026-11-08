-- CreateTable
CREATE TABLE "rol_personalizado" (
    "id_rol" SERIAL NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "nombre" VARCHAR(32) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rol_personalizado_pkey" PRIMARY KEY ("id_rol")
);

-- CreateTable
CREATE TABLE "membresia_rol" (
    "id_comunidad" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_rol" INTEGER NOT NULL,

    CONSTRAINT "membresia_rol_pkey" PRIMARY KEY ("id_rol","id_usuario")
);

-- CreateTable
CREATE TABLE "canal_rol_personalizado" (
    "id_canal" INTEGER NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "id_rol" INTEGER NOT NULL,
    "permisos" "permiso_canal"[],

    CONSTRAINT "canal_rol_personalizado_pkey" PRIMARY KEY ("id_canal","id_rol")
);

-- CreateIndex
CREATE INDEX "rol_personalizado_id_comunidad_idx" ON "rol_personalizado"("id_comunidad");

-- CreateIndex
CREATE UNIQUE INDEX "rol_personalizado_id_rol_id_comunidad_key" ON "rol_personalizado"("id_rol", "id_comunidad");

-- CreateIndex
CREATE INDEX "membresia_rol_id_comunidad_id_usuario_idx" ON "membresia_rol"("id_comunidad", "id_usuario");

-- CreateIndex
CREATE INDEX "canal_rol_personalizado_id_rol_idx" ON "canal_rol_personalizado"("id_rol");

-- AddForeignKey
ALTER TABLE "rol_personalizado" ADD CONSTRAINT "rol_personalizado_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_rol" ADD CONSTRAINT "membresia_rol_id_comunidad_id_usuario_fkey" FOREIGN KEY ("id_comunidad", "id_usuario") REFERENCES "membresia"("id_comunidad", "id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia_rol" ADD CONSTRAINT "membresia_rol_id_rol_id_comunidad_fkey" FOREIGN KEY ("id_rol", "id_comunidad") REFERENCES "rol_personalizado"("id_rol", "id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_rol_personalizado" ADD CONSTRAINT "canal_rol_personalizado_id_canal_id_comunidad_fkey" FOREIGN KEY ("id_canal", "id_comunidad") REFERENCES "canal"("id_canal", "id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_rol_personalizado" ADD CONSTRAINT "canal_rol_personalizado_id_rol_id_comunidad_fkey" FOREIGN KEY ("id_rol", "id_comunidad") REFERENCES "rol_personalizado"("id_rol", "id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones que Prisma no puede expresar
CREATE UNIQUE INDEX "rol_personalizado_nombre_unico" ON "rol_personalizado" ("id_comunidad", lower(btrim("nombre")));
ALTER TABLE "rol_personalizado" ADD CONSTRAINT "rol_personalizado_nombre_valido" CHECK (length(btrim("nombre")) > 0 AND lower(btrim("nombre")) NOT IN ('propietario', 'admin', 'moderador', 'integrante'));
ALTER TABLE "canal_rol_personalizado" ADD CONSTRAINT "canal_rol_personalizado_con_permisos" CHECK ("permisos" IS NOT NULL AND cardinality("permisos") > 0);