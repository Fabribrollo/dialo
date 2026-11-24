-- F-14: silenciamiento de comunidad y propuestas de moderación preparadas por IA.
CREATE TYPE "alcance_silencio" AS ENUM ('TEXTO', 'VOZ', 'AMBOS');
CREATE TYPE "medida_moderacion" AS ENUM ('SILENCIAR', 'EXPULSAR', 'BANEAR');
CREATE TYPE "estado_propuesta" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA');

-- Un silencio activo por integrante y comunidad. No depende de la membresía:
-- sigue vigente si la persona sale y vuelve antes de que venza.
CREATE TABLE "silencio_comunidad" (
  "id_comunidad" INTEGER NOT NULL,
  "id_usuario" INTEGER NOT NULL,
  "id_autor" INTEGER,
  "alcance" "alcance_silencio" NOT NULL,
  "motivo" VARCHAR(300),
  "fecha_vencimiento" TIMESTAMP(3),
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "silencio_comunidad_pkey" PRIMARY KEY ("id_comunidad", "id_usuario"),
  CONSTRAINT "silencio_comunidad_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "silencio_comunidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "silencio_comunidad_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "silencio_comunidad_id_usuario_idx" ON "silencio_comunidad"("id_usuario");

-- La propuesta guarda exactamente lo que se revisó; confirmar la ejecuta una sola vez.
CREATE TABLE "propuesta_moderacion" (
  "id_propuesta" SERIAL NOT NULL,
  "id_comunidad" INTEGER NOT NULL,
  "id_solicitante" INTEGER NOT NULL,
  "id_destinatario" INTEGER NOT NULL,
  "id_confirmador" INTEGER,
  "medida" "medida_moderacion" NOT NULL,
  "alcance" "alcance_silencio",
  "duracion" VARCHAR(16) NOT NULL,
  "motivo" VARCHAR(300),
  "estado" "estado_propuesta" NOT NULL DEFAULT 'PENDIENTE',
  "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_vencimiento" TIMESTAMP(3) NOT NULL,
  "fecha_resolucion" TIMESTAMP(3),
  CONSTRAINT "propuesta_moderacion_pkey" PRIMARY KEY ("id_propuesta"),
  CONSTRAINT "propuesta_moderacion_id_comunidad_fkey" FOREIGN KEY ("id_comunidad") REFERENCES "comunidad"("id_comunidad") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "propuesta_moderacion_id_solicitante_fkey" FOREIGN KEY ("id_solicitante") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "propuesta_moderacion_id_destinatario_fkey" FOREIGN KEY ("id_destinatario") REFERENCES "usuario"("id_usuario") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "propuesta_moderacion_id_confirmador_fkey" FOREIGN KEY ("id_confirmador") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "propuesta_moderacion_id_comunidad_id_propuesta_idx" ON "propuesta_moderacion"("id_comunidad", "id_propuesta");
