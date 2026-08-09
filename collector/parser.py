"""Conversión de la respuesta cruda de la API a objetos de programa
normalizados y listos para serializar.

Modelo de programa de salida (campos contrastados con la API real el
2026-08-08):

    {
      "id": "CodEventoRejilla",
      "channel_id": "...",
      "title": "Titulo (o TituloSerie)",
      "subtitle": "TituloEpisodio o None",
      "description": str|None,
      "start": "ISO 8601 UTC",
      "end": "ISO 8601 UTC",
      "image": str|None,
      "category": "categoría normalizada",
      "category_raw": "GeneroComAntena original",
      "season": int|None,
      "episode": str|int|None,
      "year": int|None,
      "rating": str|None  (NivelMoral, p.ej. 'TP', '7', '12'),
      "score": float|None (Valoracion),
      "premiere": bool
    }
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .normalizer import normalize_category, refine_category

_T_SEASON_RE = re.compile(r"T\s*(\d+)", re.IGNORECASE)
_EP_NUMBER_RE = re.compile(
    r"(?:episodio|cap[íi]tulo|cap\.?)\s*(\d+)|(?<![A-Za-z0-9])E\s*(\d+)\b",
    re.IGNORECASE,
)


def _utc_iso(epoch_ms: Any) -> str | None:
    """Epoch millis (la API usa ms desde Unix en UTC) -> ISO 8601 UTC."""
    if epoch_ms is None:
        return None
    try:
        ms = int(epoch_ms)
        return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def parse_season(temporada: Any) -> int | None:
    """'(T1)' -> 1 ; 'T10' -> 10 ; vacío -> None."""
    if not temporada:
        return None
    m = _T_SEASON_RE.search(str(temporada))
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def parse_episode_number(value: Any) -> str | int | None:
    """Extrae número de episodio de un texto ('Episodio 8' -> 8, 'T1 E28' -> 28).

    Si no hay un número claro devuelve None (no se inventan datos).
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value) if float(value).is_integer() else value
    s = str(value).strip()
    if not s or s.lower() in {"null", "none", "n/a"}:
        return None
    if s.isdigit():
        return int(s)
    m = _EP_NUMBER_RE.search(s)
    if m:
        try:
            return int(m.group(1) or m.group(2))
        except ValueError:
            return None
    return None


def parse_year(value: Any) -> int | None:
    if value is None:
        return None
    m = re.search(r"(\d{4})", str(value))
    if not m:
        return None
    try:
        y = int(m.group(1))
    except ValueError:
        return None
    return y if 1900 <= y <= 2100 else None


def parse_rating(nivel_moral: Any) -> str | None:
    """NivelMoral: {'Id': 'TP'} | {'_id': '01', 'Id': 'TP'} -> 'TP'."""
    if isinstance(nivel_moral, dict):
        rid = nivel_moral.get("Id") or nivel_moral.get("_id")
        if rid:
            return str(rid).strip()
    return None


def get_image(item: dict[str, Any]) -> str | None:
    """Carátula del programa: prefiere 'Imagen' y cae a 'Imagenes'."""
    img = item.get("Imagen")
    if img and isinstance(img, str) and img.startswith("http"):
        return img
    images = item.get("Imagenes")
    if isinstance(images, list):
        for entry in images:
            if isinstance(entry, dict) and entry.get("id") == "default":
                uri = entry.get("uri")
                if uri and str(uri).startswith("http"):
                    return str(uri)
    return None


def _clean_float(value: Any) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # descarta NaN


def parse_program(
    raw: dict[str, Any],
    channel_id: str,
    defaults: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Convierte un evento crudo de la API en programa normalizado.

    `defaults` permite conservar campos de una ejecución anterior para el
    mismo programa (sincronización incremental: descripciones, ficha...).
    Devuelve None si el evento no tiene título o fechas coherentes.
    """
    defaults = defaults or {}
    title = raw.get("Titulo") or raw.get("TituloSerie") or defaults.get("title")
    if not title:
        return None

    start = _utc_iso(raw.get("FechaHoraInicio"))
    end = _utc_iso(raw.get("FechaHoraFin"))
    if not start or not end:
        return None

    category_raw = (raw.get("GeneroComAntena") or "").strip() or None
    tipo = raw.get("TipoContenido")
    category = refine_category(
        normalize_category(category_raw), category_raw, tipo
    )

    return {
        "id": str(raw.get("CodEventoRejilla")) if raw.get("CodEventoRejilla") is not None else None,
        "channel_id": channel_id,
        "title": str(title).strip(),
        "subtitle": str(raw["TituloEpisodio"]).strip()
        if raw.get("TituloEpisodio")
        else defaults.get("subtitle"),
        "description": defaults.get("description"),
        "start": start,
        "end": end,
        "image": get_image(raw) or defaults.get("image"),
        "category": category,
        "category_raw": category_raw or defaults.get("category_raw"),
        "season": parse_season(raw.get("Temporada")) or defaults.get("season"),
        "episode": parse_episode_number(raw.get("TituloEpisodio"))
        if not defaults.get("episode")
        else defaults["episode"],
        "year": parse_year(raw.get("Anno")) or defaults.get("year"),
        "rating": parse_rating(raw.get("NivelMoral")) or defaults.get("rating"),
        "score": _clean_float(raw.get("Valoracion")),
        "premiere": bool(raw.get("Estreno")),
        "show_id": str(raw.get("ShowId")) if raw.get("ShowId") is not None else None,
        "ficha": raw.get("Ficha") if isinstance(raw.get("Ficha"), str) else None,
    }


def merge_details(program: dict[str, Any], details: dict[str, Any] | None) -> dict[str, Any]:
    """Fusiona la ficha (rica) en el programa si aporta campos nuevos."""
    if not details or not isinstance(details, dict):
        return program
    out = dict(program)
    if not out.get("description"):
        out["description"] = (details.get("Descripcion") or details.get("Sinopsis")) or None
    if out.get("season") is None:
        out["season"] = parse_season(details.get("Temporada"))
    if out.get("episode") is None:
        ep = details.get("NumeroEpisodio")
        if ep is not None:
            out["episode"] = ep
    if not out.get("year"):
        out["year"] = parse_year(details.get("Anno"))
    if not out.get("rating"):
        out["rating"] = parse_rating(details.get("NivelMoral"))
    if out.get("score") is None:
        val = details.get("Valoracion")
        if isinstance(val, dict):
            out["score"] = _clean_float(val.get("Valoracion"))
    if not out.get("image"):
        img = details.get("Imagen")
        if isinstance(img, str) and img.startswith("http"):
            out["image"] = img
    return out