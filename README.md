# Mi EPG — Guía de TV de Movistar Plus+ (España)

Aplicación web (PWA) sin dependencias que consulta la programación de
Movistar Plus+ **sin autenticarse** y la muestra como guía de TV:
en directo, parrilla, cine, deportes, búsqueda y favoritos.

- **Colector**: Python 3.10+ (única dep: `requests`), `collector/`
- **Frontend**: vanilla JS ESM, cero dependencias (PWA instalable), `js/`
- **Datos**: generados por el colector y publicados por GitHub Actions en
  GitHub Pages cada día (06:10 UTC). Véase `.github/workflows/epg.yml`.

## Uso rápido

```powershell
# 1) Colectar datos (crea data/channels.json, data/epg/día.json, ...)
python -m collector.main --days 7 --split

# 2) Servir la web
python -m http.server 8080
# abre http://localhost:8080
```

## Tests

```powershell
npm.cmd install            # solo devDependencies (puppeteer-core)
node --test "tests/frontend/*.test.mjs"   # 32 tests unit (lógica pura)
node tests/e2e/smoke.mjs  # 14 checks e2e sobre Edge local
```

## Despliegue (dos workflows)

- **`epg.yml`** — cada día (06:10 UTC = 08:10 Madrid) recopila el EPG completo
  (7 días, ~8 min) y publica Pages; además guarda los datos en la caché de
  GitHub Actions (~10 MB/día).
- **`deploy-fast.yml`** — en cada push que **no** toca el colector despliega
  con los datos de la caché: el sitio queda actualizado en ~1 minuto. Si la
  caché no existe o está obsoleta (>10 h), regenera los datos (camino lento).
- Los datos (`data/*`) no se versionan: los genera el CI.

## Estructura

```
collector/          colector de EPG (Python stdlib)
data/               salida: channels.json, epg/<día>.json, epg-index.json, metadata.json (no versionado)
js/                 frontend (módulos ESM: api, app, epg, grid, search, state, storage, ui, utils)
tests/              frontend (node --test) y e2e (puppeteer-core + Edge)
tools/gen_icons.py  iconos PWA, sin Pillow
index.html, styles.css, manifest.json, sw.js   PWA
.github/workflows/  CI diario → GitHub Pages
```

## Limitaciones y detalle técnico

- La cobertura es de 3 días de historia + N futuros (por defecto 7).
- El EPG se publica particionado por día UTC (`data/epg/YYYY-MM-DD.json`);
  también funciona el modo monofichero `data/epg.json` si el total es <= 1.2 MB.
- La búsqueda indexa el día cargado (día actual); la parrilla permite elegir día.
- Los datos son de fuente pública de Movistar Plus+; revisa su uso con tu operador.

Vé `ARCHITECTURE.md` para el diseño y `PROGRESS.md` para el historial de desarrollo.