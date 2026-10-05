import { SESSION_COOKIE, sessionCookieOptions } from '../config/cookies.js';
import * as authService from '../services/authService.js';

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
  await authService.logout(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions);
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await authService.requestPasswordReset(req.validated.body.correo);
  res.status(202).end();
}

export async function resetPassword(req, res) {
  const { token, contrasena } = req.validated.body;
  await authService.resetPassword(token, contrasena);
  res.status(204).end();
}
