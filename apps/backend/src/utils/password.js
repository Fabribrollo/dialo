import bcrypt from 'bcryptjs';

const COSTO = 10;

export function hashPassword(contrasena) {
  return bcrypt.hash(contrasena, COSTO);
}

export function verifyPassword(contrasena, hash) {
  return bcrypt.compare(contrasena, hash);
}
