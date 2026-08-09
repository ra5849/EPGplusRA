import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFavorites, addFavorite, removeFavorite, toggleFavorite,
  getTheme, setTheme, getStartView, setStartView,
} from '../../js/storage.js';

function memoryStore() {
  const m = new Map();
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => m.set(k, v),
  };
}

test('favoritos: vacío por defecto y sin duplicados', () => {
  const store = memoryStore();
  assert.deepEqual(getFavorites(store), []);
  assert.deepEqual(addFavorite(store, 'TVE'), ['TVE']);
  assert.deepEqual(addFavorite(store, 'TVE'), ['TVE']);
});

test('favoritos: añadir, quitar, toggle', () => {
  const store = memoryStore();
  addFavorite(store, 'A3');
  addFavorite(store, 'T5');
  assert.deepEqual(removeFavorite(store, 'A3'), ['T5']);
  assert.deepEqual(toggleFavorite(store, 'T5'), []);
  assert.deepEqual(toggleFavorite(store, 'C4'), ['C4']);
});

test('favoritos: toleran JSON corrupto', () => {
  const store = memoryStore();
  store.set('epg_favs', '{no-es-json');
  assert.deepEqual(getFavorites(store), []);
});

test('tema: oscuro por defecto y valores válidos', () => {
  const store = memoryStore();
  assert.equal(getTheme(store), 'dark');
  setTheme(store, 'light');
  assert.equal(getTheme(store), 'light');
  setTheme(store, 'fucsia');
  assert.equal(getTheme(store), 'light');
});

test('vista inicial: now por defecto', () => {
  const store = memoryStore();
  assert.equal(getStartView(store), 'now');
  setStartView(store, 'parrilla');
  assert.equal(getStartView(store), 'parrilla');
  setStartView(store, 'no-existe');
  assert.equal(getStartView(store), 'parrilla');
});