"""
Encabezado institucional (3 logos) y preparación de imágenes para PDF.

xhtml2pdf/reportlab pinta canales alpha como negro. Toda imagen (logo/firma)
que vaya a un PDF debe pasar por ``prepare_image_for_pdf`` / flatten sobre blanco.
"""
from __future__ import annotations

import base64
import html
import io
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from typing import Dict, Optional, Tuple

_LOGO_MAX_PX_W = 360
_LOGO_MAX_PX_H = 180
_HTTP_TIMEOUT = 8.0
_CACHE_TTL = 600.0
_CACHE: Dict[str, Tuple[float, str]] = {}
_CACHE_LOCK = Lock()

_LOGO_KEYS = ("logo_contratista", "logo_interventoria", "logo_entidad")


def prepare_image_for_pdf(
    src: Optional[str],
    *,
    max_px_w: int = _LOGO_MAX_PX_W,
    max_px_h: int = _LOGO_MAX_PX_H,
    allow_http: bool = True,
) -> str:
    """
    Convierte URL o data-URI a data-URI opaco seguro para xhtml2pdf.
    Aplana transparencia sobre blanco; redimensiona si hace falta.
    """
    u = str(src or "").strip()
    if not u:
        return ""
    now = time.time()
    cache_key = f"{max_px_w}x{max_px_h}|{u[:2000]}"
    with _CACHE_LOCK:
        hit = _CACHE.get(cache_key)
        if hit and hit[0] > now:
            return hit[1]
    try:
        uri = _src_to_data_uri(u, max_px_w, max_px_h, allow_http=allow_http) or ""
    except Exception:
        uri = ""
    if uri:
        with _CACHE_LOCK:
            _CACHE[cache_key] = (now + _CACHE_TTL, uri)
            if len(_CACHE) > 256:
                dead = [k for k, (exp, _) in _CACHE.items() if exp < now]
                for k in dead:
                    _CACHE.pop(k, None)
    return uri


def prepare_logos_contrato(
    contrato: dict,
    *,
    allow_http: bool = True,
    max_px_w: int = _LOGO_MAX_PX_W,
    max_px_h: int = _LOGO_MAX_PX_H,
) -> Dict[str, str]:
    """Resuelve en paralelo los 3 logos del contrato a data-URI aplanados."""
    urls = {k: str((contrato or {}).get(k) or "").strip() for k in _LOGO_KEYS}
    out: Dict[str, str] = {k: "" for k in _LOGO_KEYS}
    pending = {k: v for k, v in urls.items() if v}
    if not pending:
        return out
    with ThreadPoolExecutor(max_workers=min(3, len(pending))) as pool:
        futs = {
            pool.submit(
                prepare_image_for_pdf,
                url,
                max_px_w=max_px_w,
                max_px_h=max_px_h,
                allow_http=allow_http,
            ): key
            for key, url in pending.items()
        }
        for fut in as_completed(futs):
            out[futs[fut]] = fut.result() or ""
    return out


def _src_to_data_uri(src: str, max_px_w: int, max_px_h: int, *, allow_http: bool) -> str:
    if src.startswith("data:image"):
        m = re.match(r"data:image/[^;]+;base64,(.+)$", src, re.I | re.S)
        if not m:
            return ""
        try:
            raw = base64.b64decode(m.group(1))
        except Exception:
            return ""
        return _bytes_to_pdf_data_uri(raw, max_px_w, max_px_h)
    if src.startswith("http://") or src.startswith("https://"):
        if not allow_http:
            return ""
        try:
            import httpx

            timeout = httpx.Timeout(_HTTP_TIMEOUT, connect=min(3.0, _HTTP_TIMEOUT))
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                r = client.get(src)
                r.raise_for_status()
                return _bytes_to_pdf_data_uri(r.content, max_px_w, max_px_h)
        except Exception:
            return ""
    # Firmas / logos a veces llegan como base64 crudo (sin prefijo data:)
    compact = re.sub(r"\s+", "", src)
    if len(compact) >= 64 and re.fullmatch(r"[A-Za-z0-9+/=]+", compact):
        try:
            raw = base64.b64decode(compact)
            if raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[:3] == b"\xff\xd8\xff" or raw[:6] in (
                b"GIF87a",
                b"GIF89a",
            ):
                return _bytes_to_pdf_data_uri(raw, max_px_w, max_px_h)
        except Exception:
            return ""
    return ""


