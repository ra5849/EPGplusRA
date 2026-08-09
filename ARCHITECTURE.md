# Arquitectura

## Visión general

```
GitHub Actions (06:10 UTC)            Navegador
+-----------------------------+       +--------------------------+
| collector.main (Python 3.12)|──────▶│ GitHub Pages (PWA estática)|
|  channel/epg discovery      |       │  js/*.js (ESM, sin build) |
|  ↓ data/*.json              |       │  sw.js / manifest.json   |
|  ↓ artifact → deploy-pages  |       │  fetch relativo ./data/…  |
+-----------------------------+       +--------------------------+
```

- El **colector** se ejecuta en CI con el código de este repo y genera
  `channels.json`, `metadata.json`, `epg-index.json` y `data/epg/<día>.json`.
- El **frontend** es una PWA estática: sin servidor propio, sin paso de build.
- Los datos se publican junto a la app; el navegador los lee con fetch relativo.

## Colector (collector/)

Sin framework: cliente HTTP con `requests` (única dependencia) + stdlib. Flujo resumido:

1. `config/channels.json` → IDs de canales (si falta, los descubre con `channels-list`).
2. Sesión OTT: si existe `config/session.json` se reutiliza; si no, explora
   como anónimo (grpc-source / mobile).
3. `epg-range` por canal → programas (intervalos solapados, dedupe canal+hora).
4. Enriquecimiento opcional con ficha (`epg-program`) y catálogo de imágenes.
5. Salida ISO-8601 UTC; `category`/`category_raw`, `rating`, `score`, etc.
6. Partición: si `est_size(programs) > SINGLE_EPG_MAX_BYTES` (1.2 MB) escribe
   `data/epg/<YYYY-MM-DD>.json` + índice; si no, monofichero `data/epg.json`.

## Frontend (js/) — módulos ESM, cero dependencias

| Módulo | Responsabilidad |
|---|---|
| `utils.js` | funciones puras: fechas, normalización, texto |
| `epg.js` | lógica pura: actual/siguiente, progreso, agrupación, cine/deportes |
| `search.js` | índice de tokens (título/subtítulo/descripción/canal) + scoring |
| `storage.js` | localStorage (favoritos, tema, vista inicial) |
| `api.js` | fetch de channels/index/metadata/días con caché en memoria |
| `state.js` | store pub/sub + refresco periódico |
| `ui.js` | render de tarjetas, modal, toasts |
| `grid.js` | parrilla horaria (posición % sobre el día) |
| `app.js` | arranque, router por hash, delegación de eventos |

## Contrato de datos (`data/*.json`)

```json
// channels.json
{ "channels": [ { "id": "TVE", "name": "La 1", "number": 1, ... } ] }

// data/epg/2026-08-08.json  (un fichero por día, clave UTC)
{ "timezone": "Europe/Madrid",
  "programs": [ {
    "id", "channel_id", "title", "subtitle", "description",
    "start", "end", "category", "category_raw", "rating", "image", ...
  } ] }

// epg-index.json
{ "generated_at": "...", "days": ["2026-08-06", ...] }

// metadata.json
{ "generated_at": "...", "status": "ok", "channels_available": 135,
  "programs": 24621, "coverage_from": "...", "coverage_to": "..." }
```

## PWA

- `manifest.json` — instalable; `icons/` generados con `tools/gen_icons.py`
  (zlib/struct, sin Pillow).
- `sw.js` — precache del núcleo y **red-primero** para `data/` (offline con
  los datos ya cacheados).

## Tests

- `tests/frontend/*.test.mjs` → `node --test` sobre módulos puros.
- `tests/e2e/smoke.mjs` → puppeteer-core + Edge instalado (server estático local).

## Despliegue

Workflow `.github/workflows/epg.yml` (diario, 06:10 UTC; ~8 min):

1. **collect** — setup python 3.12 → `python -m collector.main --days 7 --split`;
   valida `metadata.json` (status ok); ejecuta unit tests; guarda los datos
   en la **caché de Actions** (`epg-data-*`); sube artefacto `epg-data`.
2. **deploy** — checkout + descarga de datos → `upload-pages-artifact` (raíz
   con los datos) → `deploy-pages`.

Workflow `.github/workflows/deploy-fast.yml` (push de solo frontend, sin
tocar `collector/`): restaura los datos del día desde la caché y despliega
en ~1 min. Si la caché no existe o tiene >10 h, regenera los datos ahí mismo.

Requisito en el repo: *Settings → Pages → Source: GitHub Actions*.

## Decisiones clave

- Sin framework ni build: la app es un static site versionable.
- Sin credenciales: el público anónimo de la fuente permite EPG sin login.
- Datos versionados aparte (`.gitignore` sobre `data/`) y publicados solo vía CI.
- Partición por días para servir payloads pequeños y cachables.