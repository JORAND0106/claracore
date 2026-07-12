"""
PDF POS 80mm — Despachador (Disposición / Recibo de materiales), Almacén de Obra.
"""
from __future__ import annotations

import base64
import html
import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Sequence

_log = logging.getLogger(__name__)

_PAGE_ANCHO_MM = 80
_COPIA_ALTO_MM = 200

COPIAS_DISPOSICION: Sequence[str] = ("Transportador", "Escombrera", "Obra")
COPIAS_RECIBO: Sequence[str] = ("Transportador", "Obra")


def _page_height_mm(num_copias: int) -> int:
    return _COPIA_ALTO_MM * num_copias


def _page_size(num_copias: int) -> str:
    return f"{_PAGE_ANCHO_MM}mm {_page_height_mm(num_copias)}mm"


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
.copy-block-last {{
  border-bottom: none;
  padding-bottom: 0;
}}
.copy-label {{
  text-align: center;
  font-weight: 700;
  font-size: 13.75pt;
  border: 2px solid #111;
  padding: 5px 7px;
  margin-bottom: 6px;
  text-transform: uppercase;
}}
.hdr {{ text-align: center; margin-bottom: 6px; border-bottom: 1px dashed #333; padding-bottom: 5px; }}
.hdr h1 {{ font-size: 14.75pt; margin: 0 0 3px; font-weight: 700; }}
.hdr p {{ margin: 1px 0; font-size: 11.75pt; word-break: break-word; }}
.hdr p.objeto {{ font-size: 8.25pt; }}
.qr-wrap {{ text-align: center; margin: 5px 0 3px; }}
.qr-wrap img {{ width: 26mm; height: 26mm; }}
.title {{ text-align: center; font-weight: 700; font-size: 15.75pt; margin: 6px 0 5px; text-transform: uppercase; }}
.row-tbl {{ width: 100%; margin: 1px 0; font-size: 11.75pt; border-collapse: collapse; border: none; }}
.row-tbl td {{ vertical-align: top; padding: 0; border: none; }}
.row-tbl .lbl {{ font-weight: 600; width: 46%; }}
.row-tbl .val {{ text-align: right; width: 54%; word-break: break-word; }}
.sep-line {{ border: none; border-top: 1px dashed #666; height: 1px; margin: 4px 0; line-height: 0; font-size: 0; overflow: hidden; }}
.footer {{ text-align: center; font-size: 10.75pt; color: #444; margin-top: 4px; }}
"""


def _to_pdf_pos_bytes(html_doc: str) -> bytes:
    """Genera PDF térmico 80 mm con xhtml2pdf."""
    from xhtml2pdf import pisa

    buf = io.BytesIO()
    src = io.BytesIO(html_doc.encode("utf-8", errors="replace"))
    try:
        result = pisa.CreatePDF(src, dest=buf, encoding="utf-8")
    except RuntimeError as exc:
        _log.exception("PDF Despachador POS: %s", exc)
        raise ValueError(
            "No se pudo generar el PDF para impresora térmica. "
            "Intente de nuevo; si persiste, contacte al administrador."
        ) from exc
    except Exception as exc:
        _log.exception("PDF Despachador POS: %s", exc)
        raise ValueError(
            "No se pudo generar el PDF. Verifique los datos e intente nuevamente."
        ) from exc

    buf.seek(0)
    out = buf.read()
    if not out or getattr(result, "err", 0):
        raise ValueError(
            "No se pudo generar el PDF. El documento quedó vacío o con errores de formato."
        )
    return out


def _esc(val) -> str:
    return html.escape(str(val or ""))


def _fmt_fecha(raw) -> str:
    if not raw:
        return "—"
    s = str(raw)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return s


def _fmt_cant(v) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"{n:,.4f}".rstrip("0").rstrip(".").replace(",", ".")


def _copias_por_tipo(tipo: str) -> List[str]:
    t = (tipo or "disposicion").strip().lower()
    if t == "recibo":
        return list(COPIAS_RECIBO)
    return list(COPIAS_DISPOSICION)


def _titulo_documento(tipo: str) -> str:
    t = (tipo or "disposicion").strip().lower()
    if t == "recibo":
        return "Recibo de materiales"
    return "Disposición de material"


def _build_qr_payload(contrato: Dict[str, Any]) -> str:
    """Texto plano temporal para validación de impresión/lectura en campo."""
    return "\n".join([
        f"Contrato: {contrato.get('numero') or contrato.get('id') or '—'}",
        f"Contratista: {contrato.get('contratista') or '—'}",
        f"Objeto: {contrato.get('objeto') or '—'}",
        f"Administrador: {contrato.get('administrador_nombre') or '—'}",
        f"Email: {contrato.get('administrador_email') or '—'}",
    ])


def _qr_data_uri(text: str) -> str:
    import qrcode
    from qrcode.constants import ERROR_CORRECT_M

    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=4,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _hdr_contrato_html(contrato: Dict[str, Any]) -> str:
    qr_src = _qr_data_uri(_build_qr_payload(contrato))
    return f"""
  <div class="hdr">
    <h1>{_esc(contrato.get("numero") or contrato.get("id"))}</h1>
    <p><strong>{_esc(contrato.get("contratista"))}</strong></p>
    <p>NIT: {_esc(contrato.get("nit"))}</p>
    <div class="qr-wrap"><img src="{qr_src}" alt="QR contrato"/></div>
    <p class="objeto">{_esc(contrato.get("objeto"))}</p>
  </div>"""


def _row(lbl: str, val: str) -> str:
    return (
        f'<table class="row-tbl" width="100%" cellpadding="0" cellspacing="0">'
        f"<tr><td class=\"lbl\">{_esc(lbl)}</td><td class=\"val\">{val}</td></tr></table>"
    )


def _sep() -> str:
    return '<div class="sep-line">&nbsp;</div>'


def _render_copia_html(
    *,
    copy_label: str,
    is_last: bool,
    doc_title: str,
    contrato: Dict[str, Any],
    entrada: Dict[str, Any],
    oc: Dict[str, Any],
    insumo_label: str,
    proveedor_nombre: str,
    usuario_nombre: str,
    unidad: str,
) -> str:
    numero = entrada.get("numero_documento") or "—"
    oc_num = oc.get("numero_oc") or "—"
    cant = _fmt_cant(entrada.get("cantidad_recibida"))
    pk = entrada.get("pk_id") or "—"
    tramo = entrada.get("tramo") or "—"
    costado = entrada.get("costado") or "—"
    abs_ini = entrada.get("abscisa_inicial") or "—"
    abs_fin = entrada.get("abscisa_final") or "—"
    placa = entrada.get("placa") or "—"
    transportador = entrada.get("transportador") or "—"
    block_cls = "copy-block copy-block-last" if is_last else "copy-block"
    hdr_html = _hdr_contrato_html(contrato)

    return f"""
<div class="{block_cls}">
  <div class="copy-label">Copia: {_esc(copy_label)}</div>{hdr_html}
  <div class="title">{_esc(doc_title)}</div>
  {_row("No. documento:", _esc(numero))}
  {_row("Fecha:", _fmt_fecha(entrada.get("fecha_entrada")))}
  {_sep()}
  {_row("Orden de compra:", f"#{_esc(oc_num)}")}
  {_row("Proveedor:", _esc(proveedor_nombre))}
  {_row("Insumo:", _esc(insumo_label))}
  {_row("Cantidad:", f"{cant} {_esc(unidad)}")}
  {_sep()}
  {_row("PK / Ubicación:", _esc(pk))}
  {_row("Tramo:", _esc(tramo))}
  {_row("Costado:", _esc(costado))}
  {_row("Absc. ini. / fin.:", f"{_esc(abs_ini)} → {_esc(abs_fin)}")}
  {_sep()}
  {_row("Placa:", _esc(placa))}
  {_row("Transportador:", _esc(transportador))}
  {_sep()}
  {_row("Registrado por:", _esc(usuario_nombre))}
  <div class="footer">ClaraCore · Almacén de Obra</div>
</div>"""


def generar_pdf_despachador_pos(
    tipo: str,
    contrato: Dict[str, Any],
    entrada: Dict[str, Any],
    oc: Dict[str, Any],
    insumo_label: str,
    proveedor_nombre: str,
    usuario_nombre: str,
    unidad: str = "",
) -> bytes:
    """Genera PDF térmico 80 mm continuo: 200 mm por copia (Disposición 600 mm, Recibo 400 mm)."""
    copias = _copias_por_tipo(tipo)
    doc_title = _titulo_documento(tipo)
    blocks = [
        _render_copia_html(
            copy_label=label,
            is_last=(idx == len(copias) - 1),
            doc_title=doc_title,
            contrato=contrato,
            entrada=entrada,
            oc=oc,
            insumo_label=insumo_label,
            proveedor_nombre=proveedor_nombre,
            usuario_nombre=usuario_nombre,
            unidad=unidad,
        )
        for idx, label in enumerate(copias)
    ]
    html_doc = (
        f'<!DOCTYPE html><html><head><meta charset="utf-8"/>'
        f"<style>{_pos_css(len(copias))}</style></head><body>{''.join(blocks)}</body></html>"
    )
    return _to_pdf_pos_bytes(html_doc)


def generar_pdf_disposicion_pos(
    contrato: Dict[str, Any],
    entrada: Dict[str, Any],
    oc: Dict[str, Any],
    insumo_label: str,
    proveedor_nombre: str,
    usuario_nombre: str,
    unidad: str = "",
) -> bytes:
    """Alias retrocompatible — genera PDF de Disposición con 3 copias."""
    return generar_pdf_despachador_pos(
        "disposicion",
        contrato,
        entrada,
        oc,
        insumo_label,
        proveedor_nombre,
        usuario_nombre,
        unidad,
    )