def _bytes_to_pdf_data_uri(raw: bytes, max_px_w: int, max_px_h: int) -> str:
    from almacen_firma_pdf import _flatten_image_bytes_on_white

    try:
        from PIL import Image
    except Exception:
        from almacen_firma_pdf import _data_uri_from_bytes
        return _data_uri_from_bytes(raw)

    flat, mime = _flatten_image_bytes_on_white(raw)
    try:
        im = Image.open(io.BytesIO(flat))
        im.load()
        if im.mode != "RGB":
            im = im.convert("RGB")
        if im.size[0] > max_px_w or im.size[1] > max_px_h:
            im.thumbnail((max_px_w, max_px_h), getattr(Image, "Resampling", Image).LANCZOS)
            out = io.BytesIO()
            im.save(out, format="JPEG", quality=85, optimize=True)
            return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
        return f"data:{mime or 'image/png'};base64,{base64.b64encode(flat).decode('ascii')}"
    except Exception:
        from almacen_firma_pdf import _data_uri_from_bytes
        return _data_uri_from_bytes(raw)


def _logo_cell_html(uri: str, placeholder: str, *, max_h: int = 44, max_w: int = 100) -> str:
    ph = html.escape(placeholder)
    if uri:
        return (
            f'<div style="text-align:center;line-height:0;">'
            f'<img src="{html.escape(uri, quote=True)}" '
            f'style="max-height:{max_h}px;max-width:{max_w}px;border:0;display:inline-block;" />'
            f"</div>"
        )
    return (
        f'<div style="border:0.5px dashed #94a3b8;min-height:{max(28, max_h - 8)}px;'
        f'padding:4px 2px;font-size:6pt;color:#94a3b8;text-align:center;">{ph}</div>'
    )


def html_encabezado_institucional(
    contrato: dict,
    titulo: str,
    *,
    subtitulo: str = "",
    compact: bool = False,
    generado_por: str = "",
    logo_uris: Optional[Dict[str, str]] = None,
) -> str:
    """
    Encabezado con 3 logos (Contratista | Interventoría | título | Entidad),
    mismo patrón visual que Bitácora de Obra.
    """
    c = contrato or {}
    uris = logo_uris if logo_uris is not None else prepare_logos_contrato(c)
    numero = html.escape(str(c.get("numero") or ""))
    objeto = html.escape(str(c.get("objeto") or ""))
    contratista = html.escape(str(c.get("contratista") or "—"))
    interventoria = html.escape(str(c.get("interventoria") or "—"))
    entidad_txt = html.escape(
        str(c.get("entidad_otra") or c.get("entidad") or c.get("municipio") or "—")
    )
    gen = html.escape(str(generado_por or ""))
    titulo_esc = html.escape(str(titulo or ""))
    sub_esc = html.escape(str(subtitulo or ""))

    max_h = 36 if compact else 48
    max_w = 90 if compact else 110
    cell_c = _logo_cell_html(uris.get("logo_contratista") or "", "Contratista", max_h=max_h, max_w=max_w)
    cell_i = _logo_cell_html(uris.get("logo_interventoria") or "", "Interventoría", max_h=max_h, max_w=max_w)
    cell_e = _logo_cell_html(uris.get("logo_entidad") or "", "Entidad", max_h=max_h, max_w=max_w)

    title_fs = "8.5pt" if compact else "11pt"
    meta_fs = "5.5pt" if compact else "7.5pt"
    sub_html = ""
    if sub_esc:
        sub_html = (
            f'<div style="font-size:6pt;font-weight:600;color:#475569;margin-top:1px;line-height:1.2;">'
            f"{sub_esc}</div>"
        )
    gen_html = f"<br/><span style=\"font-size:{meta_fs};\"><b>Generado por:</b> {gen}</span>" if gen else ""

    return f"""
<table width="100%" cellspacing="0" cellpadding="0"
  style="border-collapse:collapse;border:0.8pt solid #0f172a;margin:0 0 8px;background:#fff;">
  <tr>
    <td width="15%" style="padding:4px;border-right:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_c}</td>
    <td width="15%" style="padding:4px;border-right:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_i}</td>
    <td width="55%" style="padding:4px 8px;vertical-align:middle;background:#f1f5f9;">
      <div style="font-size:{title_fs};font-weight:bold;color:#0f172a;line-height:1.15;">{titulo_esc}</div>
      {sub_html}
      <div style="font-size:{meta_fs};color:#334155;margin-top:3px;line-height:1.25;">
        <b>Contrato N° {numero}</b>
        {(" · " + objeto) if objeto else ""}
      </div>
      <div style="font-size:{meta_fs};color:#475569;margin-top:2px;line-height:1.2;">
        {contratista} · {interventoria} · {entidad_txt}
      </div>
      {gen_html}
    </td>
    <td width="15%" style="padding:4px;border-left:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_e}</td>
  </tr>
</table>
"""
