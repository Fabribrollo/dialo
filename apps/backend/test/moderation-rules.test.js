// F-14: reglas puras de moderación. No usan base de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { protectModerationTarget, normalizeInterpretation, resolveTarget, describeEffects } from '../src/utils/moderationRules.js';
import { effectiveChannelPermissions, mutedPermissions } from '../src/utils/channelPermissions.js';

const rejects = (fn) => assert.throws(fn, (e) => e.status === 403 && e.code === 'INSUFFICIENT_ROLE');

test('jerarquía: nadie actúa sobre sí mismo ni sobre el propietario', () => {
  rejects(() => protectModerationTarget(1, 1, 'PROPIETARIO', 'PROPIETARIO'));
  rejects(() => protectModerationTarget(1, 2, 'ADMIN', 'PROPIETARIO'));
});

test('jerarquía: solo el propietario sobre administradores y solo administración sobre moderadores', () => {
  rejects(() => protectModerationTarget(1, 2, 'ADMIN', 'ADMIN'));
  assert.doesNotThrow(() => protectModerationTarget(1, 2, 'PROPIETARIO', 'ADMIN'));
  rejects(() => protectModerationTarget(1, 2, 'MODERADOR', 'MODERADOR'));
  rejects(() => protectModerationTarget(1, 2, 'INTEGRANTE', 'MODERADOR'));
  assert.doesNotThrow(() => protectModerationTarget(1, 2, 'ADMIN', 'MODERADOR'));
  assert.doesNotThrow(() => protectModerationTarget(1, 2, 'MODERADOR', 'INTEGRANTE'));
  assert.doesNotThrow(() => protectModerationTarget(1, 2, 'INTEGRANTE', 'INTEGRANTE'));
});

test('interpretación: completa valores por defecto y descarta lo que no está en catálogo', () => {
  assert.deepEqual(normalizeInterpretation({ destinatario: ' @ana ', medida: 'SILENCIAR', alcance: 'NINGUNO', duracion: '30_MIN', motivo: 'spam' }),
    { medida: 'SILENCIAR', destinatario: '@ana', motivo: 'spam', alcance: 'AMBOS', duracion: '1_HORA' });
  assert.equal(normalizeInterpretation({ destinatario: 'ana', medida: 'BANEAR', alcance: 'VOZ', duracion: 'toString', motivo: '' }).duracion, 'PERMANENTE');
  assert.equal(normalizeInterpretation({ destinatario: 'ana', medida: 'BANEAR', alcance: 'VOZ', duracion: '5_HORAS', motivo: '' }).alcance, null);
  assert.equal(normalizeInterpretation({ destinatario: 'ana', medida: 'EXPULSAR', duracion: '7_DIAS' }).duracion, 'NO_APLICA');
  assert.equal(normalizeInterpretation({ destinatario: 'ana', medida: 'BORRAR_TODO' }).medida, null);
  assert.equal(normalizeInterpretation(null).medida, null);
  assert.deepEqual(normalizeInterpretation({ destinatario: 'beto', medida: 'QUITAR_SILENCIO', alcance: 'VOZ', duracion: '1_HORA', motivo: '' }),
    { medida: 'QUITAR_SILENCIO', destinatario: 'beto', motivo: null, alcance: null, duracion: 'NO_APLICA' });
  assert.equal(normalizeInterpretation({ destinatario: 'beto', medida: 'DESBANEAR' }).medida, 'DESBANEAR');
});

const members = [
  { usuario: { id: 1, nombreUsuario: 'ana', nombreVisible: 'Ana López' } },
  { usuario: { id: 2, nombreUsuario: 'anabel', nombreVisible: 'Anabel' } },
  { usuario: { id: 3, nombreUsuario: 'jose_p', nombreVisible: 'José Pérez' } },
];

