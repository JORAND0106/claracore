"""
Encabezado institucional (3 logos) y preparación de imágenes para PDF.

xhtml2pdf/reportlab:
- pinta canales alpha como negro → siempre aplanar sobre blanco (y JPEG opaco).
- ignora max-height/max-width CSS → fijar width/height en pt + attrs HTML.
- el bitmap se redimensiona a la caja −40% para que el tamaño no dependa solo del CSS.
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

_HTTP_TIMEOUT = 8.0
_CACHE_TTL = 600.0
_CACHE: Dict[str, Tuple[float, str]] = {}
_CACHE_LOCK = Lock()

_LOGO_KEYS = ("logo_contratista", "logo_interventoria", "logo_entidad")

# Caja ORIGINAL del encabezado (primer diseño: max-height 48 / max-width 110).
# La reducción pedida es −40% → factor 0.60 sobre ese original.
_LOGO_ORIG_H_PT = 48.0
_LOGO_ORIG_W_PT = 110.0
_LOGO_ORIG_H_PT_COMPACT = 36.0
_LOGO_ORIG_W_PT_COMPACT = 90.0
_LOGO_SIZE_FACTOR = 0.60  # −40% respecto al original

_LOGO_BOX_H_PT = round(_LOGO_ORIG_H_PT * _LOGO_SIZE_FACTOR, 2)  # 28.8
_LOGO_BOX_W_PT = round(_LOGO_ORIG_W_PT * _LOGO_SIZE_FACTOR, 2)  # 66.0
_LOGO_BOX_H_PT_COMPACT = round(_LOGO_ORIG_H_PT_COMPACT * _LOGO_SIZE_FACTOR, 2)  # 21.6
_LOGO_BOX_W_PT_COMPACT = round(_LOGO_ORIG_W_PT_COMPACT * _LOGO_SIZE_FACTOR, 2)  # 54.0


def _pt_to_px(pt: float) -> int:
    """xhtml2pdf: tamaño intrínseco ≈ px * 72/96 pt. Invertimos para el failsafe."""
    return max(1, int(round(float(pt) * 96.0 / 72.0)))


# Píxeles = caja objetivo: aunque se ignore el CSS, el bitmap ya sale al −40%.
_LOGO_MAX_PX_W = _pt_to_px(_LOGO_BOX_W_PT)
_LOGO_MAX_PX_H = _pt_to_px(_LOGO_BOX_H_PT)


def prepare_image_for_pdf(
    src: Optional[str],
    *,
    max_px_w: int = _LOGO_MAX_PX_W,
    max_px_h: int = _LOGO_MAX_PX_H,
    allow_http: bool = True,
) -> str:
    """
    Convierte URL o data-URI a data-URI JPEG opaco seguro para xhtml2pdf.
    Aplana transparencia / mate negro sobre blanco; redimensiona si hace falta.
    """
    u = str(src or "").strip()
    if not u:
        return ""
    now = time.time()
    cache_key = f"jpg|{max_px_w}x{max_px_h}|{u[:2000]}"
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
    """Siempre JPEG RGB opaco: evita cualquier resto de alpha en xhtml2pdf."""
    from almacen_firma_pdf import _flatten_image_bytes_on_white

    try:
        from PIL import Image
    except Exception:
        from almacen_firma_pdf import _data_uri_from_bytes

        return _data_uri_from_bytes(raw)

    # Logos: knockout mate negro opaco (ICCU etc.) + aplanar alpha.
    flat, _mime = _flatten_image_bytes_on_white(raw, knockout_black_matte=True)
    try:
        im = Image.open(io.BytesIO(flat))
        im.load()
        if im.mode != "RGB":
            im = im.convert("RGB")
        if im.size[0] > max_px_w or im.size[1] > max_px_h:
            im.thumbnail((max_px_w, max_px_h), getattr(Image, "Resampling", Image).LANCZOS)
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=88, optimize=True)
        return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode('ascii')}"
    except Exception:
        from almacen_firma_pdf import _data_uri_from_bytes

        return _data_uri_from_bytes(raw)


def _fit_pt(uri: str, max_w: float, max_h: float) -> Tuple[float, float]:
    """Escala proporcional en pt (xhtml2pdf no respeta max-width/height CSS)."""
    try:
        from PIL import Image

        m = re.match(r"data:image/[^;]+;base64,(.+)$", uri, re.I | re.S)
        if not m:
            return round(max_w * 0.55, 2), round(max_h, 2)
        raw = base64.b64decode(m.group(1))
        im = Image.open(io.BytesIO(raw))
        px_w, px_h = im.size
        if not px_w or not px_h:
            return round(max_w * 0.55, 2), round(max_h, 2)
        nat_w = px_w * 72.0 / 96.0
        nat_h = px_h * 72.0 / 96.0
        scale = min(max_h / nat_h, max_w / nat_w, 1.0)
        return round(nat_w * scale, 2), round(nat_h * scale, 2)
    except Exception:
        return round(max_w * 0.55, 2), round(max_h, 2)


def _logo_cell_html(
    uri: str,
    placeholder: str,
    *,
    max_h_pt: float = _LOGO_BOX_H_PT,
    max_w_pt: float = _LOGO_BOX_W_PT,
) -> str:
    ph = html.escape(placeholder)
    if uri:
        w, h = _fit_pt(uri, max_w_pt, max_h_pt)
        # Atributos HTML + CSS: doble anclaje (xhtml2pdf a veces ignora uno u otro).
        w_attr = _pt_to_px(w)
        h_attr = _pt_to_px(h)
        return (
            f'<div style="text-align:center;line-height:0;">'
            f'<img src="{html.escape(uri, quote=True)}" '
            f'width="{w_attr}" height="{h_attr}" '
            f'style="width:{w}pt;height:{h}pt;border:0;display:inline-block;" />'
            f"</div>"
        )
    return (
        f'<div style="border:0.5px dashed #94a3b8;min-height:{max(14, int(max_h_pt - 4))}pt;'
        f'padding:2px 1px;font-size:5pt;color:#94a3b8;text-align:center;">{ph}</div>'
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
    mismo patrón visual que Bitácora de Obra (logos compactos en pt).
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

    max_h = _LOGO_BOX_H_PT_COMPACT if compact else _LOGO_BOX_H_PT
    max_w = _LOGO_BOX_W_PT_COMPACT if compact else _LOGO_BOX_W_PT
    cell_c = _logo_cell_html(uris.get("logo_contratista") or "", "Contratista", max_h_pt=max_h, max_w_pt=max_w)
    cell_i = _logo_cell_html(uris.get("logo_interventoria") or "", "Interventoría", max_h_pt=max_h, max_w_pt=max_w)
    cell_e = _logo_cell_html(uris.get("logo_entidad") or "", "Entidad", max_h_pt=max_h, max_w_pt=max_w)

    title_fs = "8pt" if compact else "10pt"
    meta_fs = "5.5pt" if compact else "7pt"
    sub_html = ""
    if sub_esc:
        sub_html = (
            f'<div style="font-size:5.5pt;font-weight:600;color:#475569;margin-top:1px;line-height:1.2;">'
            f"{sub_esc}</div>"
        )
    gen_html = f"<br/><span style=\"font-size:{meta_fs};\"><b>Generado por:</b> {gen}</span>" if gen else ""

    # Columnas logo equilibradas con caja −40% (más aire al título).
    return f"""
<table width="100%" cellspacing="0" cellpadding="0"
  style="border-collapse:collapse;border:0.8pt solid #0f172a;margin:0 0 8px;background:#fff;">
  <tr>
    <td width="13%" style="padding:4px 3px;border-right:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_c}</td>
    <td width="13%" style="padding:4px 3px;border-right:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_i}</td>
    <td width="61%" style="padding:4px 8px;vertical-align:middle;background:#f1f5f9;">
      <div style="font-size:{title_fs};font-weight:bold;color:#0f172a;line-height:1.15;">{titulo_esc}</div>
      {sub_html}
      <div style="font-size:{meta_fs};color:#334155;margin-top:2px;line-height:1.25;">
        <b>Contrato N° {numero}</b>
        {(" · " + objeto) if objeto else ""}
      </div>
      <div style="font-size:{meta_fs};color:#475569;margin-top:1px;line-height:1.2;">
        {contratista} · {interventoria} · {entidad_txt}
      </div>
      {gen_html}
    </td>
    <td width="13%" style="padding:4px 3px;border-left:0.4pt solid #cbd5e1;vertical-align:middle;">{cell_e}</td>
  </tr>
</table>
"""
