"""Worker aislado para xhtml2pdf (ProcessPoolExecutor en Windows)."""
from __future__ import annotations

import io
import logging
from typing import List

_log = logging.getLogger("uvicorn.error")


def _pdf_link_callback(uri: str, rel) -> str:
    """Solo data-URI locales; no re-descargar http (prefetch ya embebió o omitió)."""
    if not uri:
        return uri
    s = str(uri).strip()
    if s.startswith("data:") or not s.startswith("http"):
        return s
    # Evita cuelgues en Azure: xhtml2pdf no debe volver a pedir la red por página.
    _log.debug("fo_eo_04 link_callback omit http: %s", s[:72])
    return ""


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
