import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndexEntry, searchPrograms, searchChannels } from '../../js/search.js';

const ENTRY = (p, channelName) => buildIndexEntry(p, channelName);
const P = (id, title, subtitle, description) => ({ id, channel_id: 'c', title, subtitle, description, start: '2026-08-08T20:00:00+00:00', end: '2026-08-08T22:00:00+00:00' });

test('searchPrograms encuentra por título', () => {
  const entries = [ENTRY(P('1', 'El Padrino', '', 'Descripción de la familia'), 'CINEMANIA')];
  const hits = searchPrograms(entries, 'padrino');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].prog.id, '1');
});

test('searchPrograms puntúa mejor el título que la descripción', () => {
  const entries = [
    ENTRY(P('2', 'Coches Diarios', '', 'recetas de cocina'), 'GASTRONOMIA'),
    ENTRY(P('3', 'Misión Salvaje', '', 'documental sobre cocina tradicional'), 'DOCU'),
  ];
  const hits = searchPrograms(entries, 'cocina');
  assert.equal(hits[0].prog.id, '2');
});

test('searchPrograms encuentra por canal', () => {
  const entries = [ENTRY(P('1', 'La Otra', '', ''), 'DAZN Fútbol')];
  const hits = searchPrograms(entries, 'dazn');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].prog.id, '1');
});

test('searchPrograms con consulta vacía no devuelve nada', () => {
  assert.deepEqual(searchPrograms([ENTRY(P('1', 'X', '', ''), '')], '   '), []);
});

test('searchPrograms encuentra por descripción', () => {
  const entries = [ENTRY(P('1', 'El Padrino', '', 'Crónica de mafia siciliana'), 'CINEMANIA')];
  const hits = searchPrograms(entries, 'mafia');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].prog.id, '1');
});

test('searchPrograms encuentra por category_raw', () => {
  const p = P('1', 'Título Neutro', '', '');
  p.category_raw = 'Documental de naturaleza';
  const entries = [ENTRY(p, '')];
  const hits = searchPrograms(entries, 'naturaleza');
  assert.equal(hits.length, 1);
});

test('searchChannels busca por nombre o id', () => {
  const channels = [
    { id: 'DAZN1', name: 'DAZN 1' },
    { id: 'TVE', name: 'La 1' },
    { id: 'T5', name: 'Telecinco' },
  ];
  assert.deepEqual(searchChannels(channels, 'dazn').map((c) => c.id), ['DAZN1']);
  assert.deepEqual(searchChannels(channels, 'tele').map((c) => c.id), ['T5']);
});