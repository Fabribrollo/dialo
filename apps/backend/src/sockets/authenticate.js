import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../config/cookies.js';
import { findAuthUserById, findAuthUserBySessionToken } from '../services/authService.js';
import { AppError } from '../utils/AppError.js';

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function authenticateSocket(socket, next) {
  try {
    const devUserId = env.isProduction ? null : socket.handshake.auth?.devUserId;

    const user = devUserId
      ? await findAuthUserById(Number(devUserId))
      : await findAuthUserBySessionToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));

    if (!user) return next(Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } }));

    socket.data.user = user;
    // Credencial conservada solo en el servidor, nunca en un ack/evento.
    socket.data.auth = devUserId
      ? { devUserId: Number(devUserId) }
      : { token: readCookie(socket.handshake.headers.cookie, SESSION_COOKIE) };
    next();
  } catch (error) {
    if (!(error instanceof URIError)) console.error(error);
    next(Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } }));
  }
}

export async function requireSocketUser(socket) {
  const auth = socket.data.auth;
  const user = !env.isProduction && auth?.devUserId
    ? await findAuthUserById(auth.devUserId)
    : await findAuthUserBySessionToken(auth?.token);
  if (!user || user.id !== socket.data.user?.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'La sesión no es válida o venció');
  }
  socket.data.user = user;
  return user;
}
