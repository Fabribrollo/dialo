-- CreateTable
CREATE TABLE "participante_llamada" (
    "id_usuario" INTEGER NOT NULL,
    "id_canal" INTEGER NOT NULL,
    "ingreso" VARCHAR(36) NOT NULL,
    "id_sesion" INTEGER,
    "conectado" BOOLEAN NOT NULL DEFAULT false,
    "fecha_autorizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_conexion" TIMESTAMP(3),

    CONSTRAINT "participante_llamada_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateIndex
CREATE UNIQUE INDEX "participante_llamada_ingreso_key" ON "participante_llamada"("ingreso");

-- CreateIndex
CREATE INDEX "participante_llamada_id_canal_conectado_idx" ON "participante_llamada"("id_canal", "conectado");

-- AddForeignKey
ALTER TABLE "participante_llamada" ADD CONSTRAINT "participante_llamada_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participante_llamada" ADD CONSTRAINT "participante_llamada_id_canal_fkey" FOREIGN KEY ("id_canal") REFERENCES "canal"("id_canal") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participante_llamada" ADD CONSTRAINT "participante_llamada_id_sesion_fkey" FOREIGN KEY ("id_sesion") REFERENCES "sesion"("id_sesion") ON DELETE SET NULL ON UPDATE CASCADE;

