import test from 'node:test';
import assert from 'node:assert/strict';
import {
  byStart, currentProgram, nextProgram, groupByChannel,
  nowNextByChannel, progress, minutesLeft, minutesUntil,
  programDayKey, programsOfDay, isMovie, isSport, filteredBy, programsInWindow,
} from '../../js/epg.js';

const P = (id, start, end, extra = {}) => ({ id, channel_id: 'TVE', title: `P${id}`, start, end, ...extra });
const NOW = Date.parse('2026-08-08T12:00:00+00:00');

test('currentProgram encuentra el que está en marcha', () => {
  const list = [
    P('a', '2026-08-08T10:00:00+00:00', '2026-08-08T12:00:00+00:00'),
    P('b', '2026-08-08T12:00:00+00:00', '2026-08-08T13:00:00+00:00'),
  ].sort(byStart);
  assert.equal(currentProgram(list, NOW).id, 'b');
});

test('currentProgram devuelve null sin programa', () => {
  const list = [P('a', '2026-08-08T13:00:00+00:00', '2026-08-08T14:00:00+00:00')];
  assert.equal(currentProgram(list, NOW), null);
});

test('nextProgram devuelve el siguiente (inicio >= now)', () => {
  const list = [P('a', '2026-08-08T12:30:00+00:00', '2026-08-08T13:00:00+00:00')];
  assert.equal(nextProgram(list, NOW).id, 'a');
  assert.equal(nextProgram([], NOW), null);
});

test('groupByChannel agrupa y ordena por inicio', () => {
  const map = groupByChannel([
    P('b', '2026-08-08T12:00:00+00:00', '2026-08-08T13:00:00+00:00'),
    P('a', '2026-08-08T10:00:00+00:00', '2026-08-08T11:00:00+00:00'),
  ]);
  assert.deepEqual(map.get('TVE').map((p) => p.id), ['a', 'b']);
});

test('nowNextByChannel combina canales con programas', () => {
  const channels = [{ id: 'TVE', name: 'La 1' }, { id: 'X', name: 'Sin datos' }];
  const programs = [P('a', '2026-08-08T11:00:00+00:00', '2026-08-08T12:30:00+00:00')];
  const rows = nowNextByChannel(channels, programs, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].channel.name, 'La 1');
  assert.equal(rows[0].current.id, 'a');
  assert.equal(rows[0].next, null);
});

test('progress calcula porcentaje', () => {
  const prog = P('a', '2026-08-08T11:00:00+00:00', '2026-08-08T13:00:00+00:00');
  assert.equal(progress(prog, Date.parse('2026-08-08T12:00:00+00:00')), 50);
  assert.equal(progress(prog, Date.parse('2026-08-08T10:00:00+00:00')), 0);
  assert.equal(progress(prog, Date.parse('2026-08-08T14:00:00+00:00')), 100);
});

test('minutesLeft y minutesUntil', () => {
  const cur = P('a', '2026-08-08T11:00:00+00:00', '2026-08-08T12:00:00+00:00');
  assert.equal(minutesLeft(cur, NOW), 0);
  const nxt = P('b', '2026-08-08T12:45:00+00:00', '2026-08-08T13:45:00+00:00');
  assert.equal(minutesUntil(nxt, NOW), 45);
});

test('programDayKey y programsOfDay usan la clave del fichero', () => {
  const p = P('a', '2026-08-08T23:10:00+00:00', '2026-08-09T00:10:00+00:00');
  assert.equal(programDayKey(p), '2026-08-08');
  assert.equal(programsOfDay([p], '2026-08-08').length, 1);
  assert.equal(programsOfDay([p], '2026-08-09').length, 0);
});

test('isMovie detecta películas por category y raw', () => {
  assert.equal(isMovie({ category: 'Cine', category_raw: 'Acción', title: 'X' }), true);
  assert.equal(isMovie({ category: 'Series', category_raw: 'Comedia', title: 'Y' }), true);
  assert.equal(isMovie({ category: 'Noticias', category_raw: 'Informativo', title: 'Noticias' }), false);
  assert.equal(isMovie({ category: 'Documentales', category_raw: 'Documental', title: 'Doc' }), false);
});

test('isSport deportes', () => {
  assert.equal(isSport({ category: 'Deportes', category_raw: 'Programa deportes', title: 'Fútbol' }), true);
  assert.equal(isSport({ category: 'Infantil', category_raw: 'Dibujos animados', title: 'X' }), false);
  assert.equal(isSport({ category: 'Entretenimiento', category_raw: 'Fútbol', title: 'Gol' }), true);
});

test('filteredBy filtra por ventana temporal y ordena', () => {
  const movies = [
    P('m1', '2026-08-08T20:00:00+00:00', '2026-08-08T22:00:00+00:00', { category: 'Cine', category_raw: 'Drama' }),
    P('m2', '2026-08-09T20:00:00+00:00', '2026-08-09T22:00:00+00:00', { category: 'Cine', category_raw: 'Comedia' }),
    P('n', '2026-08-08T21:00:00+00:00', '2026-08-08T22:00:00+00:00', { category: 'Noticias', category_raw: 'Informativo' }),
  ];
  const start = Date.parse('2026-08-07T22:00:00Z'); // medianoche civil 8-ago en Madrid
  const end = start + 86_400_000;
  const r = filteredBy('movie', movies, start, end);
  assert.deepEqual(r.map((x) => x.id), ['m1']);
});

test('programsInWindow recorta por [start, end) y ordena', () => {
  const all = [
    P('a', '2026-08-07T21:00:00+00:00', '2026-08-07T23:00:00+00:00'),
    P('b', '2026-08-07T22:30:00+00:00', '2026-08-08T00:30:00+00:00'),
    P('c', '2026-08-08T21:00:00+00:00', '2026-08-08T23:00:00+00:00'),
  ];
  const start = Date.parse('2026-08-07T22:00:00Z');
  const w = programsInWindow(all, start, start + 86_400_000);
  assert.deepEqual(w.map((x) => x.id), ['b', 'c']);
});