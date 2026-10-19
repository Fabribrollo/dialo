-- CreateEnum
CREATE TYPE "tipo_comunidad" AS ENUM ('PUBLICA', 'PRIVADA');

-- CreateEnum
CREATE TYPE "rol_comunidad" AS ENUM ('PROPIETARIO', 'ADMIN', 'MODERADOR', 'INTEGRANTE');

-- CreateEnum
CREATE TYPE "tipo_canal" AS ENUM ('TEXTO', 'VOZ', 'VIDEO');

-- CreateEnum
CREATE TYPE "permiso_canal" AS ENUM ('VER', 'ESCRIBIR', 'HABLAR', 'TRANSMITIR');

-- CreateTable
CREATE TABLE "comunidad" (
    "id_comunidad" SERIAL NOT NULL,
    "nombre" VARCHAR(64) NOT NULL,
    "imagen_url" TEXT,
    "tipo" "tipo_comunidad" NOT NULL DEFAULT 'PRIVADA',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comunidad_pkey" PRIMARY KEY ("id_comunidad")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id_comunidad" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "rol" "rol_comunidad" NOT NULL DEFAULT 'INTEGRANTE',
    "fecha_ingreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id_comunidad","id_usuario")
);

-- CreateTable
CREATE TABLE "invitacion" (
    "id_invitacion" SERIAL NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "id_creador" INTEGER NOT NULL,
    "codigo" VARCHAR(16) NOT NULL,
    "usos_maximos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "fecha_expiracion" TIMESTAMP(3),
    "fecha_revocacion" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitacion_pkey" PRIMARY KEY ("id_invitacion")
);

-- CreateTable
CREATE TABLE "canal" (
    "id_canal" SERIAL NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "nombre" VARCHAR(32) NOT NULL,
    "tipo" "tipo_canal" NOT NULL DEFAULT 'TEXTO',
    "privado" BOOLEAN NOT NULL DEFAULT false,
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canal_pkey" PRIMARY KEY ("id_canal")
);

-- CreateTable
CREATE TABLE "canal_rol" (
    "id_canal" INTEGER NOT NULL,
    "rol" "rol_comunidad" NOT NULL,
    "permisos" "permiso_canal"[],

    CONSTRAINT "canal_rol_pkey" PRIMARY KEY ("id_canal","rol")
);

-- CreateTable
CREATE TABLE "canal_usuario" (
    "id_canal" INTEGER NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "permisos" "permiso_canal"[],

    CONSTRAINT "canal_usuario_pkey" PRIMARY KEY ("id_canal","id_usuario")
);

-- CreateIndex
CREATE INDEX "comunidad_tipo_idx" ON "comunidad"("tipo");

-- CreateIndex
CREATE INDEX "membresia_id_usuario_fecha_ingreso_idx" ON "membresia"("id_usuario", "fecha_ingreso");

-- CreateIndex
CREATE UNIQUE INDEX "invitacion_codigo_key" ON "invitacion"("codigo");

-- CreateIndex
CREATE INDEX "invitacion_id_comunidad_fecha_creacion_idx" ON "invitacion"("id_comunidad", "fecha_creacion");

-- CreateIndex
CREATE INDEX "canal_id_comunidad_posicion_idx" ON "canal"("id_comunidad", "posicion");

-- CreateIndex
CREATE UNIQUE INDEX "canal_id_canal_id_comunidad_key" ON "canal"("id_canal", "id_comunidad");

-- CreateIndex
CREATE INDEX "canal_usuario_id_comunidad_id_usuario_idx" ON "canal_usuario"("id_comunidad", "id_usuario");

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_canal_fkey" FOREIGN KEY ("id_canal") REFERENCES "canal"("id_canal") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_id_creador_fkey" FOREIGN KEY ("id_creador") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal" ADD CONSTRAINT "canal_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_rol" ADD CONSTRAINT "canal_rol_id_canal_fkey" FOREIGN KEY ("id_canal") REFERENCES "canal"("id_canal") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_usuario" ADD CONSTRAINT "canal_usuario_id_canal_id_comunidad_fkey" FOREIGN KEY ("id_canal", "id_comunidad") REFERENCES "canal"("id_canal", "id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_usuario" ADD CONSTRAINT "canal_usuario_id_comunidad_id_usuario_fkey" FOREIGN KEY ("id_comunidad", "id_usuario") REFERENCES "membresia"("id_comunidad", "id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones que Prisma no puede expresar
CREATE UNIQUE INDEX "membresia_propietario_unico" ON "membresia" ("id_comunidad") WHERE "rol" = 'PROPIETARIO';
ALTER TABLE "invitacion" ADD CONSTRAINT "invitacion_usos_validos" CHECK ("usos" >= 0 AND ("usos_maximos" IS NULL OR ("usos_maximos" BETWEEN 1 AND 100 AND "usos" <= "usos_maximos")));
ALTER TABLE "canal" ADD CONSTRAINT "canal_posicion_valida" CHECK ("posicion" >= 0);
ALTER TABLE "canal_rol" ADD CONSTRAINT "canal_rol_valido" CHECK ("rol" IN ('MODERADOR', 'INTEGRANTE'));
ALTER TABLE "canal_rol" ADD CONSTRAINT "canal_rol_con_permisos" CHECK ("permisos" IS NOT NULL AND cardinality("permisos") > 0);
ALTER TABLE "canal_usuario" ADD CONSTRAINT "canal_usuario_con_permisos" CHECK ("permisos" IS NOT NULL AND cardinality("permisos") > 0);