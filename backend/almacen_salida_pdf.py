"""
PDF POS 80mm — Salida de material, Almacén de Obra (recibo con firma).
"""
from __future__ import annotations

import base64
import html
import io
import logging
from almacen_datetime import fmt_fecha_hora_bogota
from typing import Any, Dict, List, Optional, Sequence

_log = logging.getLogger(__name__)

_PAGE_ANCHO_MM = 80
_COPIA_ALTO_MM = 220

# Firma POS: 50% del tamaño base (28 mm × 14 mm) → 14 mm × 7 mm.
_FIRMA_W_MM = 14.0
_FIRMA_H_MM = 7.0


def _mm_to_pt(mm: float) -> float:
    return round(mm * 72.0 / 25.4, 2)


_FIRMA_W_PT = _mm_to_pt(_FIRMA_W_MM)
_FIRMA_H_PT = _mm_to_pt(_FIRMA_H_MM)

COPIAS_SALIDA: Sequence[str] = ("Obra", "Almacén")

COPY_ICON: Dict[str, str] = {
    "Obra": "&#9650;",
    "Almacén": "&#9670;",
}


def _page_size(num_copias: int) -> str:
    return f"{_PAGE_ANCHO_MM}mm {_COPIA_ALTO_MM * num_copias}mm"


def _pos_css(num_copias: int) -> str:
    page_size = _page_size(num_copias)
    return f"""
@page {{ size: {page_size}; margin: 2mm 3mm; }}
body {{
  font-family: Arial, Helvetica, sans-serif;
  font-size: 12.75pt;
  line-height: 1.22;
  color: #111;
  margin: 0;
  padding: 0;
  width: 74mm;
}}
.copy-block {{
  page-break-inside: avoid;
  margin: 0;
  padding: 0 0 3px;
  border-bottom: 2px dashed #666;
}}
.copy-block-last {{ border-bottom: none; padding-bottom: 0; }}
.copy-label {{
  text-align: center;
  font-weight: 700;
  font-size: 13.75pt;
  border: 2px solid #111;
  padding: 5px 7px;
  margin-bottom: 6px;
  text-transform: uppercase;
}}
.copy-icon {{
  display: inline-block;
  font-size: 16pt;
  line-height: 1;
  margin-right: 4px;
  vertical-align: middle;
}}
.hdr {{ text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #333; padding-bottom: 5px; }}
.hdr h1 {{ font-size: 14.75pt; margin: 0 0 3px; font-weight: 700; }}
.hdr p {{ margin: 1px 0; font-size: 11.75pt; word-break: break-word; }}
.hdr p.objeto {{ font-size: 8.25pt; }}
.title {{ text-align: center; font-weight: 700; font-size: 15.75pt; margin: 6px 0 5px; text-transform: uppercase; }}
.cantidad-hero {{
  text-align: center;
  font-weight: 800;
  font-size: 20pt;
  line-height: 1.15;
  margin: 6px 0 8px;
  padding: 6px 4px;
  border: 2px solid #111;
}}
.cantidad-hero .lbl {{
  display: block;
  font-size: 10.75pt;
  font-weight: 700;
  margin-bottom: 2px;
  text-transform: uppercase;
}}
.row-tbl {{ width: 100%; margin: 1px 0; font-size: 11.75pt; border-collapse: collapse; border: none; }}
.row-tbl td {{ vertical-align: top; padding: 0; border: none; }}
.row-tbl .lbl {{ font-weight: 600; width: 46%; }}
.row-tbl .val {{ text-align: right; width: 54%; word-break: break-word; }}
.sep-line {{ border: none; border-top: 1px dashed #666; height: 1px; margin: 4px 0; line-height: 0; font-size: 0; overflow: hidden; }}
.admin-block {{
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px dashed #666;
  font-size: 10.25pt;
  line-height: 1.25;
}}
.admin-title {{ font-weight: 700; font-size: 10.75pt; margin-bottom: 3px; text-align: center; }}
.admin-line {{ margin: 1px 0; word-break: break-word; text-align: center; }}
.firmas {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
.firmas td {{ width: 50%; vertical-align: top; padding: 2pt 4pt; text-align: center; }}
.firma-lbl {{ font-size: 9pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1pt; }}
.firma-img-cage {{ border-collapse: collapse; table-layout: fixed; margin: 0 auto 2pt; }}
.firma-img-cage td {{ overflow: hidden !important; padding: 0 !important; border: none; }}
.firma-line {{ border-top: 1px solid #111; margin: 0 4pt; padding-top: 3pt; font-size: 10pt; }}
.footer {{ text-align: center; font-size: 10.75pt; color: #444; margin-top: 4px; }}
"""


