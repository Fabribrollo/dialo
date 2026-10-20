import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../config/cookies.js';
import { findAuthUserById, findAuthUserBySessionId, findSessionByToken } from '../services/authService.js';
import { AppError } from '../utils/AppError.js';

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

const unauthorized = () => Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED' } });

export async function authenticateSocket(socket, next) {
  try {
    const devUserId = env.isProduction ? null : socket.handshake.auth?.devUserId;

    if (devUserId) {
      const user = await findAuthUserById(Number(devUserId));
      if (!user) return next(unauthorized());
      socket.data.user = user;
      socket.data.auth = { devUserId: Number(devUserId) };
      return next();
    }

    const sesion = await findSessionByToken(readCookie(socket.handshake.headers.cookie, SESSION_COOKIE));
    if (!sesion) return next(unauthorized());

    socket.data.user = sesion.usuario;
    // Se guarda el id de la sesion, nunca el token.
    socket.data.auth = { idSesion: sesion.id, fechaExpiracion: sesion.fechaExpiracion };
    next();
  } catch (error) {
    if (!(error instanceof URIError)) console.error(error);
    next(unauthorized());
  }
}

export async function requireSocketUser(socket, db) {
  const auth = socket.data.auth;
  const user = !env.isProduction && auth?.devUserId
    ? await findAuthUserById(auth.devUserId, db)
    : await findAuthUserBySessionId(auth?.idSesion, db);
  if (!user || user.id !== socket.data.user?.id) {
    throw new AppError(401, 'UNAUTHORIZED', 'La sesión no es válida o venció');
  }
  socket.data.user = user;
  return user;
}
