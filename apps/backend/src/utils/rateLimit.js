import { AppError } from './AppError.js';

export function createRateLimiter({ max, windowMs }) {
  const registros = new Map();
  return function consume(clave) {
    const ahora = Date.now();
    const recientes = (registros.get(clave) ?? []).filter((momento) => ahora - momento < windowMs);
    if (recientes.length >= max) {
      registros.set(clave, recientes);
      return false;
    }
    recientes.push(ahora);
    registros.set(clave, recientes);
    return true;
  };
}

const messageLimiter = createRateLimiter({ max: 5, windowMs: 5000 });

export function requireMessageQuota(idUsuario) {
  if (!messageLimiter(idUsuario)) {
    throw new AppError(429, 'RATE_LIMITED', 'Estás enviando mensajes muy rápido. Esperá unos segundos.');
  }
}

const imageLimiter = createRateLimiter({ max: 5, windowMs: 60000 });

export function limitImageUploads(req, res, next) {
  if (!imageLimiter(req.user.id)) throw new AppError(429, 'RATE_LIMITED', 'Estás subiendo imágenes muy rápido. Esperá un momento.');
  next();
}
