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

// --- zona horaria de España (Europe/Madrid) ---

export const TZ_ES = 'Europe/Madrid';
const TZ_CACHE = new Map();

/** Offset UTC (ms) vigente en Europe/Madrid en el instante dado; DST-aware. */
export function tzOffsetMs(tz = TZ_ES, at = Date.now()) {
  const key = `${tz}:${new Date(at).toISOString().slice(0, 13)}`;
  let off = TZ_CACHE.get(key);
  if (off !== undefined) return off;
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName');
    const m = /GMT([+-]\d{2}:\d{2})?/.exec(part ? part.value : '');
    if (!m || !m[1]) off = 0;
    else {
      const neg = m[1][0] === '-' ? -1 : 1;
      const [h, min] = m[1].slice(1).split(':').map(Number);
      off = neg * (h * 3600 + min * 60) * 1000;
    }
  } catch {
    off = 0;
  }
  TZ_CACHE.set(key, off);
  return off;
}

/** Epoch ms de la medianoche civil (Europe/Madrid) del día local YYYY-MM-DD. */
export function madridMidnightMs(localKey) {
  const naive = Date.parse(`${localKey}T00:00:00Z`);
  let ms = naive - tzOffsetMs(TZ_ES, naive);
  const off2 = tzOffsetMs(TZ_ES, ms);
  if (off2 !== tzOffsetMs(TZ_ES, naive)) ms = naive - off2;
  return ms;
}

/** Fecha civil (Europe/Madrid) YYYY-MM-DD de un instante (ms). */
export function madridDayKey(ms, tz = TZ_ES) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(ms);
    const val = (t) => (p.find((x) => x.type === t) || {}).value || '';
    return `${val('year')}-${val('month')}-${val('day')}`;
  } catch {
    return localDayKey(new Date(ms));
  }
}

/** Día civil (Madrid) de hoy, YYYY-MM-DD. */
export function madridToday() {
  return madridDayKey(Date.now());
}