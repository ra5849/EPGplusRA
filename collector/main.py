"""Punto de entrada del collector.

Uso:
    python -m collector.main [--days N] [--no-details] [--split]
    python -m collector.main --diagnose
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from . import config
from .generator import (
    build_channels_json,
    build_epg_index,
    build_epg_json,
    content_hash,
    now_iso,
    sort_programs,
    strip_volatile,
    write_atomic,
)
from .movistar import MovistarSource
from .normalizer import normalize_text
from .parser import merge_details, parse_program
from .validator import is_valid, validate_channels, validate_epg

log = logging.getLogger("collector")


# ---------------------------------------------------------------------------
# Canales
# ---------------------------------------------------------------------------

def today_local() -> date:
    return datetime.now(ZoneInfo(config.TIMEZONE)).date()


def discover_channels(source: MovistarSource) -> list[dict]:
    """Canales disponibles de Movistar -> lista normalizada (no virtuales)."""
    raw = source.discover_channels()
    channels: list[dict] = []
    for item in raw:
        cid = item.get("CodCadenaTv")
        if not cid or item.get("EsVirtual"):
            continue
        logo = item.get("Logo")
        if not logo and isinstance(item.get("Logos"), list):
            for entry in item["Logos"]:
                if isinstance(entry, dict) and entry.get("id") == "default":
                    logo = entry.get("uri")
                    break
        channels.append({
            "id": str(cid),
            "name": (item.get("Nombre") or "").strip(),
            "normalized_name": normalize_text(item.get("Nombre")),
            "logo": logo if isinstance(logo, str) and logo.startswith("http") else None,
            "dial": item.get("Dial"),
            "category": None,  # se rellena con el género dominante de su parrilla
        })
    channels.sort(key=lambda c: (c["dial"] if isinstance(c["dial"], int) else 10**9, c["name"]))
    return channels


def apply_channel_categories(channels: list[dict], programs: list[dict]) -> list[dict]:
    """Categoría del canal = género normalizado más frecuente en su parrilla."""
    counter: dict[str, Counter] = {}
    for prog in programs:
        cid = prog.get("channel_id")
        cat = prog.get("category")
        if cid and cat:
            counter.setdefault(cid, Counter())[cat] += 1
    for ch in channels:
        cnt = counter.get(ch["id"])
        ch["category"] = cnt.most_common(1)[0][0] if cnt else None
    return channels


# ---------------------------------------------------------------------------
# Sincronización
# ---------------------------------------------------------------------------

def load_previous_epg() -> dict | None:
    """EPG anterior (para sincronización incremental) o None."""
    if not config.EPG_OUT.exists():
        return None
    try:
        return json.loads(config.EPG_OUT.read_text("utf-8"))
    except Exception:
        return None


def previous_index(prev: dict | None) -> dict[str, dict]:
    """{(channel_id, id): programa} del dataset anterior."""
    if not prev:
        return {}
    return {
        (str(p.get("channel_id")), str(p.get("id"))): p
        for p in prev.get("programs", [])
        if p.get("id")
    }


def build_programs(
    source: MovistarSource,
    channels: list[dict],
    days: list[date],
    prev_index: dict[str, dict],
    fetch_details: bool,
) -> list[dict]:
    """Descarga y normaliza la programación de los canales en los días dados.

    Idempotente: ejecutarlo dos veces no duplica programas (se deduplica por
    (canal, inicio) prefiriendo el evento con id real).
    """
    programs: list[dict] = []
    details_cache: dict[str, dict | None] = {}
    seen_starts: set[tuple[str, str]] = set()
    dupes = 0

    for ch in channels:
        results = source.fetch_days(ch["id"], days)
        for _day, raw_programs in results:
            for raw in raw_programs:
                prog_id = None
                if raw.get("CodEventoRejilla") is not None:
                    prog_id = str(raw["CodEventoRejilla"])
                start_ms = raw.get("FechaHoraInicio")
                start_key = f"{start_ms}" if start_ms is not None else None
                dedupe_key = (ch["id"], start_key) if start_key else None
                if dedupe_key in seen_starts:
                    dupes += 1
                    continue
                if dedupe_key:
                    seen_starts.add(dedupe_key)

                key = (ch["id"], prog_id) if prog_id else None
                defaults = prev_index.get(key, {}) if key else {}
                prog = parse_program(raw, ch["id"], defaults)
                if prog is None:
                    continue
                if fetch_details and (not prog.get("description") or not prog.get("year")):
                    show_id = raw.get("ShowId")
                    ficha_url = raw.get("Ficha")
                    if show_id and ficha_url and show_id not in details_cache:
                        if len(details_cache) < config.MAX_DETAILS_PER_RUN:
                            details_cache[show_id] = source.fetch_details(ficha_url)
                        else:
                            details_cache[show_id] = None
                    prog = merge_details(prog, details_cache.get(show_id))
                programs.append(strip_volatile(prog))

    if dupes:
        log.warning("eventos duplicados por (canal, inicio) ignorados: %d", dupes)
    return programs


def compute_coverage(programs: list[dict]) -> tuple[str | None, str | None]:
    starts = [p["start"] for p in programs if p.get("start")]
    ends = [p["end"] for p in programs if p.get("end")]
    if not starts or not ends:
        return None, None
    return min(starts), max(ends)


def count_current(programs: list[dict]) -> int:
    now = datetime.now(timezone.utc)
    n = 0
    for p in programs:
        try:
            st = datetime.fromisoformat(p["start"].replace("Z", "+00:00"))
            en = datetime.fromisoformat(p["end"].replace("Z", "+00:00"))
        except Exception:
            continue
        if st <= now < en:
            n += 1
    return n


def est_size(programs: list[dict]) -> int:
    return sum(len(json.dumps(p, ensure_ascii=False)) for p in programs)


def day_names(programs: list[dict]) -> list[str]:
    tz = ZoneInfo(config.TIMEZONE)
    days: set[str] = set()
    for p in programs:
        try:
            dt = datetime.fromisoformat(p["start"]).astimezone(tz)
        except Exception:
            continue
        days.add(dt.date().isoformat())
    return sorted(days)


def write_daily(dir_path: Path, programs: list[dict], generated_at: str) -> None:
    tz = ZoneInfo(config.TIMEZONE)
    for day in day_names(programs):
        day_progs = [
            p for p in programs
            if datetime.fromisoformat(p["start"]).astimezone(tz).date().isoformat() == day
        ]
        data = build_epg_json(
            day_progs,
            config.TIMEZONE,
            min(p["start"] for p in day_progs),
            max(p["end"] for p in day_progs),
            generated_at=generated_at,
        )
        write_atomic(dir_path / f"{day}.json", data)


def validate_generated(channels: list[dict], programs: list[dict]) -> tuple[bool, list[str]]:
    cov_from, cov_to = compute_coverage(programs)
    issues = validate_channels({"channels": channels})
    issues += validate_epg({
        "programs": programs,
        "coverage": {"from": cov_from, "to": cov_to},
    })
    return (not issues), issues


def run_sync(args: argparse.Namespace) -> int:
    t0 = time.time()
    source = MovistarSource()
    enabled = set(config.get_enabled_channels())

    log.info("1/4 descargando canales...")
    channels = discover_channels(source)
    if not channels:
        print("EPG UPDATE\nSTATUS: FAILED\nReason: 0 channels discovered\nPrevious EPG preserved.")
        return 1

    # Primera ejecución (archivo ausente O lista vacía): se habilitan todos
    # y se documenta cómo recortar la lista en config/enabled_channels.json.
    if not enabled:
        write_atomic(config.ENABLED_CHANNELS_PATH, {"enabled": [c["id"] for c in channels]})
        log.info("Primera ejecución: habilitados los %d canales (config/enabled_channels.json).", len(channels))
        enabled = {c["id"] for c in channels}
    else:
        known = {c["id"] for c in channels}
        enabled = {e for e in enabled if e in known}
        new_ids = sorted(known - enabled)
        if new_ids:
            log.warning("NUEVOS CANALES detectados (no activos): %s", ", ".join(new_ids))
            print("NEW CHANNELS: " + ", ".join(new_ids))

    selected = [c for c in channels if c["id"] in enabled]
    if not selected:
        print("EPG UPDATE\nSTATUS: FAILED\nReason: no enabled channels\nPrevious EPG preserved.")
        return 1

    # Días objetivo: ayer + hoy + N futuros
    ref = today_local()
    future = min(max(args.days or config.DEFAULT_DAYS_FUTURE, 1), config.MAX_DAYS_FUTURE)
    days = sorted({ref - timedelta(days=1)} | {ref + timedelta(days=i) for i in range(future)})

    log.info("2/4 descargando %d canales x %d días (%s → %s)...",
             len(selected), len(days), days[0], days[-1])
    prev = load_previous_epg()
    programs = build_programs(
        source, selected, days,
        previous_index(prev),
        fetch_details=not args.no_details,
    )
    if not programs:
        print("EPG UPDATE\nSTATUS: FAILED\nReason: 0 programs\nPrevious EPG preserved.")
        return 1

    channels = apply_channel_categories(channels, programs)
    generated_at = now_iso()
    coverage_from, coverage_to = compute_coverage(programs)
    hash_payload = build_epg_json(programs, config.TIMEZONE, coverage_from, coverage_to)

    log.info("3/4 escribiendo JSON...")
    write_atomic(config.CHANNELS_OUT, build_channels_json(channels, generated_at=generated_at))

    if not args.split and est_size(programs) <= config.SINGLE_EPG_MAX_BYTES:
        epg_data = build_epg_json(
            programs, config.TIMEZONE, coverage_from, coverage_to, generated_at=generated_at
        )
        epg_data["content_hash"] = content_hash(epg_data)
        write_atomic(config.EPG_OUT, epg_data)
    else:
        write_daily(config.EPG_DAY_DIR, programs, generated_at)
        if config.EPG_OUT.exists():
            config.EPG_OUT.unlink()
        write_atomic(
            config.EPG_INDEX_OUT,
            build_epg_index(day_names(programs), generated_at=generated_at),
        )

    log.info("4/4 validando...")
    valid, issues = validate_generated(channels, programs)
    if not valid:
        print("EPG UPDATE\nSTATUS: FAILED\nReason: " + "; ".join(issues[:3]) + "\nPrevious EPG preserved.")
        return 1

    published = config.EPG_OUT if config.EPG_OUT.exists() else config.EPG_DAY_DIR
    if config.EPG_OUT.exists() and not is_valid(config.EPG_OUT, "epg")[0]:
        print("EPG UPDATE\nSTATUS: FAILED\nReason: published EPG invalid\nPrevious EPG preserved.")
        return 1

    metadata = {
        "generated_at": generated_at,
        "source": config.SOURCE_DISPLAY,
        "source_version": config.SOURCE_VERSION,
        "collector_version": config.COLLECTOR_VERSION,
        "coverage_from": coverage_from,
        "coverage_to": coverage_to,
        "channels_available": len(channels),
        "channels_enabled": len(selected),
        "programs": len(programs),
        "current_programs": count_current(programs),
        "content_hash": content_hash(hash_payload),
        "status": "ok",
        "errors": [],
        "warnings": [],
        "duration_seconds": round(time.time() - t0, 1),
    }
    write_atomic(config.METADATA_OUT, metadata)

    size = est_size(programs)
    print(f"""
EPG UPDATE
Source: {config.SOURCE_DISPLAY} ({config.SOURCE_VERSION})
Channels discovered: {len(channels)}
Channels enabled: {len(selected)}
Programs downloaded: {len(programs)}
Current programs: {metadata['current_programs']}
Coverage: {coverage_from} → {coverage_to}
JSON size: {size / 1024 / 1024:.2f} MB
Duration: {metadata['duration_seconds']:.0f} s
Status: SUCCESS
""")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Collector de EPG de Movistar Plus+")
    p.add_argument("--days", type=int, default=None, help="días futuros a descargar (por defecto 7)")
    p.add_argument("--no-details", action="store_true", help="no enriquecer con la ficha del programa")
    p.add_argument("--split", action="store_true", help="forzar EPG particionado por día")
    p.add_argument("--diagnose", action="store_true", help="ejecuta el diagnóstico de la fuente")
    p.add_argument("--verbose", "-v", action="count", default=0)
    return p


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    if args.diagnose:
        from tools.diagnose_movistar import run_diagnosis
        return run_diagnosis()
    return run_sync(args)


if __name__ == "__main__":
    sys.exit(main())