// Helpers de renderizado del DOM (tarjetas de canal, modal, toasts).
// Cálculo puro en epg.js/utils.js; nada aquí modifica estado global.

import { fmtTime, fmtDay } from './utils.js';
import { progress, minutesLeft, minutesUntil } from './epg.js';

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function starSVG(filled, cls) {
  const extra = cls ? ` ${cls}` : '';
  return `<svg class="star${filled ? ' on' : ''}${extra}" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2l2.9 6.26 6.8.8-5 4.7 1.3 6.7L12 17.8 5.9 20.5l1.3-6.7-5-4.7 6.8-.8z" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor"'}/></svg>`;
}

function fmtRange(p) {
  return `${fmtTime(new Date(Date.parse(p.start)))}–${fmtTime(new Date(Date.parse(p.end)))}`;
}

/** Marca-favorito con manejador delegado en [data-fav]. */
export function favButton(id, fav) {
  return `<button class="fav-btn" data-fav="${esc(id)}" title="${fav ? 'Quitar favorito' : 'Añadir favorito'}" aria-pressed="${fav}">${starSVG(fav)}</button>`;
}

/** Tarjeta compacta de un programa (usada en listas y resultados). */
export function progCard(p, channelName, { fav, withChannel } = {}) {
  const time = fmtRange(p);
  return el(`
    <article class="prog-card" data-open="${esc(p.id)}">
      <div class="card-main">
        <div class="card-title">${esc(p.title)}</div>
        <div class="card-meta">
          <span class="dot">${time}</span>
          <span class="dot">${esc(p.category ?? '—')}</span>
          ${withChannel ? `<span class="dot">${esc(channelName)}</span>` : ''}
        </div>
      </div>
      <div class="card-side">${favButton(p.channel_id, fav)}</div>
    </article>`);
}

/** Carpeta de canal en "Ahora": actual + siguiente. */
export function nowBlock(row, nowMs, fav) {
  const cur = row.current && progLive(row.current, nowMs);
  const nxt = row.next && progNext(row.next, nowMs);
  return el(`
    <section class="channel-block" data-channel="${esc(row.channel.id)}">
      <header class="block-head">
        <h3 class="ch-name">${esc(row.channel.name)}</h3>
        <span class="ch-id">${esc(row.channel.id)}</span>
        ${favButton(row.channel.id, fav)}
      </header>
      ${cur || '<p class="muted small">Sin señal ahora</p>'}
      ${nxt ? `<div class="next-strip">${nxt}</div>` : ''}
    </section>`);
}

function progLive(p, nowMs) {
  const pct = progress(p, nowMs);
  const left = minutesLeft(p, nowMs);
  return `
    <div class="prog-live" data-open="${esc(p.id)}">
      <div class="prog-live-head">
        <span class="badge-live">EN DIRECTO</span>
        <span class="prog-time">${fmtRange(p)}</span>
      </div>
      <div class="prog-title">${esc(p.title)}</div>
      <div class="prog-sub">${esc(p.subtitle || p.category_raw || p.category || '')}</div>
      <div class="prog-bar"><i style="width:${pct}%"></i></div>
      <div class="prog-left">quedan ${left} min · ${Math.round((nowMs - Date.parse(p.start)) / 60_000)} min emitidos</div>
    </div>`;
}

function progNext(p, nowMs) {
  const until = minutesUntil(p, nowMs);
  return `
    <div class="prog-next" data-open="${esc(p.id)}">
      <span class="prog-badge">EN ${until} MIN</span>
      <span class="prog-title">${esc(p.title)}</span>
      <span class="prog-time">${fmtRange(p)}</span>
    </div>`;
}

export function renderNowView(container, rows, opts) {
  const { nowMs, favorites } = opts;
  const wrap = el('<div class="now-view"></div>');
  for (const row of rows) {
    const article = nowBlock(row, nowMs, favorites.includes(row.channel.id));
    wrap.append(article);
  }
  container.replaceChildren(wrap);
}

export function renderList(container, items, template) {
  const wrap = el('<div class="list"></div>');
  for (const item of items) wrap.append(el(template(item)));
  container.replaceChildren(wrap);
}

export function renderEmpty(container, msg) {
  container.replaceChildren(el(`<div class="empty">${esc(msg)}</div>`));
}

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('<div class="toast" role="status"></div>');
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Abre el modal de detalle del programa. */
export function openModal(prog, channelName, isFav = false) {
  const m = document.getElementById('modal');
  if (!m) return;
  const s = Date.parse(prog.start);
  const e = Date.parse(prog.end);
  const dur = Math.round((e - s) / 60_000);
  m.querySelector('.m-title').textContent = prog.title;
  const mFav = m.querySelector('.m-fav');
  if (mFav) mFav.replaceWith(el(favButton(prog.channel_id, isFav, 'm-fav')));
  m.querySelector('.m-sub').textContent = prog.subtitle || '';
  m.querySelector('.m-meta').textContent = [
    channelName,
    `${fmtDay(new Date(s))} ${fmtTime(new Date(s))}–${fmtTime(new Date(e))}`,
    `${dur} min`,
    prog.rating,
    prog.category,
  ].filter(Boolean).join(' · ');
  m.querySelector('.m-desc').textContent = prog.description || 'Sin descripción disponible.';
  m.hidden = false;
  document.body.classList.add('modal-open');
}

export function closeModal() {
  const m = document.getElementById('modal');
  if (m) m.hidden = true;
  document.body.classList.remove('modal-open');
}