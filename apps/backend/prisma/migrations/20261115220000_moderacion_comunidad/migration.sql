-- AlterTable
ALTER TABLE "comunidad" ADD COLUMN     "moderacion_activa" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "regla_moderacion" (
    "id_regla" SERIAL NOT NULL,
    "id_comunidad" INTEGER NOT NULL,
    "descripcion" VARCHAR(100) NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regla_moderacion_pkey" PRIMARY KEY ("id_regla")
);

-- CreateIndex
CREATE INDEX "regla_moderacion_id_comunidad_idx" ON "regla_moderacion"("id_comunidad");

-- AddForeignKey
ALTER TABLE "regla_moderacion" ADD CONSTRAINT "regla_moderacion_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE;

