"""Generación determinista y atómica de JSON de salida.

Regla crítica: nunca se sobrescribe el JSON bueno directamente. Se escribe
`<nombre>.new.json`, se valida y solo entonces se renombra (os.replace).
Si la validación falla, el archivo anterior queda intacto.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Campos metadatos dinámicos que NO participan en el hash de contenido.
_VOLATILE = {"generated_at", "content_hash", "coverage", "channels_enabled",
             "channels_available", "current_programs", "errors",
             "warnings", "duration_seconds", "status", "collector_version",
             "source_version", "timezone"}


def canonical_dump(data: dict[str, Any]) -> str:
    """Serialización determinista (claves ordenadas, sin espacios)."""
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def content_hash(data: dict[str, Any]) -> str:
    """SHA-256 del contenido excluyendo metadatos dinámicos.

    Permite detectar si la programación cambió de verdad (y evitar commits
    por un simple cambio de `generated_at`).
    """
    strip = {k: v for k, v in data.items() if k not in _VOLATILE}
    if "programs" in strip:
        strip["programs"] = sorted(strip["programs"], key=_program_sort_key)
    payload = _canonical_payload(strip)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _canonical_payload(obj: Any) -> str:
    if isinstance(obj, dict):
        return "{" + ",".join(
            f"{json.dumps(str(k), ensure_ascii=False)}:{_canonical_payload(v)}"
            for k, v in sorted(obj.items())
        ) + "}"
    if isinstance(obj, list):
        return "[" + ",".join(_canonical_payload(v) for v in obj if v is not None) + "]"
    if obj is None:
        return "null"
    if isinstance(obj, bool):
        return "true" if obj else "false"
    if isinstance(obj, (int, float)):
        return repr(obj)
    return json.dumps(str(obj), ensure_ascii=False)


def _program_sort_key(program: dict) -> tuple:
    return (
        str(program.get("channel_id", "")),
        str(program.get("start", "")),
        str(program.get("id", "") or ""),
    )


def sort_programs(programs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Orden determinista: canal + inicio + id."""
    return sorted(programs, key=_program_sort_key)


def strip_volatile(program: dict[str, Any]) -> dict[str, Any]:
    """Quita campos internos no publicables (show_id, ficha)."""
    return {k: v for k, v in program.items() if k not in ("show_id", "ficha")}


def write_atomic(path: Path, data: dict[str, Any]) -> Path:
    """Escribe `data` en `path` de forma atómica (archivo `.new` + replace).

    El archivo destino jamás queda a medio escribir ni vacío: si el proceso
    se interrumpe, el original sigue intacto y queda un `.new.json` huérfano.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f"{path.stem}.new.json"
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=None, separators=(",", ":")),
        encoding="utf-8",
    )
    os.replace(tmp, path)
    return path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_channels_json(
    channels: list[dict[str, Any]],
    generated_at: str | None = None,
) -> dict[str, Any]:
    return {
        "generated_at": generated_at or now_iso(),
        "source": "movistar",
        "channels": sorted(channels, key=lambda c: (c.get("dial") if isinstance(c.get("dial"), int) else 10_000, str(c.get("name", "")))),
    }


def build_epg_json(
    programs: list[dict[str, Any]],
    timezone_name: str,
    coverage_from: str,
    coverage_to: str,
    generated_at: str | None = None,
) -> dict[str, Any]:
    programs = sort_programs(programs)
    return {
        "generated_at": generated_at or now_iso(),
        "timezone": timezone_name,
        "coverage": {"from": coverage_from, "to": coverage_to},
        "programs": programs,
    }


def build_epg_index(days: list[str], generated_at: str | None = None) -> dict[str, Any]:
    return {
        "generated_at": generated_at or now_iso(),
        "days": sorted(days),
    }