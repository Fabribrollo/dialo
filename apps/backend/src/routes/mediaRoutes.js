import express, { Router } from 'express';
import { AppError } from '../utils/AppError.js';
import { media, notificarEventoMedia } from '../services/mediaService.js';

const router = Router();

// Publico: solo informa si las llamadas estan disponibles. El chat no depende de esto.
router.get('/health', async (req, res) => {
  const estado = await media.verificarDisponibilidad();
  if (!estado.disponible) throw new AppError(503, 'MEDIA_UNAVAILABLE', 'Las llamadas no estan disponibles en este momento');
  res.json(estado);
});

// LiveKit firma cada evento; el cuerpo se lee sin parsear para poder verificar la firma.
router.post('/webhook', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  const cuerpo = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const evento = await media.recibirEvento(cuerpo, req.get('authorization'));
  await notificarEventoMedia(evento);
  res.status(200).end();
});

export default router;