def _to_pdf_pos_bytes(html_doc: str) -> bytes:
    from xhtml2pdf import pisa

    buf = io.BytesIO()
    src = io.BytesIO(html_doc.encode("utf-8", errors="replace"))
    try:
        result = pisa.CreatePDF(src, dest=buf, encoding="utf-8")
    except Exception as exc:
        _log.exception("PDF Salida POS: %s", exc)
        raise ValueError("No se pudo generar el recibo térmico de salida.") from exc
    buf.seek(0)
    out = buf.read()
    if not out or getattr(result, "err", 0):
        raise ValueError("No se pudo generar el recibo de salida.")
    return out


def _esc(val) -> str:
    return html.escape(str(val or ""))


def _fmt_fecha_hora(raw) -> str:
    return fmt_fecha_hora_bogota(raw)


def _fmt_cant(v) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"{n:,.4f}".rstrip("0").rstrip(".").replace(",", ".")


def _resize_firma_bytes(raw: bytes) -> bytes:
    """Acota píxeles al tamaño de firma POS (xhtml2pdf no respeta max-width en CSS)."""
    try:
        from PIL import Image
    except ImportError:
        return raw
    try:
        max_w = max(16, int(_FIRMA_W_MM / 25.4 * 120))
        max_h = max(8, int(_FIRMA_H_MM / 25.4 * 120))
        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGBA") if im.mode in ("P", "RGBA", "LA") else im.convert("RGB")
            im.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            im.save(out, format="PNG", optimize=True)
            return out.getvalue()
    except Exception:
        return raw


def _bytes_to_firma_data_uri(raw: bytes, content_type: str = "image/png") -> str:
    resized = _resize_firma_bytes(raw)
    ct = (content_type or "image/png").split(";")[0].strip()
    if not ct.startswith("image/"):
        ct = "image/png"
    b64 = base64.b64encode(resized).decode("ascii")
    return f"data:{ct};base64,{b64}"


def _firma_imagen_data_uri(src: Optional[str]) -> str:
    if not src:
        return ""
    if str(src).startswith("data:image"):
        try:
            header, b64 = str(src).split(",", 1)
            ct = header.split(";")[0].replace("data:", "")
            raw = base64.b64decode(b64)
            return _bytes_to_firma_data_uri(raw, ct)
        except Exception:
            return str(src)
    try:
        import httpx

        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            r = client.get(str(src))
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "image/png").split(";")[0].strip()
            return _bytes_to_firma_data_uri(r.content, ct)
    except Exception:
        return ""


def _firma_img_cage_html(img_uri: str) -> str:
    h_pt = _FIRMA_H_PT
    w_pt = _FIRMA_W_PT
    img_style = (
        f"display:block;margin:0 auto;max-width:100%;width:auto;"
        f"height:{h_pt}pt;max-height:{h_pt}pt;border:0;padding:0;"
    )
    return (
        f'<table class="firma-img-cage" cellspacing="0" cellpadding="0" width="100%" '
        f'style="border-collapse:collapse;table-layout:fixed;margin:0 auto 2pt;max-width:{w_pt}pt;">'
        f'<tr><td style="height:{h_pt}pt;max-height:{h_pt}pt;min-height:{h_pt}pt;'
        f"overflow:hidden;vertical-align:middle;text-align:center;line-height:0;"
        f'font-size:0;padding:0;border:none;">'
        f'<img src="{img_uri}" alt="" style="{img_style}"/>'
        f"</td></tr></table>"
    )


def _firma_celda(lbl: str, nombre: str, firma_url: Optional[str]) -> str:
    img_uri = _firma_imagen_data_uri(firma_url)
    img_html = _firma_img_cage_html(img_uri) if img_uri else ""
    return (
        f"<td>"
        f'<div class="firma-lbl">{_esc(lbl)}</div>'
        f"{img_html}"
        f'<div class="firma-line">{_esc(nombre)}</div>'
        f"</td>"
    )


def _row(lbl: str, val: str) -> str:
    return (
        f'<table class="row-tbl" width="100%" cellpadding="0" cellspacing="0">'
        f"<tr><td class=\"lbl\">{_esc(lbl)}</td><td class=\"val\">{val}</td></tr></table>"
    )


def _sep() -> str:
    return '<div class="sep-line">&nbsp;</div>'


def _hdr_contrato_html(contrato: Dict[str, Any]) -> str:
    return f"""
  <div class="hdr">
    <h1>{_esc(contrato.get("numero") or contrato.get("id"))}</h1>
    <p><strong>{_esc(contrato.get("contratista"))}</strong></p>
    <p>NIT: {_esc(contrato.get("nit"))}</p>
    <p class="objeto">{_esc(contrato.get("objeto"))}</p>
  </div>"""


