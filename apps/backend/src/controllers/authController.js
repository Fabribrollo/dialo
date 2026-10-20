import { SESSION_COOKIE, sessionCookieOptions } from '../config/cookies.js';
import * as authService from '../services/authService.js';
import { endSession, endUserSessions } from '../sockets/emitter.js';

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function register(req, res) {
  const { usuario, token } = await authService.register(req.validated.body);
  setSessionCookie(res, token);
  res.status(201).json({ usuario });
}

export async function login(req, res) {
  const { identificador, contrasena } = req.validated.body;
  const { usuario, token } = await authService.login(identificador, contrasena);
  setSessionCookie(res, token);
  res.json({ usuario });
}

export async function logout(req, res) {
  const idSesion = await authService.logout(req.cookies?.[SESSION_COOKIE]);
  if (idSesion) endSession(idSesion, 'LOGOUT');
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.validated.body.correo);
  res.status(202).end();
}

export async function resetPassword(req, res) {
  const { token, contrasena } = req.validated.body;
  const idUsuario = await authService.resetPassword(token, contrasena);
  endUserSessions(idUsuario, 'CONTRASENA_CAMBIADA');
  res.status(204).end();
}
