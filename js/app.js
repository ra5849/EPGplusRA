// Aplicación: arranque, router de vistas, carga de datos y delegación de eventos.

import { fetchChannels, fetchDay, fetchIndex, fetchMetadata } from './api.js';
import { createStore, tick } from './state.js';
import { esc, el, toast, favButton, openModal, closeModal, renderNowView, renderList } from './ui.js';
import { renderGrid, gridRows } from './grid.js';
import { searchPrograms, searchChannels, buildIndexEntry } from './search.js';
import { nowNextByChannel, filteredBy, groupByChannel, programsInWindow } from './epg.js';
import { fmtTimeZ, fmtDayZ, utcDayKey, DAY, madridMidnightMs, madridDayKey, madridToday } from './utils.js';
import {
  getFavorites, toggleFavorite, getTheme, setTheme, getStartView, setStartView,
} from './storage.js';

const VIEWS = ['now', 'favoritos', 'guia', 'parrilla', 'cine', 'deportes', 'buscar', 'ajustes'];
const VIEW_LABEL = {
  now: 'Ahora', favoritos: 'Favoritos', guia: 'Guía', parrilla: 'Parrilla',
  cine: 'Cine', deportes: 'Deportes', buscar: 'Buscar', ajustes: 'Ajustes',
};

const store = createStore({
  channels: [],
  channelMap: new Map(),
  programs: [],
  entries: [],
  day: '',
  dayStart: NaN,
  days: [],
  favorites: [],
  theme: 'dark',
  view: 'now',
  metadata: null,
});

const storage = {
  get: (k) => localStorage.getItem(k),
  set: (k, v) => localStorage.setItem(k, v),
};

let root;
let nav;
let started = false;
let guideFocus = '';

export async function boot() {
  if (started) return;
  started = true;
  root = document.getElementById('app');
  nav = document.getElementById('nav');

  const theme = getTheme(storage);
  document.documentElement.dataset.theme = theme;
  store.set({ theme, favorites: getFavorites(storage) });

  const [channels, days, metadata] = await Promise.all([
    fetchChannels().catch(() => []),
    fetchIndex().catch(() => []),
    fetchMetadata().catch(() => null),
  ]);
  store.set({
    channels,
    channelMap: new Map(channels.map((c) => [c.id, c])),
    days: days ?? [],
    metadata,
  });

  await setDay(madridToday());
  bindNav();
  bindGlobal();
  setView(hashView() ?? getStartView(storage));
  registerSW();
  updateStatus();

  tick(() => {
    if (store.get('view') === 'now') render();
  }, 30_000);
}

function updateStatus() {
  const status = document.getElementById('status');
  if (!status) return;
  const meta = store.get('metadata');
  status.textContent = meta
    ? `Datos: ${fmtDayZ(Date.parse(meta.generated_at))} · ${meta.channels_available ?? '?'} canales`
    : 'Buscando datos…';
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW:', err));
  }
}

// ------------------- datos -------------------

function channel(id) {
  return store.get('channelMap').get(id);
}

function channelName(id) {
  const c = channel(id);
  return c ? c.name : id;
}

async function setDay(key) {
  const start = madridMidnightMs(key);
  const end = start + DAY;
  store.set({ day: key, dayStart: start });
  const f1 = utcDayKey(new Date(start));
  const f2 = utcDayKey(new Date(end - 1));
  const [a, b] = await Promise.all([fetchDay(f1), fetchDay(f2)]);
  const programs = programsInWindow([...(a ?? []), ...(b ?? [])], start, end);
  const entries = programs.map((p) => buildIndexEntry(p, channelName(p.channel_id)));
  store.set({ programs, entries });
}

// ------------------- router -------------------

function hashView() {
  const h = location.hash.replace(/^#\/?/, '');
  return VIEWS.includes(h) ? h : null;
}

function setView(view) {
  store.set({ view: VIEWS.includes(view) ? view : 'now' });
  const v = store.get('view');
  document.title = `${VIEW_LABEL[v]} · Mi EPG`;
  history.replaceState(null, '', `#/${v}`);
  renderNav();
  render();
}

function renderNav() {
  nav.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('on', b.dataset.view === store.get('view'));
  });
}

function render() {
  if (!root) return;
  root.replaceChildren();
  const view = store.get('view');
  switch (view) {
    case 'now': viewNow(); break;
    case 'favoritos': viewFavoritos(); break;
    case 'guia': viewGuia(); break;
    case 'parrilla': viewParrilla(); break;
    case 'cine': viewCine(); break;
    case 'deportes': viewDeportes(); break;
    case 'buscar': viewBuscar(); break;
    case 'ajustes': viewAjustes(); break;
  }
}

// ------------------- vistas -------------------

