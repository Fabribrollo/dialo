import { z } from 'zod';

const nombreUsuario = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_.]+$/, 'Solo se permiten minúsculas, números, "_" y "."');

const correo = z.email().max(254).toLowerCase();

const contrasena = z.string().min(8).max(72);

export const nombreVisible = z.string().trim().min(1).max(64);

export const registerSchema = z.object({ nombreUsuario, correo, contrasena, nombreVisible });

const identificador = z.string().trim().min(1);

const contrasenaLogin = z.string().min(1);

export const loginSchema = z.object({ identificador, contrasena: contrasenaLogin });

export const forgotPasswordSchema = z.object({ correo });

export const resetPasswordSchema = z.object({ token: z.string().min(1), contrasena });
