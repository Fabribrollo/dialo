-- CreateEnum
CREATE TYPE "disponibilidad" AS ENUM ('EN_LINEA', 'AUSENTE', 'NO_MOLESTAR', 'INVISIBLE');

-- CreateEnum
CREATE TYPE "estado_solicitud" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id_usuario" SERIAL NOT NULL,
    "nombre_usuario" VARCHAR(32) NOT NULL,
    "correo" VARCHAR(254) NOT NULL,
    "hash_contrasena" TEXT NOT NULL,
    "nombre_visible" VARCHAR(64) NOT NULL,
    "foto_url" TEXT,
    "informacion_personal" VARCHAR(500),
    "disponibilidad" "disponibilidad" NOT NULL DEFAULT 'EN_LINEA',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id_sesion" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "hash_token" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_expiracion" TIMESTAMP(3) NOT NULL,
    "fecha_revocacion" TIMESTAMP(3),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id_sesion")
);

-- CreateTable
CREATE TABLE "recuperacion_cuenta" (
    "id_recuperacion" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "hash_token" TEXT NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_expiracion" TIMESTAMP(3) NOT NULL,
    "fecha_utilizacion" TIMESTAMP(3),

    CONSTRAINT "recuperacion_cuenta_pkey" PRIMARY KEY ("id_recuperacion")
);

-- CreateTable
CREATE TABLE "solicitud_amistad" (
    "id_solicitud" SERIAL NOT NULL,
    "id_emisor" INTEGER NOT NULL,
    "id_receptor" INTEGER NOT NULL,
    "estado" "estado_solicitud" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_respuesta" TIMESTAMP(3),

    CONSTRAINT "solicitud_amistad_pkey" PRIMARY KEY ("id_solicitud")
);

-- CreateTable
CREATE TABLE "amistad" (
    "id_usuario_a" INTEGER NOT NULL,
    "id_usuario_b" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amistad_pkey" PRIMARY KEY ("id_usuario_a","id_usuario_b")
);

-- CreateTable
CREATE TABLE "conversacion_privada" (
    "id_conversacion" SERIAL NOT NULL,
    "id_usuario_a" INTEGER NOT NULL,
    "id_usuario_b" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversacion_privada_pkey" PRIMARY KEY ("id_conversacion")
);

-- CreateTable
CREATE TABLE "mensaje" (
    "id_mensaje" SERIAL NOT NULL,
    "id_autor" INTEGER NOT NULL,
    "id_conversacion" INTEGER,
    "id_canal" INTEGER,
    "contenido" VARCHAR(2000) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_edicion" TIMESTAMP(3),
    "fecha_eliminacion" TIMESTAMP(3),
    "id_usuario_eliminacion" INTEGER,

    CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id_mensaje")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_nombre_usuario_key" ON "usuario"("nombre_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_hash_token_key" ON "sesion"("hash_token");

-- CreateIndex
CREATE INDEX "sesion_id_usuario_idx" ON "sesion"("id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "recuperacion_cuenta_hash_token_key" ON "recuperacion_cuenta"("hash_token");

-- CreateIndex
CREATE INDEX "recuperacion_cuenta_id_usuario_idx" ON "recuperacion_cuenta"("id_usuario");

-- CreateIndex
CREATE INDEX "solicitud_amistad_id_receptor_estado_idx" ON "solicitud_amistad"("id_receptor", "estado");

-- CreateIndex
CREATE INDEX "solicitud_amistad_id_emisor_estado_idx" ON "solicitud_amistad"("id_emisor", "estado");

-- CreateIndex
CREATE INDEX "amistad_id_usuario_b_idx" ON "amistad"("id_usuario_b");

-- CreateIndex
CREATE INDEX "conversacion_privada_id_usuario_b_idx" ON "conversacion_privada"("id_usuario_b");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_privada_id_usuario_a_id_usuario_b_key" ON "conversacion_privada"("id_usuario_a", "id_usuario_b");

-- CreateIndex
CREATE INDEX "mensaje_id_conversacion_fecha_creacion_idx" ON "mensaje"("id_conversacion", "fecha_creacion");

-- CreateIndex
CREATE INDEX "mensaje_id_canal_fecha_creacion_idx" ON "mensaje"("id_canal", "fecha_creacion");

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recuperacion_cuenta" ADD CONSTRAINT "recuperacion_cuenta_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_amistad" ADD CONSTRAINT "solicitud_amistad_id_emisor_fkey" FOREIGN KEY ("id_emisor") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_amistad" ADD CONSTRAINT "solicitud_amistad_id_receptor_fkey" FOREIGN KEY ("id_receptor") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_id_usuario_a_fkey" FOREIGN KEY ("id_usuario_a") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_id_usuario_b_fkey" FOREIGN KEY ("id_usuario_b") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_privada" ADD CONSTRAINT "conversacion_privada_id_usuario_a_fkey" FOREIGN KEY ("id_usuario_a") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_privada" ADD CONSTRAINT "conversacion_privada_id_usuario_b_fkey" FOREIGN KEY ("id_usuario_b") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "conversacion_privada"("id_conversacion") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_id_usuario_eliminacion_fkey" FOREIGN KEY ("id_usuario_eliminacion") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "amistad" ADD CONSTRAINT "amistad_par_ordenado" CHECK ("id_usuario_a" < "id_usuario_b");
ALTER TABLE "conversacion_privada" ADD CONSTRAINT "conversacion_par_ordenado" CHECK ("id_usuario_a" < "id_usuario_b");
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_un_destino" CHECK (("id_conversacion" IS NULL) <> ("id_canal" IS NULL));
CREATE UNIQUE INDEX "solicitud_pendiente_unica" ON "solicitud_amistad" (LEAST("id_emisor", "id_receptor"), GREATEST("id_emisor", "id_receptor")) WHERE "estado" = 'PENDIENTE';