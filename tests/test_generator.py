"""Tests del generador (determinismo, hash, escritura atómica)."""

import json

import pytest

from collector import generator
from collector.generator import (
    build_channels_json,
    build_epg_json,
    content_hash,
    now_iso,
    sort_programs,
    write_atomic,
)


def sample_programs():
    return [
        {
            "channel_id": "T5",
            "id": "2",
            "title": "B",
            "start": "2026-08-08T21:00:00Z",
            "end": "2026-08-08T22:00:00Z",
        },
        {
            "channel_id": "TVE",
            "id": "1",
            "title": "A",
            "start": "2026-08-08T20:00:00Z",
            "end": "2026-08-08T21:00:00Z",
        },
    ]


class TestDeterminism:
    def test_sort_by_channel_then_start(self):
        progs = sort_programs(sample_programs())
        # Orden lexicográfico por (canal, inicio): 'T5' < 'TVE'
        assert [p["channel_id"] for p in progs] == ["T5", "TVE"]
        # Dentro del mismo canal se ordena por inicio
        same = sort_programs([
            {"channel_id": "X", "id": "1", "start": "2026-08-08T22:00:00Z"},
            {"channel_id": "X", "id": "2", "start": "2026-08-08T20:00:00Z"},
        ])
        assert [p["start"] for p in same] == ["2026-08-08T20:00:00Z", "2026-08-08T22:00:00Z"]

    def test_sort_stable(self):
        assert sort_programs(sample_programs()) == sort_programs(sample_programs())

    def test_hash_stable_over_volatile_metadata(self):
        data = build_epg_json(
            sample_programs(), "Europe/Madrid",
            "2026-08-08T20:00:00Z", "2026-08-08T22:00:00Z",
        )
        h1 = content_hash(data)
        data["generated_at"] = now_iso()  # volátil: no debe cambiar el hash
        data["content_hash"] = "x"
        h2 = content_hash(data)
        assert h1 == h2

    def test_hash_changes_with_data(self):
        a = build_epg_json(
            sample_programs(), "Europe/Madrid",
            "2026-08-08T20:00:00Z", "2026-08-08T22:00:00Z",
        )
        b = build_epg_json(
            sample_programs()[:1], "Europe/Madrid",
            "2026-08-08T20:00:00Z", "2026-08-08T21:00:00Z",
        )
        assert content_hash(a) != content_hash(b)

    def test_channels_sorted_by_dial(self):
        data = build_channels_json([
            {"id": "T5", "name": "Telecinco", "dial": 5},
            {"id": "TVE", "name": "LA 1", "dial": 1},
        ])
        assert [c["id"] for c in data["channels"]] == ["TVE", "T5"]
        assert data["source"] == "movistar"


class TestAtomic:
    def test_write_atomic(self, tmp_path):
        out = tmp_path / "epg.json"
        write_atomic(out, {"programs": [{"name": "X"}]})
        assert json.loads(out.read_text("utf-8")) == {"programs": [{"name": "X"}]}
        leftovers = [p.name for p in tmp_path.iterdir() if ".new" in p.name]
        assert leftovers == []

    def test_rewrite_over_write(self, tmp_path):
        out = tmp_path / "epg.json"
        write_atomic(out, {"a": 1})
        write_atomic(out, {"a": 2})
        assert json.loads(out.read_text("utf-8")) == {"a": 2}

    def test_previous_survives_write_error(self, tmp_path):
        out = tmp_path / "epg.json"
        out.write_text('{"old": true}', encoding="utf-8")
        # Un fallo durante la serialización/escritura no toca el destino
        with pytest.raises(TypeError):
            write_atomic(out, {"bad": object()})
        assert json.loads(out.read_text("utf-8")) == {"old": True}

    def test_creates_missing_dirs(self, tmp_path):
        write_atomic(tmp_path / "sub" / "a" / "epg.json", {"x": 1})
        assert (tmp_path / "sub" / "a" / "epg.json").exists()


class TestHelpers:
    def test_now_iso_utc(self):
        assert now_iso().endswith("Z")

    def test_hash_format(self):
        assert len(content_hash({})) == 64
        assert content_hash({}) == content_hash({})