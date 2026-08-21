"""Utilidades de firma digital (perfil usuario) para PDFs de Almacén."""
from __future__ import annotations

import base64
import io
import re
from typing import Optional, Tuple


def _flatten_image_bytes_on_white(content: bytes) -> Tuple[bytes, str]:
    """
    Compone PNG/GIF con alpha sobre fondo blanco.
    xhtml2pdf/reportlab pinta transparencia como negro; este paso evita ese bug
    en logos y firmas de toda la plataforma.
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

    has_alpha = (
        im.mode in ("RGBA", "LA")
        or (im.mode == "P" and "transparency" in getattr(im, "info", {}))
    )
    if has_alpha:
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        out = io.BytesIO()
        bg.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"

    if im.mode != "RGB":
        im = im.convert("RGB")
    out = io.BytesIO()
    im.save(out, format="PNG", optimize=True)
    return out.getvalue(), "image/png"


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