function viewNow() {
  const { channels, programs, favorites } = store.get();
  const now = Date.now();
  const rows = nowNextByChannel(channels, programs, now).filter((r) => r.current || r.next);
  const favRows = favorites.map((id) => rows.find((r) => r.channel.id === id)).filter(Boolean);
  const rest = rows.filter((r) => !favorites.includes(r.channel.id));
  const ordered = [...favRows, ...rest];

  root.append(el(`<div class="hero"><span class="hero-date">${fmtDayZ(Date.now())}</span></div>`));
  if (ordered.length === 0) {
    root.append(el('<p class="hint">Sin programación en este momento. Revisa la guía.</p>'));
    return;
  }
  renderNowView(root, ordered, { nowMs: now, favorites });
}

function viewFavoritos() {
  const favorites = store.get('favorites');
  if (favorites.length === 0) {
    root.append(el('<p class="hint">Añade canales favoritos tocando su estrella en «Ahora».</p>'));
    return;
  }
  const favCh = favorites.map((id) => channel(id)).filter(Boolean);
  const rows = nowNextByChannel(favCh, store.get('programs'), Date.now());
  renderNowView(root, rows, { nowMs: Date.now(), favorites });
}

function viewGuia() {
  const { channels, programs, favorites } = store.get();
  const byCh = groupByChannel(programs);
  const now = Date.now();
  const wrap = el('<div class="guia"></div>');
  let n = 0;
  for (const ch of channels) {
    const list = (byCh.get(ch.id) ?? []).filter((p) => Date.parse(p.end) > now).slice(0, 10);
    if (!list.length) continue;
    const sec = el(`<section class="ch-guide${guideFocus === ch.id ? ' focused' : ''}" data-guide="${esc(ch.id)}">
      <h3 class="ch-name">${esc(ch.name)} ${favButton(ch.id, favorites.includes(ch.id))}</h3>
      <div class="ch-guide-items"></div>
    </section>`);
    const box = sec.querySelector('.ch-guide-items');
    for (const p of list) {
      box.append(el(`<button class="row-guide" data-open="${esc(p.id)}">
        <span class="time">${fmtTimeZ(Date.parse(p.start))}</span>
        <span class="g-title">${esc(p.title)}</span>
      </button>`));
    }
    wrap.append(sec);
    if (++n >= 40) break;
  }
  root.append(wrap);
  if (guideFocus) {
    requestAnimationFrame(() => {
      wrap.querySelector(`[data-guide="${esc(guideFocus)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function dayChips() {
  const { days } = store.get();
  const today = madridToday();
  const tomorrow = madridDayKey(Date.now() + DAY);
  const keys = days.length
    ? days.map((u) => madridDayKey(Date.parse(`${u}T12:00:00Z`))) // día civil equivalente
    : [...new Set(Array.from({ length: 8 }, (_, i) => madridDayKey(Date.now() + i * DAY)))];
  return keys.map((k) => ({
    k,
    label: k === today ? 'Hoy' : k === tomorrow ? 'Mañana' : k.slice(8),
  }));
}

function viewParrilla() {
  const { channels, programs, day } = store.get();
  const chips = el('<div class="day-picker"></div>');
  for (const { k, label } of dayChips()) {
    const btn = el(`<button class="chip${k === day ? ' on' : ''}">${label}</button>`);
    btn.addEventListener('click', async () => {
      if (k !== store.get('day')) {
        await setDay(k);
        render();
      }
    });
    chips.append(btn);
  }
  const box = el('<div class="grid-wrap"></div>');
  box.append(chips);
  renderGrid(box, gridRows(channels, groupByChannel(programs), {}), { favorites: store.get('favorites') });
  root.append(box);
}

function viewCine() {
  const { programs, day, dayStart } = store.get();
  const list = filteredBy('movie', programs, dayStart, dayStart + DAY);
  root.append(el(`<h2 class="vh">Películas · ${esc(day)}</h2>`));
  scalarList(list);
}

function viewDeportes() {
  const { programs, day, dayStart } = store.get();
  const list = filteredBy('sport', programs, dayStart, dayStart + DAY);
  root.append(el(`<h2 class="vh">Deportes · ${esc(day)}</h2>`));
  scalarList(list);
}

function scalarList(list) {
  if (!list.length) {
    root.append(el(`<p class="hint">Sin programas en este día · ${fmtDayZ(Date.now())}</p>`));
    return;
  }
  const nowMs = Date.now();
  const wrap = el('<div class="list"></div>');
  let autoFocus = -1;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const startMs = Date.parse(p.start);
    const endMs = Date.parse(p.end);
    if (autoFocus < 0 && endMs > nowMs) autoFocus = i;
    const isNow = startMs <= nowMs && nowMs < endMs;
    wrap.append(el(`
      <button class="row-cat${isNow ? ' is-now' : ''}" data-open="${esc(p.id)}">
        <span class="time">${fmtTimeZ(startMs)}</span>
        <span class="c-title">${esc(p.title)}</span>
        ${isNow ? '<span class="badge-now">AHORA</span>' : ''}
        <span class="c-meta">${esc(channelName(p.channel_id))} · ${esc(p.category_raw || p.category || '')}</span>
      </button>`));
  }
  root.append(wrap);
  // Coloca la vista en el programa en antena o el siguiente (hora actual de Madrid).
  requestAnimationFrame(() => {
    const rows = wrap.querySelectorAll('.row-cat');
    const target = rows[autoFocus < 0 ? 0 : autoFocus];
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });
}

function viewBuscar() {
  const wrap = el('<div class="search-view"></div>');
  const input = el('<input class="search-box" type="search" placeholder="Busca título o canal…" autocomplete="off">');
  const results = el('<div class="search-results"></div>');
  wrap.append(input, results);
  root.append(wrap);
  input.focus();

  input.addEventListener('input', () => {
    const q = input.value.trim();
    results.replaceChildren();
    if (!q) return;
    const { entries, channels } = store.get();
    const hits = searchPrograms(entries, q, { limit: 30 });
    const chHits = searchChannels(channels, q, { limit: 6 });
    if (chHits.length) {
      results.append(el('<div class="sec">Canales</div>'));
      for (const c of chHits) {
        results.append(el(`<button class="row-search" data-guide="${esc(c.id)}">
          <span class="g-title">${esc(c.name)}</span><span class="g-id">${esc(c.id)}</span>
        </button>`));
      }
    }
    if (hits.length) {
      results.append(el('<div class="sec">Programas</div>'));
      for (const h of hits) {
        const p = h.prog;
        results.append(el(`<button class="row-search" data-open="${esc(p.id)}">
          <span class="time">${fmtTimeZ(Date.parse(p.start))}</span>
          <span class="g-title">${esc(p.title)}</span>
          <span class="g-id">${esc(channelName(p.channel_id))}</span>
          ${p.subtitle ? `<span class="g-sub">${esc(p.subtitle)}</span>` : ''}
        </button>`));
      }
    }
    if (!hits.length && !chHits.length) results.append(el('<p class="hint">Sin resultados.</p>'));
  });
}

function viewAjustes() {
  const theme = store.get('theme');
  const wrap = el(`<div class="settings">
    <button class="row theme-toggle" type="button">${theme === 'dark' ? '☀ Tema claro' : '☾ Tema oscuro'}</button>
    <label class="row">Vista inicial
      <select>${VIEWS.map((v) => `<option value="${v}" ${v === store.get('view') ? 'selected' : ''}>${VIEW_LABEL[v]}</option>`).join('')}</select>
    </label>
    <p class="muted">${esc(metaInfo())}</p>
  </div>`);
  wrap.querySelector('.theme-toggle').addEventListener('click', () => {
    const next = store.get('theme') === 'dark' ? 'light' : 'dark';
    setTheme(storage, next);
    store.set({ theme: next });
    document.documentElement.dataset.theme = next;
    render();
  });
  wrap.querySelector('select').addEventListener('change', (e) => {
    setStartView(storage, e.target.value);
  });
  root.append(wrap);
}

function metaInfo() {
  const meta = store.get('metadata');
  if (!meta) return 'Datos no disponibles todavía.';
  return `Actualizado ${fmtDayZ(Date.parse(meta.generated_at))} · ${meta.channels_available} canales · ${meta.programs} programas`;
}

// ------------------- eventos -------------------

function bindNav() {
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) setView(b.dataset.view);
  });
}

function bindGlobal() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.id === 'modal') {
      closeModal();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) {
      const prog = store.get('programs').find((p) => p.id === open.dataset.open);
      if (prog) openModal(prog, channelName(prog.channel_id), store.get('favorites').includes(prog.channel_id));
      return;
    }
    const star = e.target.closest('[data-fav]');
    if (star) {
      const id = star.dataset.fav;
      const favs = toggleFavorite(storage, id);
      store.set({ favorites: favs });
      const mFav = document.querySelector('.m-fav');
      if (mFav) mFav.replaceWith(el(favButton(id, favs.includes(id), 'm-fav')));
      toast(favs.includes(id) ? 'Añadido a favoritos' : 'Quitado de favoritos');
      if (['now', 'favoritos', 'guia', 'parrilla', 'cine', 'deportes'].includes(store.get('view'))) render();
      return;
    }
    const guide = e.target.closest('[data-guide]');
    if (guide) {
      guideFocus = guide.dataset.guide;
      setView('guia');
      return;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

boot().catch((err) => {
  console.error(err);
});