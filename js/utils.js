// utilidades puras (sin DOM ni fetch)
// Todas las funciones reciben/retornan valores nativos; testables con node --test.

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Parsea un ISO con offset (ej. 2026-08-08T10:30:00+00:00) a Date. */
export function parseISO(s) {
  return new Date(s);
}

/** Convierte un Date a fecha local YYYY-MM-DD. */
export function localDayKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Convierte un Date a fecha UTC YYYY-MM-DD (mismo formato que los días de data/epg). */
export function utcDayKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Clave de día (hora local) de un instante expresado como número o ISO. */
export function dayKeyOf(value) {
  const d = value instanceof Date ? new Date(value) : new Date(value);
  return d instanceof Date ? localDayKey(d) : '';
}

/** Reloj local HH:MM de una Date. */
export function fmtTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Duración legible HH:MM (formato corto). */
export function fmtDur(ms) {
  const totalMin = Math.round(ms / MIN);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Día corto en español para una Date (ej. "vie 8 ago"). */
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fmtDay(d) {
  return `${DIA_CORTO[d.getDay()]} ${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
}

/** Normaliza texto: minúsculas + sin acentos + espacios simples. */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokeniza texto normalizado en términos únicos. */
export function tokenize(s) {
  const t = normalize(s);
  return t ? t.split(' ') : [];
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Porcentaje 0..100 de progreso dentro del intervalo [start, end]. */
export function pct(startMs, endMs, nowMs) {
  if (endMs <= startMs) return 100;
  return clamp(Math.round(((nowMs - startMs) / (endMs - startMs)) * 100), 0, 100);
}

/** Texto relativo corto: "hace 15 min", "en 2 h". */
export function relTime(fromMs, nowMs) {
  const diff = fromMs - nowMs;
  const abs = Math.abs(diff);
  const min = Math.round(abs / MIN);
  const parte = min < 1 ? 'ahora' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return diff <= 0 ? `hace ${min < 1 ? 'un momento' : parte}` : `en ${upperFirst(parte)}`;
}

/** Ordena segundos un nombre propio. */
export function titleCase(s) {
  return String(s ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function upperFirst(s) {
  const str = String(s ?? '');
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}