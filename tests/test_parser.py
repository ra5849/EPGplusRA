"""Tests del parser de respuestas de Movistar."""

import json
from pathlib import Path

from collector.parser import (
    get_image,
    merge_details,
    parse_episode_number,
    parse_program,
    parse_rating,
    parse_season,
    parse_year,
)

FIXTURE = Path(__file__).parent / "fixtures" / "sample_program.json"


def load_fixture() -> dict:
    return json.loads(FIXTURE.read_text("utf-8"))


class TestParseProgram:
    def test_valid(self):
        raw = load_fixture()
        p = parse_program(raw, "TVE")
        assert p is not None
        assert p["channel_id"] == "TVE"
        assert p["title"] == "Viaje al centro de la tele: La noche temática"
        assert p["subtitle"] == "Visto como quiero"
        assert p["start"].startswith("2026-08-07T")
        assert p["end"].startswith("2026-08-07T")
        assert p["category"] == "Entretenimiento"  # Zapping + Episodio
        assert p["category_raw"] == "Zapping"
        assert p["season"] == 1
        assert p["episode"] is None  # 'Visto como quiero' no es número
        assert p["rating"] == "TP"
        assert p["score"] == 3.4
        assert p["image"].startswith("https://")
        assert p["id"] == "174138514"
        assert p["premiere"] is False

    def test_empty(self):
        assert parse_program({}, "TVE") is None

    def test_no_times(self):
        raw = load_fixture()
        del raw["FechaHoraInicio"]
        assert parse_program(raw, "TVE") is None

    def test_no_id(self):
        raw = load_fixture()
        del raw["CodEventoRejilla"]
        p = parse_program(raw, "TVE")
        assert p["id"] is None

    def test_fields_missing_do_not_crash(self):
        raw = {"Titulo": "Solo título", "FechaHoraInicio": 1786137600000,
               "FechaHoraFin": 1786140600000}
        p = parse_program(raw, "TVE")
        assert p is not None
        assert p["category"] == "Otros"
        assert p["rating"] is None
        assert p["episode"] is None


class TestParsers:
    def test_season(self):
        assert parse_season("(T1)") == 1
        assert parse_season("(T10)") == 10
        assert parse_season("T3") == 3
        assert parse_season("") is None
        assert parse_season(None) is None
        assert parse_season(17) is None

    def test_episode_number(self):
        assert parse_episode_number(8) == 8
        assert parse_episode_number("28") == 28
        assert parse_episode_number("T1 E28") == 28
        assert parse_episode_number("Episodio 8") == 8
        assert parse_episode_number("Visto como quiero") is None
        assert parse_episode_number(None) is None

    def test_year(self):
        assert parse_year(2023) == 2023
        assert parse_year("2023") == 2023
        assert parse_year("1800") is None
        assert parse_year(None) is None

    def test_rating(self):
        assert parse_rating({"Id": "TP"}) == "TP"
        assert parse_rating({"_id": "07", "Id": "12"}) == "12"
        assert parse_rating(None) is None

    def test_image(self):
        raw = load_fixture()
        img = get_image(raw)
        assert "ywcatalogov" in img
        raw["Imagen"] = None
        raw["Imagenes"] = [{"id": "default", "uri": "https://x/img.jpg"}]
        assert get_image(raw) == "https://x/img.jpg"

    def test_merge_details(self):
        p = parse_program(load_fixture(), "TVE")
        details = {
            "Descripcion": "Un viaje por la tele.",
            "Anno": "2023",
            "NumeroEpisodio": "28",
            "Temporada": "(T1)",
        }
        merged = merge_details(p, details)
        assert merged["description"] == "Un viaje por la tele."
        assert merged["year"] == 2023
        assert merged["episode"] == "28"


class TestCategoryRefinement:
    def test_episode_becomes_series(self):
        raw = load_fixture()
        raw["GeneroComAntena"] = "Acción"
        p = parse_program(raw, "TVE")
        assert p["category"] == "Series"

    def test_film_becomes_cine(self):
        raw = load_fixture()
        raw["GeneroComAntena"] = "Acción"   # ambiguo -> refinamiento
        raw["TipoContenido"] = "Película"
        p = parse_program(raw, "TVE")
        assert p["category"] == "Cine"