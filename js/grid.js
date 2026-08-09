// Parrilla horaria: filas por canal y columna de tiempo.
// Renderiza tarjetas posicionadas por minutos absolutos del día.

import { esc, favButton } from './ui.js';
import { fmtTime } from './utils.js';

export const MIN_PER_DAY = 24 * 60;

/** Ajusta inicio/fin de un programa al rango [dayStart, dayEnd] en minutos. */
export function clip(prog, dayStartMin, dayEndMin) {
  const s = Math.max(dayStartMin, minutesOfDay(prog.start));
  const e = Math.min(dayEndMin, minutesOfDay(prog.end));
  return { s, e, visible: e > s };
}

/** Minutos del día local de un instante ISO. */
export function minutesOfDay(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + Math.round(d.getSeconds() / 60);
}

/**
 * Devuelve filas: [{ channel, blocks: [{prog, leftPct, widthPct, start, end}] }]
 * dayStartMin/dayEndMin en minutos del día local (ej. 360..1800).
 */
export function gridRows(channels, programsByChannel, { dayStartMin = 0, dayEndMin = 24 * 60 } = {}) {
  const span = dayEndMin - dayStartMin || 1;
  const rows = [];
  for (const ch of channels) {
    const progs = (programsByChannel.get(ch.id) ?? []).filter(
      (p) => minutesOfDay(p.end) > dayStartMin && minutesOfDay(p.start) < dayEndMin,
    );
    if (progs.length === 0) continue;
    const blocks = [];
    for (const prog of progs) {
      const { start: s, end: e, visible } = clip(prog, dayStartMin, dayEndMin);
      if (!visible) continue;
      blocks.push({
        prog,
        leftPct: ((s - dayStartMin) / span) * 100,
        widthPct: ((e - s) / span) * 100,
      });
    }
    rows.push({ channel: ch, blocks });
  }
  return rows;
}

export function renderGrid(container, rows, { favorites = [] } = {}) {
  const wrap = el(`<div class="grid"></div>`);
  for (const { channel, blocks } of rows) {
    const row = el(`<div class="grid-row"></div>`);
    const label = el(`<div class="grid-label">${esc(channel.name)} ${favButton(channel.id, favorites.includes(channel.id))}</div>`);
    row.append(label);
    const track = el(`<div class="grid-track"></div>`);
    for (const b of blocks) {
      const card = el(
        `<button class="gprog" data-open="${esc(b.prog.id)}" style="left:${b.leftPct}%;width:${b.widthPct}%">
           <span class="t-title">${esc(b.prog.title)}</span>
           <span class="t-time">${fmtTime(new Date(Date.parse(b.prog.start)))}</span>
         </button>`,
      );
      track.append(card);
    }
    row.append(track);
    wrap.append(row);
  }
  container.replaceChildren(wrap);
}

function hourScale(dayStartMin, dayEndMin) {
  const row = el(`<div class="grid-hours"></div>`);
  for (let m = dayStartMin; m < dayEndMin; m += 60) {
    const h = Math.floor(m / 60);
    const label = el(`<span class="hour" style="left:${((m - dayStartMin) / (dayEndMin - dayStartMin)) * 100}%">${pad2(h)}:00</span>`);
    row.append(label);
  }
  return row;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}