def _administradores_html(contrato: Dict[str, Any]) -> str:
    admins = contrato.get("administradores") or []
    if not admins:
        return ""
    lines = []
    for adm in admins:
        nom = _esc(adm.get("nombre"))
        email = _esc(adm.get("email"))
        lines.append(f'<p class="admin-line">{nom} · {email}</p>')
    return (
        f'<div class="admin-block">'
        f'<div class="admin-title">Contacto administradores del contrato</div>'
        f'{"".join(lines)}</div>'
    )


def _render_copia_html(
    *,
    copy_label: str,
    is_last: bool,
    contrato: Dict[str, Any],
    salida: Dict[str, Any],
    oc_num: str,
    insumo_label: str,
    presupuesto_label: str,
    unidad: str,
    receptor_nombre: str,
    receptor_firma: Optional[str],
    despachador_nombre: str,
    despachador_firma: Optional[str],
) -> str:
    block_cls = "copy-block copy-block-last" if is_last else "copy-block"
    icon = COPY_ICON.get(copy_label, "&#9671;")
    slug = copy_label.strip().lower().replace(" ", "-")
    cant = _fmt_cant(salida.get("cantidad_salida"))
    pk = salida.get("pk_id") or "—"
    tramo = salida.get("tramo") or "—"
    costado = salida.get("costado") or "—"
    abs_ini = salida.get("abscisa_inicial") or "—"
    abs_fin = salida.get("abscisa_final") or "—"
    obs = (salida.get("observaciones") or "").strip()
    numero = salida.get("codigo") or salida.get("numero_salida") or "—"
    fecha_hora = _fmt_fecha_hora(salida.get("fecha_hora_salida"))

    firmas = (
        f'<table class="firmas"><tr>'
        f"{_firma_celda('Recibe en obra', receptor_nombre, receptor_firma)}"
        f"{_firma_celda('Despacha', despachador_nombre, despachador_firma)}"
        f"</tr></table>"
    )

    obs_row = _row("Observaciones:", _esc(obs)) if obs else ""

    return f"""
<div class="{block_cls}">
  <div class="copy-label"><span class="copy-icon copy-icon-{slug}">{icon}</span>Copia: {_esc(copy_label)}</div>
  {_hdr_contrato_html(contrato)}
  <div class="title">Salida de material</div>
  {_row("No. salida:", f"#{_esc(numero)}")}
  {_row("Fecha y hora:", fecha_hora)}
  {_sep()}
  {_row("Orden de compra:", f"#{_esc(oc_num)}")}
  {_row("Insumo:", _esc(insumo_label))}
  {_row("Ítem presupuesto:", _esc(presupuesto_label))}
  <div class="cantidad-hero"><span class="lbl">Cantidad</span>{cant} {_esc(unidad)}</div>
  {_sep()}
  {_row("PK / Ubicación:", _esc(pk))}
  {_row("Tramo:", _esc(tramo))}
  {_row("Costado:", _esc(costado))}
  {_row("Absc. ini. / fin.:", f"{_esc(abs_ini)} → {_esc(abs_fin)}")}
  {obs_row}
  {firmas}
  {_administradores_html(contrato)}
  <div class="footer">ClaraCore · Almacén de Obra</div>
</div>"""


def generar_pdf_salida_pos(
    contrato: Dict[str, Any],
    salida: Dict[str, Any],
    oc_num: str,
    insumo_label: str,
    presupuesto_label: str,
    unidad: str,
    receptor_nombre: str,
    receptor_firma: Optional[str],
    despachador_nombre: str,
    despachador_firma: Optional[str],
) -> bytes:
    """PDF térmico 80 mm: 2 copias (Obra + Almacén), 220 mm c/u."""
    copias = list(COPIAS_SALIDA)
    blocks = [
        _render_copia_html(
            copy_label=label,
            is_last=(idx == len(copias) - 1),
            contrato=contrato,
            salida=salida,
            oc_num=oc_num,
            insumo_label=insumo_label,
            presupuesto_label=presupuesto_label,
            unidad=unidad,
            receptor_nombre=receptor_nombre,
            receptor_firma=receptor_firma,
            despachador_nombre=despachador_nombre,
            despachador_firma=despachador_firma,
        )
        for idx, label in enumerate(copias)
    ]
    html_doc = (
        f'<!DOCTYPE html><html><head><meta charset="utf-8"/>'
        f"<style>{_pos_css(len(copias))}</style></head><body>{''.join(blocks)}</body></html>"
    )
    return _to_pdf_pos_bytes(html_doc)
