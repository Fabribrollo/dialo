import assert from 'node:assert/strict';
import { test } from 'node:test';
import { communityRoleParamsSchema, roleBodySchema } from '../src/validations/rolesValidation.js';

test('nombre de rol: límites, espacios, nombres protegidos y cuerpo estricto', () => {
  for (const nombre of ['', '   ', ' a', 'a ', 'a'.repeat(33), 'ADMIN', 'Propietario', 'moderador', 'integrante']) {
    assert.equal(roleBodySchema.safeParse({ nombre }).success, false, JSON.stringify(nombre));
  }
  for (const nombre of ['a', 'a'.repeat(32), 'Equipo de diseño']) assert.equal(roleBodySchema.safeParse({ nombre }).success, true);
  for (const body of [{}, null, { nombre: 3 }, { nombre: 'Equipo', idComunidad: 2 }, { nombre: 'Equipo', permisos: ['VER'] }, { nombre: 'Equipo', rol: 'ADMIN' }]) {
    assert.equal(roleBodySchema.safeParse(body).success, false);
  }
});

test('IDs de comunidad y rol son enteros positivos de PostgreSQL', () => {
  assert.deepEqual(communityRoleParamsSchema.parse({ id: '1', idRol: '2' }), { id: 1, idRol: 2 });
  for (const idRol of ['0', '-1', '1.5', 'abc', '2147483648', 'INTEGRANTE']) {
    assert.equal(communityRoleParamsSchema.safeParse({ id: '1', idRol }).success, false);
    assert.equal(communityRoleParamsSchema.safeParse({ id: idRol, idRol: '1' }).success, false);
  }
});
