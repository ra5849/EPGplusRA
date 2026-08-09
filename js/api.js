// Capa de datos: carga de channels.json, epg-index.json, metadata.json y
// los ficheros de día (data/epg/<YYYY-MM-DD>.json), con caché en memoria.
// Compatible con modo "single" (data/epg.json) cuando el índice no existe.

const NOT_FOUND = '__not_found__';

export async function loadJSON(url, { signal } = {}) {
  try {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) throw new Error(NOT_FOUND);
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(NOT_FOUND);
  }
}

function resolve(rel) {
  return new URL(rel, location.href).toString();
}

let channels = null;
let index = null;
let metadata = null;
const dayCache = new Map();

export async function fetchChannels() {
  if (!channels) {
    const data = await loadJSON(resolve('data/channels.json'));
    channels = data.channels ?? data;
  }
  return channels;
}

export async function fetchIndex() {
  if (!index) {
    try {
      index = await loadJSON(resolve('data/epg-index.json'));
    } catch {
      index = null;
    }
  }
  return index;
}

export async function fetchMetadata() {
  if (!metadata) {
    try {
      metadata = await loadJSON(resolve('data/metadata.json'));
    } catch {
      metadata = null;
    }
  }
  return metadata;
}

export function isSingleFile() {
  return index === null;
}

/** Devuelve los programas de un día (clave UTC YYYY-MM-DD) o [] si no existen. */
export async function fetchDay(dayKey, { signal } = {}) {
  if (isSingleFile()) {
    let all = dayCache.get('__single__');
    if (!all) {
      all = loadJSON(resolve('data/epg.json'), { signal })
        .then((d) => d.programs ?? [])
        .catch(() => null);
      dayCache.set('__single__', all);
    }
    const programs = await all;
    return programs ? programs.filter((p) => p.start.slice(0, 10) === dayKey) : null;
  }

  let found = dayCache.get(dayKey);
  if (!found) {
    found = loadJSON(resolve(`data/epg/${dayKey}.json`), { signal })
      .then((d) => d.programs ?? [])
      .catch(() => null);
    dayCache.set(dayKey, found);
  }
  return found;
}

export function resetApiCache() {
  channels = null;
  index = null;
  metadata = null;
  dayCache.clear();
}