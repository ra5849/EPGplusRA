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
5. **Fecha/hora**: todos los timestamps ISO-8601 con offset (por defecto `+00:00`/Z de mover, el backend devuelve UTC); la UI los muestra en hora local del dispositivo.
6. **heurística de canalizadores**: clasificado por FIXME anterior — los botones están unificados y contiguos en el JSON del cliente, ordenados por `order` del client. Estrategia determinista.
7. **Front separado por días**: los días completan un índice; si falla al cargar `data/epg/<día>.json` se intenta `data/epg.json` (compatibilidad single). Caches el día en memoria (Map); SW hace network-first para datos.
8. **Privacidad heurística de favoritos** list rápido: prefijos del programa (T=Tarifa paga, D=Deportes, C=Cine, ...).
9. **Vistas**: 8 secciones (Ahora, Favoritos, Guía completa, Parrilla, Cine, Deportes, Búsqueda, Ajustes), vista inicial "Ahora", navegación bottom-bar en móvil.
10. **Deploy**: GitHub Actions `.github/workflows/epg.yml` con schedule diario (06:10 UTC) + dispatch + push a `main`. Job `collect` (python 3.12: `python -m collector.main --days 7 --split`, valida metadata.json, unit tests; artefacto `epg-data`) y job `deploy` (descarga datos → `upload-pages-artifact` → `deploy-pages`). Como los datos se generan en CI, `data/` está en `.gitignore`. Requiere en GitHub: Settings → Pages → Source: GitHub Actions.
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
- FASE 8 completa: js/{utils,epg,search,storage}.js puros (sin DOM) con tests `node --test tests/frontend/` (27/27). OJO: PowerShell 5.1 `Set-Content` corrompe UTF-8 sin BOM (mojibake) — no volver a reescribir ficheros JS desde PowerShell.

## ToDo próximio

- [x] FASE 8: js/utils.js, js/epg.js, js/search.js, js/storage.js + tests/frontend/*.test.mjs
- [x] FASE 9: js/api.js + js/state.js
- [x] FASE 10: js/ui.js, js/grid.js, js/app.js
- [x] FASE 11: index.html, styles.css, manifest.json, sw.js
- [x] FASE 12: node --test + e2e Edge + checklist
- [x] FASE 13: `.github/workflows/epg.yml` + `.gitignore` + `requirements.txt` (+fix "Ahora" vacío de madrugada: filtrar por `current || next`)
- [x] FASE 14: README.md + ARCHITECTURE.md
- [x] FASE 14: README.md + ARCHITECTURE.md
- [x] FASE 15: `git init -b main` + commit `2bff0ef` (48 ficheros) → repo público `ra5849/EPGplusRA`, `gh repo create ... --push`; Pages habilitado vía API (`{"build_type":"workflow"}`). Fix CI: el colector necesita `requests` (requirements.txt). Workflow `c2f5a7e`: **collect 504 s (24 217 programas, 135 canales, anónimo) + unit green + deploy Pages OK** en https://ra5849.github.io/EPGplusRA/. Aviso: actions heredadas usan Node.js 20 (deprecado, forzado a 24) — migrar a checkout@v5 etc. cuando estén disponibles.