"""Genera los iconos PNG de la PWA usando solo la biblioteca estándar
(zlib + struct). Sin Pillow ni dependencias externas.

Icono: fondo oscuro, pantalla de TV azul y triángulo "play" dorado.

Uso:
    python tools/gen_icons.py
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"

BG_TOP = (13, 17, 23)
BG_BOTTOM = (24, 32, 44)
FRAME = (38, 50, 66)
SCREEN_TOP = (10, 46, 88)
SCREEN_BOTTOM = (6, 26, 55)
GOLD_TIP = (250, 205, 60)
GOLD_CORE = (245, 179, 1)


def _mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _in_corner(x: int, y: int, size: int, radius: float) -> bool:
    """True si (x,y) cae fuera de la esquina redondeada."""
    r = size * radius
    cx = min(x, size - 1 - x)
    cy = min(y, size - 1 - y)
    return cx < r and cy < r and (r - cx) ** 2 + (r - cy) ** 2 > r * r


def _in_triangle(px: float, py: float, ax, ay, bx, by, cx, cy) -> bool:
    """Punto dentro de triángulo (coordenadas normalizadas a size)."""
    sign = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
    sign2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
    sign3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
    has_neg = (sign < 0) or (sign2 < 0) or (sign3 < 0)
    has_pos = (sign > 0) or (sign2 > 0) or (sign3 > 0)
    return not (has_neg and has_pos)


def pixel(x: int, y: int, size: int) -> tuple[int, int, int]:
    t = (x + y) / (2 * size)
    bg = _mix(BG_TOP, BG_BOTTOM, t)
    if _in_corner(x, y, size, 0.16):
        return bg

    m = size * 0.10
    x0, x1 = m, size - 1 - m
    y0, y1 = m * 1.2, size - 1 - m * 1.35

    inside_screen = x0 <= x <= x1 and y0 <= y <= y1
    if inside_screen:
        # Triángulo play: punta hacia la derecha, centrado a la izquierda
        apex_x = size * 0.455
        top_y = size * 0.5 - size * 0.135
        bot_y = size * 0.5 + size * 0.135
        right_x = size * 0.555
        if _in_triangle(x, y, apex_x, size * 0.5, right_x, top_y, right_x, bot_y):
            glow = 0.5 + 0.5 * (y / size)
            return _mix(GOLD_CORE, GOLD_TIP, glow)
        ty = (y - y0) / (y1 - y0)
        return _mix(SCREEN_TOP, SCREEN_BOTTOM, ty)

    # Marco de la TV (borde alrededor de la pantalla)
    x0f, x1f = x0 - size * 0.045, x1 + size * 0.045
    y0f, y1f = y0 - size * 0.045, y1 + size * 0.045
    if x0f <= x <= x1f and y0f <= y <= y1f:
        return _mix((20, 30, 42), (11, 17, 26), t)

    return bg


def make_icon(size: int) -> bytes:
    rows = []
    for y_ in range(size):
        row = bytearray([0])
        for x_ in range(size):
            r, g, b = pixel(x_, y_, size)
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, payload: bytes) -> bytes:
        c = struct.pack(">I", len(payload)) + tag + payload
        return c + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    return png


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = {
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-maskable-512.png": 512,
        "apple-touch-icon.png": 180,
        "favicon-32.png": 32,
    }
    for name, size in targets.items():
        png = make_icon(size)
        (OUT_DIR / name).write_bytes(png)
        print(f"[icono] {name} ({len(png)} bytes)")


if __name__ == "__main__":
    main()