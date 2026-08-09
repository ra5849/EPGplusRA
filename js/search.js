// Búsqueda pura por texto en el catálogo de programas.
// Construye un índice de tokens por programa y puntúa coincidencias.

import { tokenize } from './utils.js';

const PESO_TITULO = 5;
const PESO_SUBTITULO = 3;
const PESO_DESCRIPCION = 2;
const PESO_CATEGORIA = 1;

/** Precalcula los tokens de un programa (título, subtítulo, descripción, canal). */
export function buildIndexEntry(p, channelName) {
  return {
    prog: p,
    titulo: tokenize(p.title),
    sub: tokenize(p.subtitle),
    desc: tokenize(p.description),
    cat: tokenize(p.category_raw || p.category),
    canal: tokenize(channelName),
  };
}

/** True si algún token de la lista contiene el token de búsqueda (subcadena). */
function match(list, token) {
  // La búsqueda por subcadena evita teclear el término completo.
  return list.some((t) => t.length >= token.length && t.includes(token));
}

/** Devuelve los primeros <limit> programas cuyo texto coincida, con score. */
export function searchPrograms(entries, query, { limit = 50 } = {}) {
  const q = tokenize(query);
  if (q.length === 0) return [];

  const scored = [];
  for (const e of entries) {
    let score = 0;
    for (const token of q) {
      if (match(e.titulo, token)) score += PESO_TITULO;
      if (match(e.sub, token)) score += PESO_SUBTITULO;
      if (match(e.desc, token)) score += PESO_DESCRIPCION;
      if (match(e.cat, token)) score += PESO_CATEGORIA;
      if (match(e.canal, token)) score += 2;
    }
    if (score > 0) scored.push({ score, entry: e });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.prog.start.localeCompare(b.entry.prog.start));
  return scored.slice(0, limit).map((s) => ({ score: s.score, ...s.entry }));
}

/** Búsqueda de canales por nombre/identificador. */
export function searchChannels(channels, query, { limit = 20 } = {}) {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const hits = [];
  for (const c of channels) {
    const name = tokenize(c.name);
    const id = tokenize(c.id);
    let score = 0;
    for (const token of q) {
      if (match(name, token)) score += 3;
      if (match(id, token)) score += 1;
    }
    if (score > 0) hits.push({ score, channel: c });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.channel);
}