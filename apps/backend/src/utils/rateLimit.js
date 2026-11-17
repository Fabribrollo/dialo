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

const registerQuota = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });
const forgotPasswordQuota = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });

function limitAuthRequests(quota) {
  return (req, res, next) => {
    if (!quota(req.ip)) {
      throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Probá más tarde.');
    }
    next();
  };
}

export const limitRegister = limitAuthRequests(registerQuota);
export const limitForgotPassword = limitAuthRequests(forgotPasswordQuota);

const loginWindows = new Map();
const LOGIN_WINDOW_MS = 15 * 60_000;

export function limitLoginFailures(req, res, next) {
  const ip = req.ip;
  let window = loginWindows.get(ip);
  if (!window || Date.now() >= window.endsAt) {
    window = { endsAt: Date.now() + LOGIN_WINDOW_MS, used: 0 };
    loginWindows.set(ip, window);
    setTimeout(() => {
      if (loginWindows.get(ip) === window) loginWindows.delete(ip);
    }, LOGIN_WINDOW_MS).unref();
  }
  if (window.used >= 10) {
    throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos de inicio de sesión. Probá más tarde.');
  }
  // Reserva un lugar mientras se responde para que los intentos en paralelo cuenten.
  window.used++;
  res.once('close', () => {
    if (!res.writableFinished || res.statusCode !== 401) window.used--;
  });
  next();
}
