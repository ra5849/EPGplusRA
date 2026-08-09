"""Configuración global del collector de EPG de Movistar Plus+.

Toda la configuración específica de la fuente está aislada aquí y en
collector/movistar.py. Si Movistar cambia la API, solo hay que retocar
estos dos ficheros.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Rutas del proyecto
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CONFIG_DIR = ROOT / "config"
ENABLED_CHANNELS_PATH = CONFIG_DIR / "enabled_channels.json"
CHANNELS_OUT = DATA_DIR / "channels.json"
EPG_OUT = DATA_DIR / "epg.json"
EPG_DAY_DIR = DATA_DIR / "epg"
EPG_INDEX_OUT = DATA_DIR / "epg-index.json"
METADATA_OUT = DATA_DIR / "metadata.json"

# ---------------------------------------------------------------------------
# Fuente
# ---------------------------------------------------------------------------
SOURCE_NAME = "movistar"
SOURCE_DISPLAY = "Movistar Plus+"
SOURCE_VERSION = "ott/v8"
TIMEZONE = "Europe/Madrid"

# Parámetros de la API OTT (verificados el 2026-08-08 contra el servicio real).
# El valor de `demarcation` ha cambiado históricamente (15 -> 18).
OTT_BASE = "https://ottcache.dof6.com/movistarplus/webplayer/OTT"
DEMARCATION = "18"
API_VERSION = "8"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-ES,es;q=0.9",
    "Referer": "https://www.movistarplus.es/programacion-tv",
}

# ---------------------------------------------------------------------------
# Descarga
# ---------------------------------------------------------------------------
DEFAULT_DAYS_PAST = 1   # días hacia atrás (programación ya emitida que se conserva)
DEFAULT_DAYS_FUTURE = 7  # días hacia delante (la API ofrece datos fiables ~+7)
MAX_DAYS_FUTURE = 14    # límite duro (más allá la API devuelve listas vacías)
CONCURRENCY = 4         # peticiones simultáneas (2-5 recomendado)
TIMEOUT = 30            # segundos por petición
RETRIES = 3             # reintentos ante timeouts / 429 / 5xx
BACKOFF_BASE = 2.0      # segundos, exponencial

# Enriquecimiento vía ficha del proveedor
FETCH_DETAILS = True
MAX_DETAILS_PER_RUN = 1500  # llamadas línea (la caché por ShowId reduce el coste real)

# ---------------------------------------------------------------------------
# Umbrales de validación anti-corrupción (configurables)
# ---------------------------------------------------------------------------
MIN_CHANNELS = 50
MIN_PROGRAMS = 2000
MIN_CURRENT_PROGRAMS = 20      # programas "ahora mismo" esperados
MIN_COVERAGE_HOURS = 24        # cobertura mínima desde "ayer" hacia delante
MAX_PROGRAM_DAYS = 5           # antigüedad máxima de un programa conservado
COVERAGE_LOOKAHEAD_HOURS = 36  # para el test de cobertura futura

# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------
COLLECTOR_VERSION = "1.0.0"
# Si el EPG único supera este tamaño, se particiona por día
SINGLE_EPG_MAX_BYTES = 1_200_000
# Hora UTC en la que se hace la sincronización "profunda" (+7 días)
DEEP_SYNC_UTC_HOUR = 6


def get_enabled_channels(path: Path | None = None) -> list[str]:
    """Lee config/enabled_channels.json y devuelve los ids habilitados.

    First run: si no existe, no impone lista (collector decide desde canales).
    """
    p = path or ENABLED_CHANNELS_PATH
    if not p.exists():
        return []
    import json

    try:
        raw = json.loads(p.read_text("utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    enabled = raw.get("enabled", [])
    return [str(x) for x in enabled] if isinstance(enabled, list) else []