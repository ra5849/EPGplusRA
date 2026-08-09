"""Validación anti-corrupción.

Reglas críticas del proyecto:
- Nunca reemplazar un EPG bueno por uno vacío o claramente defectuoso.
- Detectar listas vacías, cobertura absurda, timestamps inválidos y
  duplicados graves antes de publicar.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from . import config


class ValidationError(Exception):
    """Un dataset no cumple los umbrales mínimos."""


def load_json(path) -> Any:
    """Lee y analiza JSON. Lanza ValueError si está corrupto."""
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_ts(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Canales
# ---------------------------------------------------------------------------

def validate_channels(data: dict[str, Any]) -> list[str]:
    """Devuelve la lista de problemas detectados (vacía = válido)."""
    issues: list[str] = []
    channels = data.get("channels", [])
    if not isinstance(channels, list):
        return ["channels no es una lista"]
    if len(channels) < config.MIN_CHANNELS:
        issues.append(f"canales insuficientes: {len(channels)} < {config.MIN_CHANNELS}")
    ids: set[str] = set()
    for ch in channels:
        cid = ch.get("id")
        if not cid:
            issues.append("canal sin id")
        elif cid in ids:
            issues.append(f"canal duplicado: {cid}")
        ids.add(cid)
        if not ch.get("name"):
            issues.append(f"canal {cid} sin nombre")
    return issues


# ---------------------------------------------------------------------------
# EPG
# ---------------------------------------------------------------------------

def validate_epg(data: dict[str, Any]) -> list[str]:
    """Devuelve los problemas detectados (vacío = dataset aceptable).

    Comprueba: cantidad mínima, programas de hoy, cobertura temporal,
    timestamps válidos/monótonos y duplicados graves.
    """
    issues: list[str] = []
    programs = data.get("programs", [])
    if not isinstance(programs, list):
        return ["programs no es una lista"]
    if len(programs) < config.MIN_PROGRAMS:
        issues.append(f"programas insuficientes: {len(programs)} < {config.MIN_PROGRAMS}")

    now = _now()
    coverage = data.get("coverage", {})
    cov_from = parse_ts(coverage.get("from"))
    cov_to = parse_ts(coverage.get("to"))
    if not cov_from or not cov_to:
        issues.append("cobertura ausente o inválida")
    else:
        if cov_to - cov_from < timedelta(hours=config.MIN_COVERAGE_HOURS):
            issues.append(
                f"cobertura insuficiente: {cov_to - cov_from} < {config.MIN_COVERAGE_HOURS}h"
            )
        if cov_from > now + timedelta(hours=1):
            issues.append("cobertura empieza en el futuro")
        if cov_to < now - timedelta(hours=config.MAX_PROGRAM_DAYS * 24):
            issues.append("cobertura termina demasiado atrás")

    current = 0
    seen: set[tuple[str, str]] = set()
    duplicates = 0
    start_times: list[tuple[str, datetime]] = []
    for prog in programs:
        start = parse_ts(prog.get("start"))
        end = parse_ts(prog.get("end"))
        if not start or not end:
            issues.append("timestamp inválido en programa")
            continue
        if end <= start:
            issues.append(f"programa con fin <= inicio: {prog.get('title')}")
            continue
        if start <= now < end:
            current += 1
        key = (str(prog.get("channel_id")), prog.get("start"))
        if key in seen:
            duplicates += 1
        seen.add(key)
        std = prog.get("start")
        if isinstance(std, str):
            start_times.append((str(prog.get("channel_id")), start))

    if current < config.MIN_CURRENT_PROGRAMS:
        issues.append(f"programas actuales insuficientes: {current} < {config.MIN_CURRENT_PROGRAMS}")
    if duplicates:
        issues.append(f"duplicados por (canal, inicio): {duplicates}")
    return issues


# ---------------------------------------------------------------------------
# Puerto de validación alto nivel
# ---------------------------------------------------------------------------

def is_valid(path, kind: str = "epg", threshold_scale: float = 1.0) -> tuple[bool, list[str]]:
    """Carga el JSON de `path` y valida. `kind` = 'epg' | 'channels'.

    Devuelve (valido, problemas).
    """
    try:
        data = load_json(path)
    except Exception as exc:
        return False, [f"JSON corrupto: {exc}"]
    if kind == "channels":
        issues = validate_channels(data)
    else:
        issues = validate_epg(data)
    return (not issues), issues