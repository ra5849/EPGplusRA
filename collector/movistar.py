"""Capa de acceso a la API OTT de Movistar Plus+.

Esta es la única parte que conoce la fuente. El resto del collector trabaja
con la interfaz `EpgSource` definida abajo, así que si Movistar cambia su API
solo hay que modificar este fichero.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from typing import Any

import requests

from . import config

log = logging.getLogger("movistar")


class EpgSource:
    """Interfaz mínima de una fuente de EPG."""

    name = "base"

    def discover_channels(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def fetch_day(self, channel_id: str, day: date) -> list[dict[str, Any]]:
        raise NotImplementedError

    def fetch_details(self, details_url: str) -> dict[str, Any] | None:
        raise NotImplementedError


class MovistarSource(EpgSource):
    """Implementación real para Movistar Plus+ (API OTT pública)."""

    name = config.SOURCE_NAME

    def __init__(
        self,
        concurrency: int = config.CONCURRENCY,
        timeout: int = config.TIMEOUT,
        retries: int = config.RETRIES,
    ) -> None:
        self.concurrency = concurrency
        self.timeout = timeout
        self.retries = retries
        self.session = requests.Session()
        self.session.headers.update(config.HEADERS)

    # ------------------------------------------------------------------ HTTP
    def _get(self, url: str, params: dict | None = None, headers: dict | None = None):
        """GET con reintentos exponenciales (timeouts, 429, 5xx)."""
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                r = self.session.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=self.timeout,
                )
                if r.status_code == 200:
                    return r
                if r.status_code in (429, 500, 502, 503, 504) or r.status_code >= 500:
                    raise requests.HTTPError(f"status {r.status_code} {url}")
                # 4xx que no es 429: no reintentar, no es recuperable
                raise requests.HTTPError(f"status {r.status_code} {url}")
            except (requests.RequestException, OSError) as exc:
                last_err = exc
                backoff = config.BACKOFF_BASE * (2 ** attempt)
                log.warning("intento %d fallido para %s: %s (backoff %.1fs)",
                            attempt + 1, url, exc, backoff)
                if attempt < self.retries:
                    time.sleep(backoff)
        raise last_err or RuntimeError(f"sin respuesta para {url}")

    # ------------------------------------------------------------ canales
    def discover_channels(self) -> list[dict[str, Any]]:
        """http GET /contents/channels -> lista de canales crudos."""
        url = f"{config.OTT_BASE}/contents/channels"
        params = {
            "mdrm": "true",
            "tlsstream": "true",
            "demarcation": config.DEMARCATION,
            "version": config.API_VERSION,
        }
        r = self._get(url, params=params)
        data = r.json()
        if not isinstance(data, list):
            raise ValueError("respuesta de canales inesperada")
        return data

    # --------------------------------------------------------- programación
    def fetch_day(
        self, channel_id: str, day: date, span: int = 1
    ) -> list[dict[str, Any]]:
        """Programación de un canal a partir de una fecha: `from` local.

        La API interpreta `from` en hora local de España (Europe/Madrid).
        span=1 → el día completo; span>1 → varios días en una sola petición.
        """
        url = f"{config.OTT_BASE}/epg"
        params = {
            "from": f"{day.isoformat()}T00:00:00",
            "span": str(span),
            "channel": channel_id,
            "version": config.API_VERSION,
            "mdrm": "true",
            "tlsstream": "true",
            "demarcation": config.DEMARCATION,
        }
        r = self._get(url, params=params)
        data = r.json()
        if not isinstance(data, list):
            return []
        return data

    def fetch_details(self, details_url: str) -> dict[str, Any] | None:
        """Obtiene la ficha (descripción, año, episodio...) de un programa."""
        try:
            r = self._get(details_url)
            return r.json()
        except Exception as exc:  # el enriquecimiento nunca debe romper la sync
            log.debug("detalle no disponible %s: %s", details_url, exc)
            return None

    # ------------------------------------------------------------ helpers
    def fetch_days(
        self, channel_id: str, days: list[date]
    ) -> list[tuple[date, list[dict[str, Any]]]]:
        """Descarga varios días con concurrencia limitada."""
        out: list[tuple[date, list[dict[str, Any]]]] = []
        with ThreadPoolExecutor(max_workers=self.concurrency) as pool:
            futures = {
                pool.submit(self._fetch_one, channel_id, d): d for d in days
            }
            for fut in as_completed(futures):
                d = futures[fut]
                try:
                    out.append((d, fut.result()))
                except Exception as exc:
                    log.error("fallo descarga %s %s: %s", channel_id, d, exc)
                    out.append((d, []))
        out.sort(key=lambda item: item[0])
        return out

    def _fetch_one(self, channel_id: str, day: date) -> list[dict[str, Any]]:
        return self.fetch_day(channel_id, day)


def fetch_with_retries(*args, **kwargs):
    """Compatibilidad/ayudante para scripts de diagnóstico."""
    src = MovistarSource()
    return src.fetch_day(*args, **kwargs)