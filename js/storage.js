// Almacenamiento local de preferencias (favoritos, tema, vista).
// Puro: recibe un objeto "store" con get/set (localStorage en el navegador,
// objeto en memoria en los tests).

const K_FAV = 'epg_favs';
const K_THEME = 'epg_theme';
const K_VIEW = 'epg_view';

const VALID_THEMES = new Set(['dark', 'light']);
const VALID_VIEWS = new Set(['now', 'favoritos', 'guia', 'parrilla', 'cine', 'deportes', 'buscar', 'ajustes']);

export function readJSON(store, key, fallback) {
  try {
    const raw = store.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(store, key, value) {
  try {
    store.set(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getFavorites(store) {
  const favs = readJSON(store, K_FAV, []);
  return Array.isArray(favs) ? favs.filter((x) => typeof x === 'string') : [];
}

export function addFavorite(store, id) {
  const favs = getFavorites(store);
  if (favs.includes(id)) return favs;
  const next = [...favs, id];
  writeJSON(store, K_FAV, next);
  return next;
}

export function removeFavorite(store, id) {
  const next = getFavorites(store).filter((x) => x !== id);
  writeJSON(store, K_FAV, next);
  return next;
}

export function toggleFavorite(store, id) {
  return getFavorites(store).includes(id) ? removeFavorite(store, id) : addFavorite(store, id);
}

export function getTheme(store) {
  const t = store.get(K_THEME);
  return VALID_THEMES.has(t) ? t : 'dark';
}

export function setTheme(store, theme) {
  if (VALID_THEMES.has(theme)) store.set(K_THEME, theme);
}

export function getStartView(store) {
  const v = store.get(K_VIEW);
  return VALID_VIEWS.has(v) ? v : 'now';
}

export function setStartView(store, view) {
  if (VALID_VIEWS.has(view)) store.set(K_VIEW, view);
}