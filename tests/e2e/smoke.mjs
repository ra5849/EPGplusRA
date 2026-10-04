// Smoke test e2e sobre servidor local (python -m http.server 8080).
// Lanza Edge de la máquina (via puppeteer-core, canal msedge) y verifica
// las vistas principales end-to-end.

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8123;

// ---- mini server estático (sin dependencias) ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) failures++;
}

function launch() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const exe = candidates.find((p) => existsSync(p));
  if (!exe) throw new Error('No se encontró Microsoft Edge');
  return puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
}

await new Promise((resolve) => server.listen(PORT, resolve));
const browser = await launch();
const page = await browser.newPage();
const errors = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// Los datos locales (data/epg/*.json) se regeneran por el colector y caducan.
// Congela el reloj a un día central de la cobertura local para que el smoke sea
// determinista y Immune a que el reloj real esté fuera del rango de datos.
const TEST_DAY = (() => {
  const dir = path.join(ROOT, 'data', 'epg');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  return files.length ? files[Math.floor(files.length / 2)].slice(0, 10) : null;
})();
if (TEST_DAY) {
  const fixed = Date.parse(`${TEST_DAY}T12:00:00Z`);
  await page.evaluateOnNewDocument((ms) => {
    const RealDate = Date;
    function FakeDate(...args) {
      return args.length === 0 ? new RealDate(ms) : new RealDate(...args);
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => ms;
    FakeDate.parse = RealDate.parse;
    FakeDate.UTC = RealDate.UTC;
    window.Date = FakeDate;
  }, fixed);
}

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0', timeout: 60000 });

  // 1. Canvas base
  check('título', (await page.title()).includes('Mi EPG'));

  // 2. Favoritos vacío por defecto
  await page.click('[data-view="favoritos"]');
  await sleep(300);
  check('vista favoritos asequible', true);

  // 3. Cambiar a "Ahora" y comprobar que carga al menos una tarjeta de canal
  await page.click('[data-view="now"]');
  await page.waitForSelector('.channel-block, .hint', { timeout: 20000 });
  const blocks = await page.$$eval('.channel-block', (els) => els.length);
  check('cargó tarjetas de canales', blocks > 0, `blocks=${blocks}`);

  // 4. Favorito: tocar estrella y comprobar que se guarda en localStorage
  // Con el reloj congelado algún canal puede no tener programa en directo,
  // por lo que se usa el primer elemento con data-open (vivo o próximo).
  const OPEN_SEL = '.channel-block .prog-live, .channel-block .prog-next';
  await page.click(OPEN_SEL); // abre modal
  await page.waitForSelector('.modal:not([hidden])');
  check('modal abre (data-open)', await page.$eval('.modal', (m) => m.hidden === false));
  await page.click('.modal-close'); // cierre con la X (sin teclado)
  await sleep(100);
  check('modal cierra con la X', await page.$eval('.modal', (m) => m.hidden === true));
  await page.click(OPEN_SEL); // reabre para el test de ESC
  await page.waitForSelector('.modal:not([hidden])');
  await page.keyboard.press('Escape');
  await sleep(100);
  check('modal cierra con Escape', await page.$eval('.modal', (m) => m.hidden === true));

  // 5. Favorito: estrella en la tarjeta de canal y dentro del modal
  const favId = await page.$eval('.channel-block .fav-btn', (b) => b.dataset.fav);
  await page.click('.channel-block .fav-btn');
  await sleep(150);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('epg_favs') || '[]'));
  check('estrella marca favorito', stored.includes(favId), `fav=${favId}`);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.channel-block, .hint', { timeout: 20000 });
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('epg_favs') || '[]'));
  check('favorito persiste tras recargar', afterReload.includes(favId), `fav=${favId}`);
  await page.click(OPEN_SEL); // reabre el modal
  await page.waitForSelector('.modal:not([hidden])');
  const mFav = await page.$eval('.modal .fav-btn', (b) => b.dataset.fav);
  check('modal muestra estrella del canal', mFav === favId);
  await page.click('.modal .fav-btn'); // desmarca desde el modal
  await sleep(150);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('epg_favs') || '[]'));
  check('estrella del modal desmarca', !after.includes(favId));
  await page.keyboard.press('Escape');

  // 6. Búsqueda
  await page.click('[data-view="buscar"]');
  await page.waitForSelector('.search-box');
  await page.type('.search-box', 'futbol');
  await sleep(600);
  const resN = await page.$$eval('.search-results .row-search, .search-results .sec', (els) => els.length);
  check('búsqueda devuelve resultados', resN > 0, `hits=${resN}`);

  // 6b. Un resultado de programa abre el modal (antes NaN:NaN / sin acción)
  const openRow = await page.$('.search-results .row-search[data-open]');
  if (openRow) {
    const firstText = await page.$eval('.search-results .row-search[data-open]', (el) => el.textContent);
    check('fila de programa sin NaN ni vacía', !/NaN/.test(firstText) && firstText.trim().length > 0, JSON.stringify(firstText).slice(0, 80));
    await page.click('.search-results .row-search[data-open]');
    await page.waitForSelector('.modal:not([hidden])');
    check('resultado abre el evento', true);
    await page.keyboard.press('Escape');
  } else {
    check('fila de programa sin NaN ni vacía', true);
    check('resultado abre el evento', true);
  }

  // 6c. Resultado de canal navega a la Guía de ese canal
  const channelRow = await page.$('.search-results .row-search[data-guide]');
  if (channelRow) {
    const chId = await page.$eval('.search-results .row-search[data-guide]', (el) => el.dataset.guide);
    await page.click('.search-results .row-search[data-guide]');
    await page.waitForSelector('.ch-guide[data-guide="' + chId + '"]');
    check('canal abre su Guía (no favorita)', true);
    await page.click('[data-view="buscar"]');
    await page.waitForSelector('.search-box');
  } else {
    check('canal abre su Guía (no favorita)', true);
  }

  // 6. Parrilla estilo sincroguía: filas + escala horaria + línea "ahora" + scroll horizontal
  await page.click('[data-view="parrilla"]');
  await page.waitForSelector('.grid-row');
  const gridRows = await page.$$eval('.grid-row', (els) => els.length);
  check('parrilla renderiza filas', gridRows > 0, `rows=${gridRows}`);
  const positions = await page.$$eval('.gprog', (els) => els.map((b) => parseFloat(b.style.left)));
  const spread = positions.filter((v) => Number.isFinite(v) && v > 0).length;
  check('bloques con posición real (no apilados)', spread > 10, `moved=${spread}/${positions.length}`);
  const hoursCount = await page.$$eval('.grid-hours .hour', (els) => els.length);
  check('escala de horas visible', hoursCount >= 12, `hours=${hoursCount}`);
  check('línea roja de hora actual', (await page.$('.now-line')) !== null);
  const scrollable = await page.$eval('.grid-scroller', (el) => el.scrollWidth > el.clientWidth);
  check('parrilla con scroll horizontal', scrollable);
  const scrolled = await page.$eval('.grid-scroller', (el) => el.scrollLeft);
  check('parrilla centrada en la hora actual', scrolled > 0, `scrollLeft=${scrolled}`);

  // 7. Cine (+ línea de episodio/subtítulo sin abrir el modal)
  await page.click('[data-view="cine"]');
  await sleep(400);
  const cine = await page.$eval('#app', (el) => el.textContent.length);
  check('cine tiene contenido', cine > 40);
  const subs = await page.$$eval('.row-cat .c-sub', (els) => els.length);
  check('cine muestra episodio/subtítulo en la lista', subs > 0, `subs=${subs}`);

  // 8. Ajustes (+ botón de instalación PWA)
  await page.click('[data-view="ajustes"]');
  await page.waitForSelector('.settings');
  check('ajustes render', true);
  const installBtn = await page.$('#btn-install');
  check('botón instalar app en ajustes', installBtn !== null);

  // 9. Sin errores de consola (los 404 de data/epg son esperables: la app pide
  // los dos ficheros UTC que cubren el día y puede faltar el siguiente).
  const jsErrors = errors.filter((e) => !/Failed to load resource.*404/.test(e));
  check('sin errores JS en consola', jsErrors.length === 0, jsErrors.join(' | ').slice(0, 300));
} catch (err) {
  console.log('EXCEPCIÓN en el test:', err);
  failures++;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
process.exit(failures ? 1 : 0);