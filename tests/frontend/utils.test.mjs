import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokenize, pad2, clamp, fmtDur, fmtTime, relTime } from '../../js/utils.js';

test('normalize quita acentos y pasa a minúsculas', () => {
  assert.equal(normalize('Película de Acción'), 'pelicula de accion');
  assert.equal(normalize('Lluvia de aún'), 'lluvia de aun');
});

test('tokenize devuelve términos limpios', () => {
  assert.deepEqual(tokenize('El Gran Combo'), ['el', 'gran', 'combo']);
  assert.deepEqual(tokenize('Café'), ['cafe']);
  assert.deepEqual(tokenize(''), []);
});

test('clamp acota el valor', () => {
  assert.equal(clamp(120, 0, 100), 100);
  assert.equal(clamp(-3, 0, 100), 0);
  assert.equal(clamp(42, 0, 100), 42);
});

test('fmtDur redondea correctamente', () => {
  assert.equal(fmtDur(30 * 60_000), '30 min');
  assert.equal(fmtDur(60 * 60_000), '1 h');
  assert.equal(fmtDur(90 * 60_000), '1 h 30 min');
});

test('fmtTime formato HH:MM', () => {
  assert.equal(fmtTime(new Date(2026, 7, 8, 9, 5)), '09:05');
  assert.equal(fmtTime(new Date(2026, 7, 8, 23, 59)), '23:59');
});

test('relTime funcionamiento básico', () => {
  const now = Date.parse('2026-08-08T12:00:00+00:00');
  assert.match(relTime(now - 5 * 60_000, now), /hace/);
  assert.match(relTime(now + 15 * 60_000, now), /en/);
});