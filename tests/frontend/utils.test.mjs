import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokenize, pad2, clamp, fmtDur, fmtTime, relTime, tzOffsetMs, madridMidnightMs, madridDayKey, fmtTimeZ, fmtDayZ, zonedMinutes } from '../../js/utils.js';

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

test('zona horaria España: offsets de verano e invierno', () => {
  assert.equal(tzOffsetMs('Europe/Madrid', Date.parse('2026-08-08T12:00:00Z')), 2 * 3600_000);
  assert.equal(tzOffsetMs('Europe/Madrid', Date.parse('2026-01-15T12:00:00Z')), 3600_000);
});

test('madridMidnightMs: medianoche civil en verano es 22:00Z del día anterior', () => {
  assert.equal(madridMidnightMs('2026-08-08'), Date.parse('2026-08-07T22:00:00Z'));
});

test('madridMidnightMs: medianoche civil en invierno es 23:00Z del día anterior', () => {
  assert.equal(madridMidnightMs('2026-01-15'), Date.parse('2026-01-14T23:00:00Z'));
});

test('madridDayKey: un instante de madrugada UTC pertenece al día civil español siguiente', () => {
  assert.equal(madridDayKey(Date.parse('2026-08-08T23:30:00Z')), '2026-08-09');
});

test('fmtTimeZ/fmtDayZ muestran hora de España, no la del dispositivo', () => {
  const ms = Date.parse('2026-08-08T20:30:00+00:00'); // 22:30 en Madrid
  assert.equal(fmtTimeZ(ms), '22:30');
  assert.equal(fmtDayZ(ms), 'sáb 8 ago');
});

test('zonedMinutes coloca un evento en su minuto del día civil español', () => {
  assert.equal(zonedMinutes('2026-08-08T21:15:00+00:00'), 23 * 60 + 15); // 23:15 Madrid
});