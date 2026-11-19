import { AppError } from './AppError.js';

const limiterMaps = new Set();
export function createRateLimiter({ max, windowMs }) {
  const registros = new Map();
  limiterMaps.add(registros);
  function consume(clave) {
    const ahora = Date.now();
    const recientes = (registros.get(clave) ?? []).filter((momento) => ahora - momento < windowMs);
    if (recientes.length >= max) {
      registros.set(clave, recientes);
      return false;
    }
    recientes.push(ahora);
    registros.set(clave, recientes);
    return true;
  }
  consume.retryAfter = (clave) => Math.max(1, Math.ceil((windowMs - (Date.now() - (registros.get(clave)?.[0] ?? Date.now()))) / 1000));
  return consume;
}

const messageLimiter = createRateLimiter({ max: 5, windowMs: 5000 });

export function requireMessageQuota(idUsuario) {
  if (!messageLimiter(idUsuario)) {
    throw rateError(messageLimiter.retryAfter(idUsuario));
  }
}

const imageLimiter = createRateLimiter({ max: 5, windowMs: 60000 });

export function limitImageUploads(req, res, next) {
  if (!imageLimiter(req.user.id)) throw rateError(imageLimiter.retryAfter(req.user.id));
  next();
}

const registerQuota = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });
const forgotPasswordQuota = createRateLimiter({ max: 5, windowMs: 15 * 60_000 });

function limitAuthRequests(quota) {
  return (req, res, next) => {
    if (!quota(req.ip)) {
      throw rateError(quota.retryAfter(req.ip));
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
    throw rateError(Math.max(1, Math.ceil((window.endsAt - Date.now()) / 1000)));
  }
  // Reserva un lugar mientras se responde para que los intentos en paralelo cuenten.
  window.used++;
  res.once('close', () => {
    if (!res.writableFinished || res.statusCode !== 401) window.used--;
  });
  next();
}

function rateError(retryAfter) { const error = new AppError(429, 'RATE_LIMITED', 'Demasiados intentos. Probá más tarde.'); error.retryAfter = retryAfter; return error; }

// Solo lo usan las pruebas para aislar cuotas entre escenarios.
export function resetRateLimits() { for (const map of limiterMaps) map.clear(); loginWindows.clear(); }
