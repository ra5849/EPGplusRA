# PROGRESS — EPGplusRA (Mi EPG)

Registro de progreso y decisiones. Actualiza este archivo al terminar cada fase.
Fecha de inicio: 2026-08-08. Entorno: Windows 11, Python 3.12 en
`C:\Users\ra5849\AppData\Local\Programs\Python\Python312`, Node v24.19 (instalado vía winget, solo para tests).

## Estado general

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Entendimiento del problema y decisión de stack | DONE |
| 2 | Esqueleto repo + config | DONE |
| 3 | Cliente OTT Movistar Plus+ | DONE |
| 4 | Calidad de datos (categorías, dedupe, campos) | DONE |
| 5 | Persistencia JSON + metadatos | DONE |
| 6 | Colector funcionando con datos reales | DONE |
| 7 | Iconos PWA | DONE |
| 8 | Núcleo JS puro + tests node | DONE (27/27) |
| 9 | api.js + state.js | DONE |
| 10 | ui.js, grid.js, app.js | DONE (imports verificados) |
| 11 | index.html, styles.css, manifest.json, sw.js | DONE |
| 12 | Verificación (tests + checklist local) | DONE — 27/27 unit + 10/10 e2e (Edge) |
| 13 | Datos + GitHub Actions deploy | DONE — `.github/workflows/epg.yml` |
| 14 | Documentación README/ARCHITECTURE | DONE |
| 15 | Commit inicial + push al repo (manual) | DONE — repo `ra5849/EPGplusRA` público; Pages activo |

## Decisiones tomadas (histórico)

1. **Sin SPAs/build** — vanilla JS con módulos ESM, cero dependencias de npm. Node solo para `node --test`.
2. **Artículo 1 "Sin dependencias"**: frontend vanilla JS (ESM) sin npm; iconos PNG con zlib/struct (tools/gen_icons.py). El colector usa `requests` (única dep de terceros, ver `requirements.txt`) + stdlib.
3. **No usar la API de endpoints individuales como fuente de programas** — sí se usan para logs y debug (`--dumps-ott json`).
4. **Maíz de datos**: `data/channels.json`, `data/epg/<YYYY-MM-DD>.json` (particionado por día UTC, modo split), `data/epg-index.json`, `data/metadata.json`. Si el total estimado de programas <= `SINGLE_EPG_MAX_BYTES` (1.2 MB) se escribe `data/epg.json` de un solo archivo (modo single). Decisión: 3 días de historia + 7 días a futuro en cada ejecución del colector de oportunidades; los diarios ocultan ~1.3 MB/día (total ~11 MB), aceptable para GitHub Pages (sin gzip server-side).
5. **Fecha/hora**: timestamps ISO-8601 con offset (backend UTC). La UI trabaja con el **día civil de Madrid (Europe/Madrid)**: el día seleccionado (chips "Hoy/Mañana/DD") es el día español, y `setDay` carga los 2 ficheros UTC que cubren esa ventana civil (medianoche → +24 h). Cine/Deportes/Parrilla filtran por esa ventana con `filteredBy`/`programsInWindow` (utils: `madridMidnightMs`, `madridDayKey`, `tzOffsetMs`).
6. **heurística de canalizadores**: clasificado por FIXME anterior — los botones están unificados y contiguos en el JSON del cliente, ordenados por `order` del client. Estrategia determinista.
7. **Front separado por días**: los días completan un índice; si falla al cargar `data/epg/<día>.json` se intenta `data/epg.json` (compatibilidad single). Caches el día en memoria (Map); SW hace network-first para datos.
8. **Privacidad heurística de favoritos** list rápido: prefijos del programa (T=Tarifa paga, D=Deportes, C=Cine, ...).
9. **Vistas**: 8 secciones (Ahora, Favoritos, Guía completa, Parrilla, Cine, Deportes, Búsqueda, Ajustes), vista inicial "Ahora", navegación bottom-bar en móvil.
10. **Deploy**: dos workflows. `epg.yml`: cron diario 06:10 UTC (+dispatch, +push que toca `collector/**`) recopila el EPG y publica Pages; además guarda los datos en la caché de Actions (`epg-data-*`, ~10 MB/día, límite total 10 GB). `deploy-fast.yml`: en pushes de solo frontend restaura la caché y despliega en ~1 min (`paths-ignore: collector/**, tools/**, requirements.txt, epg.yml`); si la caché es vieja (>10 h) regenera los datos en el propio job. Como los datos se generan en CI, `data/` está en `.gitignore`. Requiere en GitHub: Settings → Pages → Source: GitHub Actions.
11. **Licencia**: pendiente (probable MIT).

## Comandos útiles

