"""Tests del normalizador (texto y categorías)."""

from collector.normalizer import (
    normalize_category,
    normalize_text,
    refine_category,
    slugify,
)


class TestNormalizeText:
    def test_accents(self):
        assert normalize_text("Fórmula 1") == "formula 1"
        assert normalize_text("FÓRMULA 1") == "formula 1"
        assert normalize_text("  Mi   canal  ") == "mi canal"
        assert normalize_text(None) == ""

    def test_slug(self):
        assert slugify("La Sexta") == "la-sexta"
        assert slugify("  M+ Cine  ") == "m-cine"


class TestNormalizeCategory:
    def test_direct(self):
        assert normalize_category("Informativo") == "Noticias"
        assert normalize_category("Programa deportes") == "Deportes"
        assert normalize_category("Programa de cine") == "Cine"
        assert normalize_category("Zapping") == "Entretenimiento"
        assert normalize_category("Comedia dramática") == "Series"

    def test_rule_substring(self):
        assert normalize_category("Fútbol") == "Deportes"
        assert normalize_category("Liga de Campeones") == "Deportes"
        assert normalize_category("Documental naturaleza") == "Documentales"
        assert normalize_category("Música clásica") == "Música"

    def test_unknown(self):
        assert normalize_category("Cualquier cosa rara") == "Otros"
        assert normalize_category(None) == "Otros"
        assert normalize_category("") == "Otros"

    def test_original_kept(self):
        # La normalización nunca debe borrar el original: se conserva en
        # category_raw en el parser; aquí solo se devuelve el bucket.
        assert normalize_category("Corazón y sociedad") == "Entretenimiento"


class TestRefineCategory:
    def test_strong_bucket_not_overridden(self):
        assert refine_category("Deportes", "Fútbol", "Episodio") == "Deportes"
        assert refine_category("Noticias", "Informativo", "Episodio") == "Noticias"

    def test_ambiguous_becomes_series(self):
        assert refine_category("Otros", "Acción", "Episodio") == "Series"

    def test_ambiguous_becomes_cine(self):
        assert refine_category("Otros", "Acción", "Película") == "Cine"
        assert refine_category("Otros", "Acción", "Largometraje") == "Cine"

    def test_stays_other(self):
        assert refine_category("Otros", "Acción", None) == "Otros"