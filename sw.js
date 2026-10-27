/* Service worker de Mi EPG: precache de la app y red-primero para los datos. */
const VERSION = 'v9';
const CORE_CACHE = `miegp-core-${VERSION}`;
const DATA_CACHE = `miegp-data-${VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/api.js',
  './js/app.js',
  './js/epg.js',
  './js/grid.js',
  './js/search.js',
  './js/state.js',
  './js/storage.js',
  './js/ui.js',
  './js/utils.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    // addAll aborta TODO el precache si un solo recurso falla (y entonces el SW
    // nuevo nunca se activa). Con allSettled, un fallo no bloquea la actualización.
    caches.open(CORE_CACHE)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CORE_CACHE) && !k.startsWith(DATA_CACHE)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    // Datos: red primero, caché como respaldo (funciona sin conexión)
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(DATA_CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Navegación (el propio index.html): red primero. Con caché primero, un deploy
  // nuevo no llegaba a quien tuviera el shell antiguo cacheado.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CORE_CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Estáticos: caché primero, actualización en segundo plano
  event.respondWith(
    caches.match(event.request).then((hit) => {
      const fallback = fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CORE_CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => hit);
      return hit || fallback;
    }),
  );
});