test('destinatario: el @usuario exacto gana; un nombre parcial con varias coincidencias queda ambiguo', () => {
  assert.deepEqual(resolveTarget('@ana', members).map((m) => m.usuario.id), [1]);
  assert.deepEqual(resolveTarget('ANA', members).map((m) => m.usuario.id), [1]);
  assert.deepEqual(resolveTarget('an', members).map((m) => m.usuario.id), [1, 2]);
  assert.deepEqual(resolveTarget('jose perez', members).map((m) => m.usuario.id), [3]);
  assert.deepEqual(resolveTarget('pedro', members), []);
  assert.deepEqual(resolveTarget('', members), []);
});

test('efectos: describen alcance, vencimiento y que solo afecta a la comunidad', () => {
  const texto = describeEffects({ medida: 'SILENCIAR', alcance: 'TEXTO', duracion: '1_HORA' });
  assert.ok(texto.some((e) => e.includes('escribir')));
  assert.ok(!texto.some((e) => e.includes('micrófono')));
  assert.ok(texto.some((e) => e.includes('1 hora')));
  assert.ok(describeEffects({ medida: 'EXPULSAR', duracion: 'NO_APLICA' }).some((e) => e.includes('invitación válida')));
  const ban = describeEffects({ medida: 'BANEAR', duracion: 'PERMANENTE' });
  assert.ok(ban.some((e) => e.includes('hasta que se levante')));
  assert.equal(ban.at(-1), 'Solo afecta a esta comunidad.');
  assert.ok(describeEffects({ medida: 'QUITAR_SILENCIO', duracion: 'NO_APLICA' })[0].includes('escribir y hablar'));
  assert.ok(describeEffects({ medida: 'DESBANEAR', duracion: 'NO_APLICA' }).some((e) => e.includes('no recupera') || e.includes('No recupera')));
});

const canal = (tipo, silencios) => ({ tipo, privado: false, permisosGlobales: tipo === 'TEXTO' ? ['ESCRIBIR'] : ['HABLAR', 'TRANSMITIR'], comunidad: { silencios } });

test('silencio de comunidad: texto quita escribir, voz quita micrófono y transmisión, ambos quita todo', () => {
  const futuro = new Date(Date.now() + 60_000);
  assert.deepEqual(effectiveChannelPermissions(canal('TEXTO', [{ idUsuario: 5, alcance: 'TEXTO', fechaVencimiento: futuro }]), 'INTEGRANTE', 5), ['VER']);
  assert.deepEqual(effectiveChannelPermissions(canal('VOZ', [{ idUsuario: 5, alcance: 'TEXTO', fechaVencimiento: futuro }]), 'INTEGRANTE', 5), ['VER', 'HABLAR', 'CAMARA', 'PANTALLA', 'TRANSMITIR']);
  assert.deepEqual(effectiveChannelPermissions(canal('VOZ', [{ idUsuario: 5, alcance: 'VOZ', fechaVencimiento: null }]), 'INTEGRANTE', 5), ['VER']);
  assert.deepEqual(effectiveChannelPermissions(canal('TEXTO', [{ idUsuario: 5, alcance: 'AMBOS', fechaVencimiento: null }]), 'INTEGRANTE', 5), ['VER']);
});

test('silencio de comunidad: no afecta a otras personas ni sigue después de vencer', () => {
  const pasado = new Date(Date.now() - 1000);
  assert.deepEqual(effectiveChannelPermissions(canal('TEXTO', [{ idUsuario: 6, alcance: 'AMBOS', fechaVencimiento: null }]), 'INTEGRANTE', 5), ['VER', 'ESCRIBIR']);
  assert.deepEqual(effectiveChannelPermissions(canal('TEXTO', [{ idUsuario: 5, alcance: 'AMBOS', fechaVencimiento: pasado }]), 'INTEGRANTE', 5), ['VER', 'ESCRIBIR']);
  assert.deepEqual(mutedPermissions([{ idUsuario: 5, alcance: 'TEXTO', fechaVencimiento: pasado }], 5), []);
});
