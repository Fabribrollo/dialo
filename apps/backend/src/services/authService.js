import { prisma } from '../prisma/client.js';
import { SESSION_DURATION_MS } from '../config/cookies.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { sendPasswordReset } from '../utils/mailer.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { usuarioPropioSelect } from '../utils/selects.js';
import { generateToken, hashToken } from '../utils/tokens.js';

const RESET_DURATION_MS = 60 * 60 * 1000;

const authUserSelect = { id: true, nombreUsuario: true, nombreVisible: true };

export async function findAuthUserById(id) {
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.usuario.findUnique({ where: { id }, select: authUserSelect });
}

export async function findAuthUserBySessionToken(token) {
  if (!token) return null;

  const sesion = await prisma.sesion.findUnique({
    where: {
      hashToken: hashToken(token),
      fechaRevocacion: null,
      fechaExpiracion: { gt: new Date() },
    },
    select: { usuario: { select: authUserSelect } },
  });

  return sesion?.usuario ?? null;
}

export async function createSession(idUsuario) {
  const token = generateToken();
  await prisma.sesion.create({
    data: {
      idUsuario,
      hashToken: hashToken(token),
      fechaExpiracion: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });
  return token;
}

export async function register({ contrasena, ...datos }) {
  if (await prisma.usuario.findUnique({ where: { nombreUsuario: datos.nombreUsuario }, select: { id: true } })) {
    throw new AppError(409, 'USERNAME_TAKEN', 'El nombre de usuario ya está en uso');
  }
  if (await prisma.usuario.findUnique({ where: { correo: datos.correo }, select: { id: true } })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'El correo ya está registrado');
  }

  const hashContrasena = await hashPassword(contrasena);

  const usuario = await prisma.usuario.create({
    data: { ...datos, hashContrasena },
    select: usuarioPropioSelect,
  });

  return { usuario, token: await createSession(usuario.id) };
}

export async function login(identificador, contrasena) {
  const where = identificador.includes('@')
    ? { correo: identificador.toLowerCase() }
    : { nombreUsuario: identificador };

  const encontrado = await prisma.usuario.findUnique({
    where,
    select: { ...usuarioPropioSelect, hashContrasena: true },
  });

  if (!encontrado || !(await verifyPassword(contrasena, encontrado.hashContrasena))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos');
  }

  const { hashContrasena, ...usuario } = encontrado;
  return { usuario, token: await createSession(usuario.id) };
}

export async function logout(token) {
  if (!token) return;
  await prisma.sesion.updateMany({
    where: { hashToken: hashToken(token), fechaRevocacion: null },
    data: { fechaRevocacion: new Date() },
  });
}

export async function requestPasswordReset(correo) {
  const usuario = await prisma.usuario.findUnique({ where: { correo }, select: { id: true } });
  if (!usuario) return;

  const token = generateToken();
  await prisma.recuperacionCuenta.create({
    data: {
      idUsuario: usuario.id,
      hashToken: hashToken(token),
      fechaExpiracion: new Date(Date.now() + RESET_DURATION_MS),
    },
  });

  sendPasswordReset(correo, `${env.clientUrl}/reset-password?token=${token}`);
}

export async function resetPassword(token, contrasena) {
  const invalidToken = () => new AppError(400, 'INVALID_TOKEN', 'El enlace no es válido o ya venció');
  const ahora = new Date();

  const recuperacion = await prisma.recuperacionCuenta.findUnique({
    where: { hashToken: hashToken(token), fechaUtilizacion: null, fechaExpiracion: { gt: ahora } },
    select: { id: true, idUsuario: true },
  });
  if (!recuperacion) throw invalidToken();

  const hashContrasena = await hashPassword(contrasena);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.recuperacionCuenta.updateMany({
      where: { id: recuperacion.id, fechaUtilizacion: null },
      data: { fechaUtilizacion: ahora },
    });
    if (!count) throw invalidToken();

    await tx.usuario.update({ where: { id: recuperacion.idUsuario }, data: { hashContrasena } });
    await tx.sesion.updateMany({
      where: { idUsuario: recuperacion.idUsuario, fechaRevocacion: null },
      data: { fechaRevocacion: ahora },
    });
  });
}
