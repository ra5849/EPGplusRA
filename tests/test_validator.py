"""Tests del validador anti-corrupción."""

import json
from datetime import datetime, timedelta, timezone

from collector import config
from collector.validator import is_valid, parse_ts, validate_channels, validate_epg

N_CHANNELS = 24
SLOTS = 96  # 48 h en slots de 30 min


def make_epg_data() -> dict:
    """EPG sintético válido: 24 canales x 48h de parrilla (2304 programas).

    En cualquier instante hay 24 programas "actuales" (uno por canal).
    """
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    base = now - timedelta(hours=24)
    programs = []
    for ci in range(N_CHANNELS):
        for s in range(SLOTS):
            start = base + timedelta(minutes=30 * s)
            programs.append({
                "id": f"{ci}-{s}",
                "channel_id": f"CH{ci}",
                "title": f"Programa {ci}/{s}",
                "start": start.isoformat(),
                "end": (start + timedelta(minutes=30)).isoformat(),
            })
    return {
        "coverage": {
            "from": programs[0]["start"],
            "to": programs[-1]["end"],
        },
        "programs": programs,
    }


class TestValidEpg:
    def test_valid(self):
        assert validate_epg(make_epg_data()) == []

    def test_empty(self):
        issues = validate_epg({"programs": [], "coverage": {}})
        assert issues

    def test_duplicates(self):
        data = make_epg_data()
        data["programs"][5]["start"] = data["programs"][0]["start"]
        issues = validate_epg(data)
        assert any("duplicados" in i for i in issues)

    def test_invalid_timestamps(self):
        data = make_epg_data()
        data["programs"][0]["start"] = "no-es-fecha"
        assert any("timestamp inválido" in i for i in validate_epg(data))

    def test_end_before_start(self):
        data = make_epg_data()
        data["programs"][0]["start"] = "2026-08-08T22:00:00Z"
        data["programs"][0]["end"] = "2026-08-08T21:00:00Z"
        assert any("fin <= inicio" in i for i in validate_epg(data))

    def test_no_coverage(self):
        data = make_epg_data()
        del data["coverage"]
        assert any("cobertura" in i for i in validate_epg(data))


class TestThresholds:
    def test_few_programs(self):
        data = make_epg_data()
        data["programs"] = data["programs"][:5]
        issues = validate_epg(data)
        assert any("programas insuficientes" in i for i in issues)

    def test_short_coverage(self):
        data = make_epg_data()
        progs = data["programs"][:40]  # 40 x 30 min = 20 h < 24 h mínimas
        data["programs"] = progs
        data["coverage"] = {"from": progs[0]["start"], "to": progs[-1]["end"]}
        assert any("cobertura insuficiente" in i for i in validate_epg(data))


class TestChannels:
    def test_valid(self):
        channels = [
            {"id": f"c{i}", "name": f"Canal {i}", "dial": i}
            for i in range(config.MIN_CHANNELS + 10)
        ]
        assert validate_channels({"channels": channels}) == []

    def test_few(self):
        channels = [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]
        assert validate_channels({"channels": channels})

    def test_duplicate(self):
        channels = [{"id": "a", "name": "A"}, {"id": "a", "name": "A2"}] * (
            config.MIN_CHANNELS + 5
        )
        assert any("duplicado" in i for i in validate_channels({"channels": channels}))


class TestIsValid:
    def test_corrupt_json(self, tmp_path):
        f = tmp_path / "bad.json"
        f.write_text("{ no json", encoding="utf-8")
        ok, issues = is_valid(f, "epg")
        assert not ok
        assert any("JSON corrupto" in i for i in issues)

    def test_valid_file(self, tmp_path):
        f = tmp_path / "ok.json"
        f.write_text(json.dumps(make_epg_data()), encoding="utf-8")
        ok, _ = is_valid(f, "epg")
        assert ok


class TestParseTs:
    def test_iso(self):
        assert parse_ts("2026-08-07T20:00:00Z") is not None
        assert parse_ts("2026-08-07T22:00:00+02:00") is not None

    def test_bad(self):
        assert parse_ts("hola") is None
        assert parse_ts(None) is None


def test_thresholds_configurable():
    assert config.MIN_CHANNELS >= 20
    assert config.MIN_PROGRAMS >= 200
    assert config.MIN_CURRENT_PROGRAMS >= 5
    assert config.MIN_COVERAGE_HOURS >= 12