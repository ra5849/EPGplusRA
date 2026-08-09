"""Normalización de texto y categorías.

Conserva siempre el valor original; la normalización se usa solo para
búsqueda, comparaciones y agrupación.
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------

CATEGORY_BUCKETS = (
    "Cine",
    "Series",
    "Deportes",
    "Noticias",
    "Infantil",
    "Entretenimiento",
    "Documentales",
    "Música",
    "Otros",
)


def normalize_text(text: str | None) -> str:
    """Minúsculas, sin acentos, espacios colapsados (para búsqueda/igualdad)."""
    if text is None:
        return ""
    s = unicodedata.normalize("NFD", str(text))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def slugify(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize_text(text)).strip("-")


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------

# Mapeo directo de géneros observados en la API real de Movistar (2026-08-08)
# y de nombres equivalentes con/taric sin acentos.
_DIRECT: dict[str, str] = {
    "Informativo": "Noticias",
    "Información": "Noticias",
    "Informacion": "Noticias",
    "Nacional e internacional": "Noticias",
    "Actualidad": "Noticias",
    "Programa deportes": "Deportes",
    "Deportes": "Deportes",
    "Programa de cine": "Cine",
    "Cine": "Cine",
    "Zapping": "Entretenimiento",
    "Juegos": "Entretenimiento",
    "Entretenimiento": "Entretenimiento",
    "Concurso": "Entretenimiento",
    "Variedades": "Entretenimiento",
    "Corazón y sociedad": "Entretenimiento",
    "Corazon y sociedad": "Entretenimiento",
    "Cocina": "Documentales",
    "Viajes": "Documentales",
    "Naturaleza": "Documentales",
    "Ciencia y tecnología": "Documentales",
    "Documentales": "Documentales",
    "Reportaje": "Documentales",
    "Historia": "Documentales",
    "Música": "Música",
    "Musica": "Música",
    "Infantil": "Infantil",
    "Dibujos": "Infantil",
    "Series": "Series",
    "Drama": "Series",
    "Comedia": "Series",
    "Comedia dramática": "Series",
    "Comedia dramatica": "Series",
    "Thriller": "Series",
    "Taurino": "Otros",
    "Religioso": "Otros",
}

# Reglas por subcadena (normalizadas) para familias de géneros muy variables.
_RULES: list[tuple[str, str]] = [
    ("deport", "Deportes"), ("futbol", "Deportes"), ("baloncesto", "Deportes"),
    ("tenis", "Deportes"), ("motor", "Deportes"), ("golf", "Deportes"),
    ("liga", "Deportes"), ("champions", "Deportes"), ("ciclismo", "Deportes"),
    ("cine", "Cine"), ("pelicula", "Cine"),
    ("informativ", "Noticias"), ("informac", "Noticias"), ("noticias", "Noticias"),
    ("telediario", "Noticias"), ("boletin", "Noticias"),
    ("documental", "Documentales"), ("reportaje", "Documentales"),
    ("naturaleza", "Documentales"), ("historia", "Documentales"),
    ("infantil", "Infantil"), ("ninos", "Infantil"), ("kids", "Infantil"),
    ("musica", "Música"), ("concierto", "Música"), ("opera", "Música"),
    ("serie", "Series"), ("drama", "Series"), ("comedia", "Series"),
    ("thriller", "Series"), ("sitcom", "Series"),
    ("zapping", "Entretenimiento"), ("juegos", "Entretenimiento"),
    ("corazon", "Entretenimiento"), ("magazin", "Entretenimiento"),
    ("talk", "Entretenimiento"), ("reality", "Entretenimiento"),
    ("concurso", "Entretenimiento"), ("variedades", "Entretenimiento"),
]

# Claves normalizadas de _DIRECT para tolerancia a acentos
_DIRECT_NORM = {normalize_text(k): v for k, v in _DIRECT.items()}

# Tipos de contenido observados en la API (campo TipoContenido) que permiten
# afinar Series/Cine cuando el género es ambiguo (p.ej. 'Acción').
_FILM_TYPES = {"película", "pelicula", "largometraje", "cine", "film"}
_SERIE_TYPES = {"episodio", "serie", "capítulo", "capitulo", "episodio de serie"}


def normalize_category(raw: str | None) -> str:
    """Mapea la categoría original de Movistar a un bucket estable.

    Prioridad: mapeo directo exacto > clave normalizada (sin acentos) >
    reglas por subcadena > 'Otros'. El original se conserva aparte
    (campo `category_raw`), nunca se destruye.
    """
    if not raw:
        return "Otros"
    text = raw.strip()
    if text in _DIRECT:
        return _DIRECT[text]
    norm = normalize_text(text)
    if norm in _DIRECT_NORM:
        return _DIRECT_NORM[norm]
    for word, bucket in _RULES:
        if word in norm:
            return bucket
    return "Otros"


def refine_category(category: str, raw: str | None, tipo_contenido: str | None) -> str:
    """Refinamiento con el dato real `TipoContenido` para géneros ambiguos.

    'Episodio' (serie) o 'Película' deshacen la ambigüedad de géneros como
    'Acción', 'Ciencia ficción' o 'Thriller', que pueden ser película o serie.
    Los buckets fuertes (Deportes, Noticias...) nunca se sobreescriben.
    """
    if category != "Otros":
        return category
    tipo = normalize_text(tipo_contenido) if tipo_contenido else ""
    if tipo in _FILM_TYPES:
        return "Cine"
    if tipo in _SERIE_TYPES:
        return "Series"
    return category