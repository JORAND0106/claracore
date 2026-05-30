"""Worker aislado para xhtml2pdf (ProcessPoolExecutor en Windows)."""
from __future__ import annotations

import io
import logging
import os
import tempfile
from typing import List

_log = logging.getLogger("uvicorn.error")


def _pdf_link_callback(uri: str, rel) -> str:
    """Descarga imágenes http(s) para xhtml2pdf cuando no van embebidas en data-URI."""
    if not uri:
        return uri
    s = str(uri).strip()
    if s.startswith("data:") or not s.startswith("http"):
        return s
    try:
        import requests

        r = requests.get(s, timeout=25, headers={"User-Agent": "ClaraCore-pdf/1"})
        r.raise_for_status()
        ct = (r.headers.get("Content-Type") or "").lower()
        ext = ".png" if "png" in ct or s.lower().endswith(".png") else ".jpg"
        fd, path = tempfile.mkstemp(suffix=ext, prefix="cc_fo04_img_")
        try:
            os.write(fd, r.content)
        finally:
            os.close(fd)
        return path
    except Exception as exc:
        _log.warning("fo_eo_04 link_callback %s: %s", s[:72], exc)
        return s


def render_html_to_pdf(html: str) -> bytes:
    from xhtml2pdf import pisa

    buf = io.BytesIO()
    src = io.BytesIO(html.encode("utf-8", errors="replace"))
    result = pisa.CreatePDF(
        src,
        dest=buf,
        encoding="utf-8",
        link_callback=_pdf_link_callback,
    )
    buf.seek(0)
    out = buf.read()
    if not out:
        raise ValueError("xhtml2pdf no produjo bytes (PDF vacío)")
    if getattr(result, "err", 0):
        _log.warning(
            "fo_eo_04 worker xhtml2pdf err=%s bytes=%s",
            result.err,
            len(out),
        )
    return out


def render_html_batch(htmls: List[str]) -> List[bytes]:
    """Varias memorias en el mismo proceso (menos IPC; ~2 páginas por tarea)."""
    return [render_html_to_pdf(h) for h in htmls]
