import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitStatements} from './sqlStatements.js';
test('una explicación con punto y coma no se ejecuta como SQL',()=>{
 const result=splitStatements('-- Propuesta pendiente; confirmar después.\nCREATE TABLE ejemplo (id INT); -- fin;\nINSERT INTO ejemplo VALUES (1);');
 assert.deepEqual(result,['CREATE TABLE ejemplo (id INT)','INSERT INTO ejemplo VALUES (1)']);
});
test('conserva puntos y coma y comentarios aparentes dentro de literales',()=>{
 assert.deepEqual(splitStatements(`INSERT INTO ejemplo VALUES ('texto; -- /* intacto */', 'l''autor'); SELECT "col;umna";`),[`INSERT INTO ejemplo VALUES ('texto; -- /* intacto */', 'l''autor')`,`SELECT "col;umna"`]);
});
test('un bloque PostgreSQL con sentencias internas es una sola sentencia',()=>{
 const block='DO $cuerpo$ BEGIN PERFORM 1; PERFORM 2; END $cuerpo$';
 assert.deepEqual(splitStatements(block+'; SELECT 3;'),[block,'SELECT 3']);
});
test('ignora comentarios multilínea anidados y rechaza SQL truncado',()=>{
 assert.deepEqual(splitStatements('/* uno; /* dos; */ fin */ SELECT 1;'),['SELECT 1']);
 assert.throws(()=>splitStatements("SELECT 'incompleto"));
});
