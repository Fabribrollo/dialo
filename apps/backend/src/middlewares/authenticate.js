import { env } from '../config/env.js';
import { SESSION_COOKIE } from '../config/cookies.js';
import { AppError } from '../utils/AppError.js';
import { findAuthUserById, findAuthUserBySessionToken } from '../services/authService.js';

export async function authenticate(req, res, next) {
  const devUserId = env.isProduction ? null : req.get('x-dev-user-id');

  const user = devUserId
    ? await findAuthUserById(Number(devUserId))
    : await findAuthUserBySessionToken(req.cookies?.[SESSION_COOKIE]);

  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Tenés que iniciar sesión');

  req.user = user;
  next();
}
