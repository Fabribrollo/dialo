import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canModerateChannel, effectiveChannelPermissions } from '../src/utils/channelPermissions.js';
import { channelAccessSchema } from '../src/validations/channelsValidation.js';

test('roles superiores tienen todos los permisos aplicables incluso en canales privados', () => {
  for (const rol of ['ADMIN', 'PROPIETARIO']) for (const tipo of ['TEXTO', 'VOZ', 'VIDEO']) {
    assert.deepEqual(effectiveChannelPermissions({ tipo, privado: true }, rol, 1),
      tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR', 'TRANSMITIR']);
  }
});
test('membresía requerida, defaults públicos y privados cerrados', () => {
  for (const tipo of ['TEXTO', 'VOZ', 'VIDEO']) {
    for (const rol of ['MODERADOR', 'INTEGRANTE']) {
      assert.deepEqual(effectiveChannelPermissions({ tipo, privado: false }, rol, 1), tipo === 'TEXTO' ? ['VER', 'ESCRIBIR'] : ['VER', 'HABLAR']);
      assert.deepEqual(effectiveChannelPermissions({ tipo, privado: true }, rol, 1), []);
    }
    assert.deepEqual(effectiveChannelPermissions({ tipo, privado: false, habilitacionesUsuario: [{ idUsuario: 1, permisos: ['VER'] }] }, undefined, 1), []);
  }
});
test('union sin denegaciones, implica VER y filtra permisos por tipo sin conceder moderación', () => {
  const canal = { tipo: 'TEXTO', privado: true,
    habilitacionesRol: [{ rol: 'INTEGRANTE', permisos: ['VER'] }, { rol: 'MODERADOR', permisos: ['ESCRIBIR'] }],
    habilitacionesUsuario: [{ idUsuario: 1, permisos: ['ESCRIBIR', 'HABLAR', 'TRANSMITIR'] }, { idUsuario: 2, permisos: ['VER'] }],
  };
  assert.deepEqual(effectiveChannelPermissions(canal, 'INTEGRANTE', 1), ['VER', 'ESCRIBIR']);
  assert.deepEqual(effectiveChannelPermissions(canal, 'INTEGRANTE', 2), ['VER']);
  assert.deepEqual(effectiveChannelPermissions({ ...canal, habilitacionesRol: [] }, 'INTEGRANTE', 1), ['VER', 'ESCRIBIR']);
  assert.deepEqual(effectiveChannelPermissions({ ...canal, tipo: 'VOZ' }, 'INTEGRANTE', 1), ['VER', 'HABLAR', 'TRANSMITIR']);
  assert.equal(canModerateChannel('INTEGRANTE', ['VER', 'ESCRIBIR']), false);
  assert.equal(canModerateChannel('MODERADOR', []), false);
  assert.equal(canModerateChannel('MODERADOR', ['VER']), true);
});
test('schema estricto rechaza privilegios, duplicados, targets ambiguos y exceso de habilitaciones', () => {
  for (const habilitaciones of [
    [{ rol: 'ADMIN', permisos: ['VER'] }], [{ rol: 'PROPIETARIO', permisos: ['VER'] }],
    [{ rol: 'INTEGRANTE', idUsuario: 1, permisos: ['VER'] }], [{ permisos: ['VER'] }],
    [{ idUsuario: 1, permisos: ['VER', 'VER'] }], [{ idUsuario: 1, permisos: ['MODERAR'] }],
    [{ idUsuario: 0, permisos: [] }], [{ idUsuario: '1', permisos: [] }],
    [{ idUsuario: 1, permisos: [] }, { idUsuario: 1, permisos: ['VER'] }],
    [{ rol: 'INTEGRANTE', permisos: [] }, { rol: 'INTEGRANTE', permisos: ['VER'] }],
    Array.from({ length: 51 }, (_, n) => ({ idUsuario: n + 1, permisos: ['VER'] })),
  ]) assert.equal(channelAccessSchema.safeParse({ privado: true, habilitaciones }).success, false);
  assert.equal(channelAccessSchema.safeParse({ privado: true, habilitaciones: [], rol: 'ADMIN' }).success, false);
  assert.equal(channelAccessSchema.safeParse({ privado: true }).success, false);
  assert.equal(channelAccessSchema.safeParse({ privado: true, habilitaciones: [{ idUsuario: 1, permisos: [] }] }).success, true);
});
