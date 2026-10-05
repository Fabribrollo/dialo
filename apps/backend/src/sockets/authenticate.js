import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../config/cookies.js';
import { findAuthUserById, findAuthUserBySessionToken } from '../services/auth.service.js';

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
    next();
  } catch (error) {
    next(error);
  }
}
