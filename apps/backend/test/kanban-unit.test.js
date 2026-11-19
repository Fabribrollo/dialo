import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from '../src/utils/rateLimit.js';
import { connectPresence, disconnectPresence, isOnline } from '../src/utils/presence.js';
import { updateMeSchema } from '../src/validations/usersValidation.js';
test('cuotas exponen espera y separan usuarios',()=>{
  const consume=createRateLimiter({max:2,windowMs:10000});
  assert.equal(consume('a'),true);assert.equal(consume('a'),true);assert.equal(consume('a'),false);
  assert.ok(consume.retryAfter('a')>0);assert.ok(consume.retryAfter('a')<=10);
  assert.equal(consume('b'),true);
});
test('las pestañas comparten presencia y un cierre repetido no publica cambios',()=>{
  assert.equal(connectPresence(1000,'a'),true);assert.equal(connectPresence(1000,'b'),false);
  assert.equal(disconnectPresence(1000,'a'),false);assert.equal(isOnline(1000),true);
  assert.equal(disconnectPresence(1000,'b'),true);assert.equal(disconnectPresence(1000,'b'),false);
});
test('perfil acepta solo colores de la paleta y los límites editables',()=>{
  assert.equal(updateMeSchema.safeParse({nombreVisible:' Ana ',informacionPersonal:'x'.repeat(190),colorAvatar:'#156B64'}).success,true);
  for(const body of [{nombreVisible:'a'},{nombreVisible:'a'.repeat(41)},{informacionPersonal:'x'.repeat(191)},{colorAvatar:'#000000'}])assert.equal(updateMeSchema.safeParse(body).success,false);
});
