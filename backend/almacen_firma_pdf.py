"""Utilidades de firma digital (perfil usuario) para PDFs de Almacén."""
from __future__ import annotations

import base64
import io
import re
from collections import deque
from typing import Optional, Tuple


def _knockout_near_black_matte(rgba, *, threshold: int = 32) -> object:
    """
    Si el borde del logo es mayormente negro opaco (mate típico de exportes),
    convierte ese mate conectado al borde en transparente.

    No toca negros interiores que no conecten con el borde (texto/iconos).
    """
    w, h = rgba.size
    if w < 4 or h < 4:
        return rgba
    pix = rgba.load()

    def is_matte(x: int, y: int) -> bool:
        r, g, b, a = pix[x, y]
        if a < 12:
            return True
        return a >= 180 and r <= threshold and g <= threshold and b <= threshold

    step = max(1, min(w, h) // 40)
    samples = []
    for x in range(0, w, step):
        samples.append(is_matte(x, 0))
        samples.append(is_matte(x, h - 1))
    for y in range(0, h, step):
        samples.append(is_matte(0, y))
        samples.append(is_matte(w - 1, y))
    if not samples or sum(1 for s in samples if s) < len(samples) * 0.55:
        return rgba

    seen = set()
    q: deque = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and (x, y) not in seen and is_matte(x, y):
            seen.add((x, y))
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        pix[x, y] = (0, 0, 0, 0)
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)
    return rgba


def _flatten_image_bytes_on_white(
    content: bytes, *, knockout_black_matte: bool = False
) -> Tuple[bytes, str]:
    """
    Compone PNG/GIF/JPEG sobre fondo blanco (sin alpha).

    xhtml2pdf/reportlab pinta transparencia como negro. Con
    ``knockout_black_matte=True`` (logos) también elimina mate negro opaco
    conectado al borde (caso típico ICCU / exportes institucionales).
    """
    try:
        from PIL import Image
    except Exception:
        return content, "image/png"

    try:
        im = Image.open(io.BytesIO(content))
        im.load()
    except Exception:
        return content, "image/png"

    try:
        rgba = im.convert("RGBA")
        if knockout_black_matte:
            rgba = _knockout_near_black_matte(rgba)
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        out = io.BytesIO()
        bg.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"
    except Exception:
        try:
            if im.mode != "RGB":
                im = im.convert("RGB")
            out = io.BytesIO()
            im.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
        except Exception:
            return content, "image/png"


def _data_uri_from_bytes(raw: bytes, ct: str = "image/png") -> str:
    flat, mime = _flatten_image_bytes_on_white(raw)
    return f"data:{mime or ct};base64,{base64.b64encode(flat).decode('ascii')}"


def firma_url_a_data_uri(url: Optional[str]) -> str:
    """Convierte URL o data-URI de firma/logo a data-URI opaco (fondo blanco)."""
    if not url:
        return ""
    u = str(url).strip()
    if u.startswith("data:image"):
        m = re.match(r"data:image/[^;]+;base64,(.+)$", u, re.I | re.S)
        if not m:
            return u
        try:
            raw = base64.b64decode(m.group(1))
        except Exception:
            return u
        return _data_uri_from_bytes(raw)
    try:
        import httpx

        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            r = client.get(u)
            r.raise_for_status()
            return _data_uri_from_bytes(r.content)
    except Exception:
        return ""
