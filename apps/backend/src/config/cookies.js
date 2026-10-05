import { env } from './env.js';

export const SESSION_COOKIE = 'dialo_sid';
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: env.isProduction ? 'none' : 'lax',
  maxAge: SESSION_DURATION_MS,
  path: '/',
};
