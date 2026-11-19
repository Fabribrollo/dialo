CREATE TABLE "adjunto" (
  "id" SERIAL PRIMARY KEY,
  "nombre" VARCHAR(120) NOT NULL,
  "tipo" VARCHAR(80) NOT NULL,
  "datos" BYTEA NOT NULL,
  "id_mensaje" INTEGER NOT NULL UNIQUE REFERENCES "mensaje"("id_mensaje") ON DELETE CASCADE
);
