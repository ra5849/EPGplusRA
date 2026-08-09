// Lógica pura de EPG: programa actual/siguiente, agrupación por canal,
// progreso y clasificación de películas/deportes.
// El tiempo se pasa siempre como número (ms) → testable con node --test.

import { clamp } from './utils.js';

/** Comparador de programas por hora de inicio. */
export function byStart(a, b) {
  return a.start.localeCompare(b.start);
}

/** Programa en marcha en el instante nowMs (o null). Espera lista ordenada. */
export function currentProgram(list, nowMs) {
  for (const p of list) {
    const s = Date.parse(p.start);
    const e = Date.parse(p.end);
    if (s <= nowMs && nowMs < e) return p;
    if (s > nowMs) return null; // lista ordenada
  }
  return null;
}

/** Próximo programa con inicio >= nowMs (o null). */
export function nextProgram(list, nowMs) {
  for (const p of list) {
    if (Date.parse(p.start) >= nowMs) return p;
  }
  return null;
}

/** Agrupa por channel_id y ordena cada fila. Devuelve un Map. */
export function groupByChannel(programs) {
  const map = new Map();
  for (const p of programs) {
    const arr = map.get(p.channel_id);
    if (arr) arr.push(p);
    else map.set(p.channel_id, [p]);
  }
  for (const arr of map.values()) arr.sort(byStart);
  return map;
}

/** Para cada canal: {channel, current, next} en el instante nowMs. */
export function nowNextByChannel(channels, programs, nowMs) {
  const byCh = groupByChannel(programs);
  return channels
    .map((c) => {
      const list = byCh.get(c.id);
      if (!list || list.length === 0) return null;
      return { channel: c, current: currentProgram(list, nowMs), next: nextProgram(list, nowMs) };
    })
    .filter(Boolean);
}

/** Porcentaje de progreso 0..100 del programa actual. */
export function progress(cur, nowMs) {
  const s = Date.parse(cur.start);
  const e = Date.parse(cur.end);
  if (e <= s) return 0;
  return clamp(Math.round(((nowMs - s) / (e - s)) * 100), 0, 100);
}

/** Minutos que faltan para terminar el actual. */
export function minutesLeft(cur, nowMs) {
  return Math.max(0, Math.ceil((Date.parse(cur.end) - nowMs) / 60_000));
}

/** Minutos hasta que empiece el siguiente. */
export function minutesUntil(prog, nowMs) {
  return Math.max(0, Math.ceil((Date.parse(prog.start) - nowMs) / 60_000));
}

/** Clave del día (UTC) del fichero al que pertenece un programa. */
export function programDayKey(prog) {
  return prog.start.slice(0, 10);
}

/** Programa visibles en el día de fichero indicado. */
export function programsOfDay(programs, dayKey) {
  return programs.filter((p) => programDayKey(p) === dayKey);
}

// --- Clasificación de contenido ---

const CAT_PELICULA = new Set(['cine', 'película', 'pelicula', 'largometraje', 'cine tv', 'cine familiar', 'cortometraje']);
const RAW_PELICULA = [
  'acción', 'aventuras', 'bélico', 'belico', 'comedia', 'thriller', 'terror', 'oeste',
  'ciencia ficción', 'ciencia ficcion', 'drama', 'policíaca', 'policiaca',
  'comedia romántica', 'comedia romantica', 'documental cine', 'cine musical',
  'comedia dramática', 'comedia dramatica', 'biopic', 'cine tv acción', 'cine tv thriller',
  'cine tv drama', 'cine familiar', 'fantástico', 'fantastico', 'drama romántico',
  'drama romantico', 'corto de comedia', 'corto animación', 'corto drama', 'animación', 'animacion',
];
const RAW_DEPORTES = new Set([
  'fútbol', 'futbol', 'tenis', 'baloncesto', 'fórmula 1', 'formula 1', 'motociclismo',
  'ciclismo', 'golf', 'pádel', 'padel', 'rugby', 'hípica', 'hipica', 'béisbol', 'beisbol',
  'natación', 'natacion', 'atletismo', 'esgrima', 'escalada deportiva', 'automovilismo',
  'artes marciales', 'boxeo', 'motor', 'deporte', 'deportes', 'vela', 'esquí', 'esqui',
  'snooker', 'balonmano', 'voleibol', 'fórmula e', 'tenis', 'tour',
]);
const DOC = new Set(['documental', 'documentales', 'documental cine', 'docureality']);

export function isMovie(p) {
  const cat = (p.category ?? '').toLowerCase().trim();
  const raw = (p.category_raw ?? '').toLowerCase().trim();
  const title = (p.title ?? '').toLowerCase();
  if (CAT_PELICULA.has(cat)) return true;
  if (RAW_PELICULA.includes(raw)) return true;
  if (/(película|pelicula)/.test(title) && !DOC.has(cat)) return true;
  return false;
}

export function isSport(p) {
  const cat = (p.category ?? '').toLowerCase().trim();
  const raw = (p.category_raw ?? '').toLowerCase().trim();
  if (cat === 'deportes') return true;
  return RAW_DEPORTES.has(raw) || cat.includes('deporte');
}

/** Películas o deportes dentro de una ventana [startMs, endMs), por inicio. */
export function filteredBy(kind, programs, startMs, endMs) {
  const fn = kind === 'movie' ? isMovie : isSport;
  const s = Date.parse;
  return programs
    .filter((p) => {
      const t = s(p.start);
      return t >= startMs && t < endMs && fn(p);
    })
    .sort(byStart);
}

/** Programas cuyo inicio cae en [startMs, endMs), ordenados. */
export function programsInWindow(programs, startMs, endMs) {
  return programs
    .filter((p) => {
      const t = Date.parse(p.start);
      return t >= startMs && t < endMs;
    })
    .sort(byStart);
}