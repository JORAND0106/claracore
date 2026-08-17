"""
PDF POS 80mm — Despachador (Disposición / Recibo de materiales), Almacén de Obra.
"""
from __future__ import annotations

import html
import io
import logging
from typing import Any, Dict, List, Optional, Sequence

from almacen_datetime import fmt_fecha_hora_entrada
from almacen_pos_pdf_common import (
    BODY_ANCHO_MM,
    PAGE_ANCHO_MM,
    estimate_copia_alto_mm,
    page_height_mm as _sum_copias_alto_mm,
    page_size_css,
)

_log = logging.getLogger(__name__)

# Reexport para tests legacy.
_PAGE_ANCHO_MM = PAGE_ANCHO_MM
_COPIA_ALTO_MM = 200  # solo referencia legacy; el alto real es dinámico

COPIAS_DISPOSICION: Sequence[str] = ("Transportador", "Escombrera", "Obra")
COPIAS_RECIBO: Sequence[str] = ("Transportador", "Obra")

COPY_ICON: Dict[str, str] = {
    "Transportador": "&#9670;",
    "Escombrera": "&#9679;",
    "Obra": "&#9650;",
}


def _estimate_entrada_copia_alto_mm(contrato: Dict[str, Any]) -> int:
    admins = contrato.get("administradores") or []
    return estimate_copia_alto_mm(
        objeto=str(contrato.get("objeto") or ""),
        n_admins=len(admins),
    )


def _page_height_mm(num_copias: int, copia_alto_mm: Optional[int] = None) -> int:
    """Alto total del rollo. Si no se pasa alto por copia, usa estimación base."""
    per = int(copia_alto_mm) if copia_alto_mm else estimate_copia_alto_mm()
    return _sum_copias_alto_mm([per] * max(1, int(num_copias)))


def _page_size(num_copias: int, copia_alto_mm: Optional[int] = None) -> str:
    return page_size_css(PAGE_ANCHO_MM, _page_height_mm(num_copias, copia_alto_mm))


def _pos_css(num_copias: int, copia_alto_mm: Optional[int] = None) -> str:
    page_size = _page_size(num_copias, copia_alto_mm)
    return f"""
@page {{ size: {page_size}; margin: 2mm 2.5mm; }}
body {{
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11.5pt;
  line-height: 1.2;
  color: #111;
  margin: 0;
  padding: 0;
  width: {BODY_ANCHO_MM}mm;
}}
.copy-block {{
  page-break-inside: avoid;
  margin: 0;
  padding: 0 0 2px;
  border-bottom: 2px dashed #666;
}}
.copy-block-last {{
  border-bottom: none;
  padding-bottom: 0;
}}
.copy-label {{
  text-align: center;
  font-weight: 700;
  font-size: 12.5pt;
  border: 2px solid #111;
  padding: 4px 6px;
  margin-bottom: 5px;
  text-transform: uppercase;
}}
.copy-icon {{
  display: inline-block;
  font-size: 14pt;
  line-height: 1;
  margin-right: 4px;
  vertical-align: middle;
}}
.copy-icon-transportador {{ color: #111; }}
.copy-icon-escombrera {{ color: #333; }}
.copy-icon-obra {{ color: #000; }}
.hdr {{ text-align: center; margin-bottom: 5px; border-bottom: 1px dashed #333; padding-bottom: 4px; }}
.hdr h1 {{ font-size: 13.5pt; margin: 0 0 2px; font-weight: 700; }}
.hdr p {{ margin: 1px 0; font-size: 10.5pt; word-break: break-word; }}
.hdr p.objeto {{ font-size: 8pt; }}
.title {{ text-align: center; font-weight: 700; font-size: 14pt; margin: 5px 0 4px; text-transform: uppercase; }}
.cantidad-hero {{
  text-align: center;
  font-weight: 800;
  font-size: 18pt;
  line-height: 1.15;
  margin: 5px 0 6px;
  padding: 5px 3px;
  border: 2px solid #111;
}}
.cantidad-hero .lbl {{
  display: block;
  font-size: 9.5pt;
  font-weight: 700;
  margin-bottom: 2px;
  text-transform: uppercase;
}}
.row-tbl {{ width: 100%; margin: 1px 0; font-size: 10.5pt; border-collapse: collapse; border: none; }}
.row-tbl td {{ vertical-align: top; padding: 0; border: none; }}
.row-tbl .lbl {{ font-weight: 600; width: 42%; }}
.row-tbl .val {{ text-align: right; width: 58%; word-break: break-word; }}
.sep-line {{ border: none; border-top: 1px dashed #666; height: 1px; margin: 3px 0; line-height: 0; font-size: 0; overflow: hidden; }}
.admin-block {{
  margin-top: 5px;
  padding-top: 3px;
  border-top: 1px dashed #666;
  font-size: 9.25pt;
  line-height: 1.2;
}}
.admin-title {{
  font-weight: 700;
  font-size: 9.75pt;
  margin-bottom: 2px;
  text-align: center;
}}
.admin-line {{ margin: 1px 0; word-break: break-word; text-align: center; }}
.footer {{ text-align: center; font-size: 9.5pt; color: #444; margin-top: 3px; }}
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


def _fmt_fecha_hora(created_at, fecha_entrada) -> str:
    return fmt_fecha_hora_entrada(created_at, fecha_entrada)


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


def _copy_icon_html(copy_label: str) -> str:
    sym = COPY_ICON.get(copy_label, "&#9671;")
    slug = copy_label.strip().lower().replace(" ", "-")
    return f'<span class="copy-icon copy-icon-{slug}">{sym}</span>'


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


def _row(lbl: str, val: str) -> str:
    return (
        f'<table class="row-tbl" width="100%" cellpadding="0" cellspacing="0">'
        f"<tr><td class=\"lbl\">{_esc(lbl)}</td><td class=\"val\">{val}</td></tr></table>"
    )


def _cantidad_hero(cant: str, unidad: str) -> str:
    return (
        f'<div class="cantidad-hero">'
        f'<span class="lbl">Cantidad</span>'
        f"{cant} {_esc(unidad)}"
        f"</div>"
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
    icon_html = _copy_icon_html(copy_label)
    admin_html = _administradores_html(contrato)
    fecha_hora = _fmt_fecha_hora(entrada.get("created_at"), entrada.get("fecha_entrada"))

    return f"""
<div class="{block_cls}">
  <div class="copy-label">{icon_html}Copia: {_esc(copy_label)}</div>{hdr_html}
  <div class="title">{_esc(doc_title)}</div>
  {_row("No. documento:", _esc(numero))}
  {_row("Fecha y hora:", fecha_hora)}
  {_sep()}
  {_row("Orden de compra:", f"#{_esc(oc_num)}")}
  {_row("Proveedor:", _esc(proveedor_nombre))}
  {_row("Insumo:", _esc(insumo_label))}
  {_cantidad_hero(cant, unidad)}
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
  {admin_html}
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
    """Genera PDF térmico 80 mm continuo: alto dinámico según contenido × N copias."""
    copias = _copias_por_tipo(tipo)
    doc_title = _titulo_documento(tipo)
    copia_alto = _estimate_entrada_copia_alto_mm(contrato)
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
        f"<style>{_pos_css(len(copias), copia_alto)}</style></head>"
        f"<body>{''.join(blocks)}</body></html>"
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
