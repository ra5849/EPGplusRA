"""Diagnóstico de la fuente EPG de Movistar Plus+.

Conecta con la API OTT real y reporta el estado de la fuente:

    MOVISTAR EPG DIAGNOSTICS
    Source: ...
    HTTP status: ...
    Channels found: ...
    Sample channels: ...
    Programs found: ...
    Coverage: ...
    Available fields: ...
    Images: ...
    Categories: ...
    Episodes: ...
    Descriptions: ...
    Timezone: ...
    Result: PASS / PARTIAL / FAIL

Uso:
    python tools/diagnose_movistar.py [--dump DIR] [--channel TVE] [--days 2]
    python -m collector.main --diagnose
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collector import config  # noqa: E402
from collector.movistar import MovistarSource  # noqa: E402
from collector.normalizer import normalize_category  # noqa: E402


def _brief_program(p: dict, keys: tuple[str, ...]) -> dict:
    return {k: p.get(k) for k in keys if k in p}


def run_diagnosis(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", action="store_true", help="guardar muestra de respuesta")
    parser.add_argument("--channel", default="TVE", help="canal para el sondeo de programas")
    parser.add_argument("--channels", default=None, nargs="*",
                        help="canales extra para medir programas/categorías")
    parser.add_argument("--days", type=int, default=2, help="días a sondeadar")
    parser.add_argument("--json", action="store_true", help="salida en JSON")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    out: dict = {}
    print("MOVISTAR EPG DIAGNOSTICS")
    print("=" * 60)

    try:
        src = MovistarSource()
        tz = ZoneInfo(config.TIMEZONE)

        # ------------------------------------------------------------------ 1
        # Canales
        raw_channels = src.discover_channels()
        http_ok = bool(raw_channels)
        out["channels_http"] = 200 if http_ok else "FAIL"
        out["channels_count"] = len(raw_channels)

        channels = []
        for item in raw_channels:
            if item.get("EsVirtual"):
                continue
            channels.append({
                "id": item.get("CodCadenaTv"),
                "name": item.get("Nombre"),
                "logo": item.get("Logo"),
                "dial": item.get("Dial"),
            })
        sample = channels[:6]
        out["sample_channels"] = sample

        # ------------------------------------------------------------------- 2
        # Programación (muestra de 2 canales x 2 días para medir cobertura/campos)
        probe_channels = list(dict.fromkeys([args.channel] + (args.channels or [])))
        programs: list[dict] = []
        fields: Counter = Counter()
        categories: Counter = Counter()
        episodes = 0
        descriptions = 0
        images = 0

        ref = datetime.now(tz).date()
        days = [ref - timedelta(days=1)] + [ref + timedelta(days=1)] + [ref + timedelta(days=3)]
        for cid in probe_channels[:5]:
            for day in days[:2]:
                try:
                    raw = src.fetch_day(cid, day)
                except Exception as exc:
                    out.setdefault("errors", []).append(f"{cid} {day}: {exc}")
                    continue
                if not raw:
                    continue
                for item in raw:
                    programs.append(item)
                for key in ("Titulo", "TituloSerie", "TituloEpisodio", "GeneroComAntena",
                            "FechaHoraInicio", "FechaHoraFin", "Duracion", "Imagen",
                            "Imagenes", "NivelMoral", "Valoracion", "Estreno",
                            "Temporada", "ShowId", "Ficha", "CodEventoRejilla",
                            "Anno", "Resena", "Descripcion", "Sinopsis"):
                    if item.get(key) is not None:
                        fields[key] += 1
                g = (item.get("GeneroComAntena") or "").strip()
                if g:
                    categories[g] += 1
                if item.get("TituloEpisodio") or item.get("Temporada"):
                    episodes += 1
                if item.get("Resena") or item.get("Descripcion") or item.get("Sinopsis"):
                    descriptions += 1
                if (item.get("Imagen") or item.get("Imagenes")):
                    images += 1

        # ------------------------------------------------------------------- 3
        # Cobertura
        starts = [p["FechaHoraInicio"] for p in programs if p.get("FechaHoraInicio")]
        ends = [p["FechaHoraFin"] for p in programs if p.get("FechaHoraFin")]

        def _iso(ms):
            try:
                return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).astimezone(tz).isoformat()
            except Exception:
                return None

        out["programs_found"] = len(programs)
        out["coverage_from"] = _iso(min(starts)) if starts else None
        out["coverage_to"] = _iso(max(ends)) if ends else None
        out["available_fields"] = sorted(fields)
        out["categories"] = dict(categories.most_common(12))
        out["episodes_found"] = episodes
        out["descriptions_found"] = descriptions
        out["images_found"] = images
        out["timezone"] = config.TIMEZONE

        # ------------------------------------------------------------------- 4
        # Imágenes: sondear una URL de logo y una carátula (HEAD real)
        logo_url = channels[0]["logo"] if channels else None
        image_probe = None
        if programs and (programs[0].get("Imagen") or programs[0].get("Imagenes")):
            img = programs[0].get("Imagen")
            if not img and programs[0].get("Imagenes"):
                for e in programs[0]["Imagenes"]:
                    if e.get("id") == "default":
                        img = e.get("uri")
                        break
            image_probe = img
        import requests

        img_status = {}
        for label, url in (("logo", logo_url), ("poster", image_probe)):
            if not url:
                img_status[label] = "missing"
                continue
            try:
                r = requests.get(url, headers=config.HEADERS, timeout=15)
                img_status[label] = f"{r.status_code}"
            except Exception as exc:
                img_status[label] = f"ERR {exc}"
        out["images_status"] = img_status

        # ------------------------------------------------------------------ 5
        # Veredicto
        score = 0
        if http_ok and len(channels) >= 40:
            score += 1
        if len(programs) >= 40:
            score += 1
        if out["coverage_from"] and out["coverage_to"]:
            score += 1
        if img_status.get("logo", "").startswith("200") and img_status.get("poster", "").startswith("200"):
            score += 1
        if categories:
            score += 1
        if episodes or descriptions:
            score += 1
        out["result"] = "PASS" if score >= 4 else ("PARTIAL" if score >= 2 else "FAIL")

        # Splits para salida por pantalla
        out["sample_channels"] = channels[:8]
        out["categories_norm"] = {k: normalize_category(k) for k in list(categories)[:8]}

        if args.json:
            print(json.dumps(out, ensure_ascii=False, indent=2))
        else:
            print(f"\nSource:\n  {config.OTT_BASE} (demarcation={config.DEMARCATION}, v{config.API_VERSION})")
            print(f"HTTP status:   {out.get('channels_http')}")
            print(f"Channels found: {out.get('channels_count')}")
            print("Sample channels:")
            for c in sample:
                print(f"  {c['id']:10} {c['name'][:36]:38} {str(c.get('dial') or '-'):>4}  logo={bool(c.get('logo'))}")
            print(f"Programs found: {out.get('programs_found')}")
            print(f"Coverage: {out.get('coverage_from')} → {out.get('coverage_to')}")
            print(f"Available fields: {', '.join(out.get('available_fields') or [])}")
            print(f"Images: {img_status}")
            print(f"Categories (raw): {dict(categories.most_common(10))}")
            print(f"Categories (normalized): {out.get('categories_norm')}")
            print(f"Episodes: {episodes} encontrados (TituloEpisodio/Temporada)")
            print(f"Descriptions: {descriptions} encontrados (Resena/Descripcion/Sinopsis)")
            print(f"Timezone: {config.TIMEZONE}")
            print(f"Result: {out.get('result')}")

        if args.dump:
            dump_path = Path("artifacts") / f"diagnose_{args.channel}.json"
            dump_path.parent.mkdir(parents=True, exist_ok=True)
            dump_path.write_text(json.dumps(programs[:40], ensure_ascii=False), "utf-8")
            print(f"[dump] guardado en {dump_path}")

        return 0 if out.get("result") != "FAIL" else 1
    except Exception as exc:
        print(f"Result: FAIL\nError: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(run_diagnosis())