```powershell
# Colector (asume sesión almacenada en config/session.json)
$env:Path = "C:\Users\ra5849\AppData\Local\Programs\Python\Python312;" + $env:Path
python -m collector.main --days 7

# Tests (frontend núcleo puro)
$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
node --test tests/frontend/

# Servidor local de desarrollo
python -m http.server 8080 --directory .
```

## Notas técnicas

- Colector responde con éxito: 135 canales, 24621 programas, cobertura 2026-08-06 → 2026-08-15 (7 días), 53 s, JSON split ~10.55 MB.
- Warning aceptado del procesador: `eventos duplicados por (canal, inicio) ignorados: 657` (dedupe por (channel,start)).
- Encoding: el `main.py` reconfigurea stdout a UTF-8 (fix UnicodeEncodeError con `→`).
- `tools/gen_icons.py` genera: icon-192/512, icon-maskable-512, apple-touch-icon, favicon-32 (sin Pillow).
- FASE 8 completa: js/{utils,epg,search,storage}.js puros (sin DOM) con tests `node --test tests/frontend/` (36/36). OJO: PowerShell 5.1 `Set-Content` corrompe UTF-8 sin BOM (mojibake) — no volver a reescribir ficheros JS desde PowerShell.
- Búsqueda: índice por título/subtítulo/descripción/category_raw/canal. Solo el ~6% de programas tienen `description` (la ficha del proveedor casi no funciona anónimo); el 81% tiene `subtitle` (indexado).
- Reloj de la UI: **fijo en Europe/Madrid** (`fmtTimeZ`, `fmtDayZ`, `zonedMinutes`), independiente del reloj del dispositivo. Resultado de canal en buscador → abre la Guía de ese canal (`data-guide`); resultado de programa → modal del evento.

## ToDo pendiente

- [ ] Migrar actions heredadas (Node 20 → 24, checkout@v5) cuando estén disponibles.
- [ ] Licencia (probable MIT).
- [x] FASE 16 (parrilla sincroguía): escala horaria fija 60 px/h, filas por canal, horas sticky, línea roja de la hora actual, scroll horizontal con inicio centrado en la hora actual (commit `53ba55f`, SW v5).
- [x] FASE 17: Cine/Deportes auto-scroll al programa en antena (marca `is-now` + badge AHORA) y botón "Instalar app" (PWA) en Ajustes (commit `8634716`, SW v6).
- [x] FASE 18 (fix bloques apilados `left:0px` en Parrilla): causa raíz = `clip()` devuelve `{s, e, visible}` pero `gridRows` desestructuraba `{start: s, end: e, visible}` → `s/e = undefined` → `leftPx = NaN` → guardas a 0px. Fix: desestructuración `{ s, e, visible }`. Refuerzos: `setDay` precalcula `startMs/endMs` (sin parsear en el render), `utils.js` usa aritmética pura (sin Intl en caliente) con `esUtcOffsetMin` por `longOffset` (el `shortOffset` devuelve `GMT+2` sin minutos y rompía el regex en Edge/Node). Verificado: units 36/36, e2e 25/25 (bloques con posición real `moved=2923/2966`), SW v7.
- [x] FASE 19: subtítulo/episodio visible sin abrir el modal (`progSubtitle` = `T# Ep. #` + `subtitle`, fallback a año, máx. 80 chars) en Guía, Ahora, Cine, Deportes, Favoritos y Búsqueda; estilos `.subtitle`/`.c-sub`. Fix de regresión: faltaba declarar `const sub` en `scalarList` (ReferenceError → la app se quedaba en "Actualizando"). e2e ahora congela el reloj al día central de `data/epg/` (los datos locales caducan y el reloj real puede salirse del rango) y filtra los 404 de datos. SW v8.
- [x] FASE 9: js/api.js + js/state.js
- [x] FASE 10: js/ui.js, js/grid.js, js/app.js
- [x] FASE 11: index.html, styles.css, manifest.json, sw.js
- [x] FASE 12: node --test + e2e Edge + checklist
- [x] FASE 13: `.github/workflows/epg.yml` + `.gitignore` + `requirements.txt` (+fix "Ahora" vacío de madrugada: filtrar por `current || next`)
- [x] FASE 14: README.md + ARCHITECTURE.md
- [x] FASE 14: README.md + ARCHITECTURE.md
- [x] FASE 15: `git init -b main` + commit `2bff0ef` (48 ficheros) → repo público `ra5849/EPGplusRA`, `gh repo create ... --push`; Pages habilitado vía API (`{"build_type":"workflow"}`). Fix CI: el colector necesita `requests` (requirements.txt). Workflow `c2f5a7e`: **collect 504 s (24 217 programas, 135 canales, anónimo) + unit green + deploy Pages OK** en https://ra5849.github.io/EPGplusRA/. Aviso: actions heredadas usan Node.js 20 (deprecado, forzado a 24) — migrar a checkout@v5 etc. cuando estén disponibles.