-- F-14: las propuestas con IA también pueden quitar un silencio o levantar un baneo.
ALTER TYPE "medida_moderacion" ADD VALUE IF NOT EXISTS 'QUITAR_SILENCIO';
ALTER TYPE "medida_moderacion" ADD VALUE IF NOT EXISTS 'DESBANEAR';
