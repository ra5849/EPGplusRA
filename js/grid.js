// Parrilla horaria estilo sincroguía: fila por canal, escala de horas arriba,
// desplazamiento horizontal (pasado a la izquierda, futuro a la derecha)
// y línea roja vertical en la hora actual.
// Escala fija en píxeles: cada hora de reloj ocupa PX_PER_HOUR píxeles.

import { esc, favButton } from './ui.js';
import { fmtTimeZ, zonedMinutes } from './utils.js';

export const MIN_PER_DAY = 24 * 60;
export const PX_PER_HOUR = 60;
export const PX_PER_MIN = PX_PER_HOUR / 60;
export const PX_PER_DAY = MIN_PER_DAY * PX_PER_MIN; // 1440
export const LABEL_WIDTH = 130;

/** Ajusta inicio/fin de un programa al rango [dayStart, dayEnd] en minutos. */
export function clip(prog, dayStartMin, dayEndMin) {
  const s = Math.max(dayStartMin, minutesOfDay(prog.start));
  const e = Math.min(dayEndMin, minutesOfDay(prog.end));
  return { s, e, visible: e > s };
}

/** Minutos del día civil (madrid fijo) de un instante ISO. */
export function minutesOfDay(iso) {
  return zonedMinutes(iso);
}

/**
 * Devuelve filas: [{ channel, blocks: [{prog, leftPx, widthPx, start, end}] }]
 * dayStartMin/dayEndMin en minutos del día local (ej. 360..1800).
 * La fila de una hora completa ocupa PX_PER_HOUR píxeles.
 */
export function gridRows(channels, programsByChannel, { dayStartMin = 0, dayEndMin = MIN_PER_DAY } = {}) {
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
        leftPx: (s - dayStartMin) * PX_PER_MIN,
        widthPx: (e - s) * PX_PER_MIN,
      });
    }
    rows.push({ channel: ch, blocks });
  }
  return rows;
}

export function renderGrid(container, rows, { favorites = [], nowMs = Date.now() } = {}) {
  const wrap = el(`<div class="grid-wrap"></div>`);
  const scroller = el(
    `<div class="grid-scroller" tabindex="0"><div class="grid-canvas" style="width:${LABEL_WIDTH + PX_PER_DAY}px"></div></div>`,
  );
  const canvas = scroller.firstElementChild;

  const hours = el(`<div class="grid-hours" style="left:${LABEL_WIDTH}px;width:${PX_PER_DAY}px"></div>`);
  for (let m = 0; m < MIN_PER_DAY; m += 60) {
    const label = el(
      `<span class="hour" style="left:${m * PX_PER_MIN}px"><span class="hour-label">${pad2(m / 60)}:00</span></span>`,
    );
    hours.append(label);
  }
  canvas.append(hours);

  for (const { channel, blocks } of rows) {
    const row = el(`<div class="grid-row"></div>`);
    row.append(
      el(
        `<div class="grid-label">${esc(channel.name)} ${favButton(channel.id, favorites.includes(channel.id))}</div>`,
      ),
    );
    const track = el(`<div class="grid-track" style="width:${PX_PER_DAY}px"></div>`);
    for (const b of blocks) {
      track.append(
        el(
          `<button class="gprog" data-open="${esc(b.prog.id)}" style="left:${b.leftPx}px;width:${b.widthPx}px">
             <span class="t-title">${esc(b.prog.title)}</span>
             <span class="t-time">${fmtTimeZ(Date.parse(b.prog.start))}</span>
           </button>`,
        ),
      );
    }
    row.append(track);
    canvas.append(row);
  }

  const nowPx = zonedMinutes(new Date(nowMs).toISOString()) * PX_PER_MIN;
  canvas.append(el(`<div class="now-line" style="left:${LABEL_WIDTH + nowPx}px"></div>`));

  container.replaceChildren(scroller);

  // Empieza la vista justo en la hora actual: la línea roja queda a la izquierda
  // (futuro a la derecha, pasado hacia la izquierda).
  requestAnimationFrame(() => {
    scroller.scrollLeft = Math.max(0, nowPx - PX_PER_HOUR);
  });
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
