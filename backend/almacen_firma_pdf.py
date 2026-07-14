"""Utilidades de firma digital (perfil usuario) para PDFs de Almacén."""
from __future__ import annotations

import base64
from typing import Optional


def firma_url_a_data_uri(url: Optional[str]) -> str:
    """Convierte URL o data-URI de firma de perfil a data-URI embebible en PDF."""
    if not url:
        return ""
    u = str(url).strip()
    if u.startswith("data:image"):
        return u
    try:
        import httpx

        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            r = client.get(u)
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
            if not ct.startswith("image/"):
                ct = "image/png"
            b64 = base64.b64encode(r.content).decode("ascii")
            return f"data:{ct};base64,{b64}"
    except Exception:
        return ""
