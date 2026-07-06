"""
Generación PDF — orden de pago / corte de cobro (xhtml2pdf).
"""

from __future__ import annotations

import base64
import html
import logging
import os
from datetime import date
from typing import Any, Dict, Optional

from contrato_documentos_service import logo_claracore_path
from contrato_numero_letras import formato_pesos_cop
from topografia_utils import to_pdf_bytes

_log = logging.getLogger("claracore.contrato_orden_pago.pdf")

_LOGO_CLARACORE_ANCHO_PX = 90
_COLOR_FRANJA = "#0e7490"
_COLOR_FRANJA_TEXTO = "#ffffff"

_PAGE_CSS = """
@page { size: letter; margin: 1.1cm 1.4cm 1.3cm 1.4cm; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 8pt;
  color: #111827;
  line-height: 1.22;
}
.w100 { width: 100%; border-collapse: collapse; }
.hdr-logos td { vertical-align: middle; padding: 2pt 4pt; }
.franja {
  background: #0e7490;
  color: #fff;
  padding: 4pt 10pt;
  margin: 3pt 0 5pt 0;
}
.franja-titulo {
  font-size: 11pt;
  font-weight: bold;
  letter-spacing: 0.4pt;
  text-transform: uppercase;
  line-height: 1.15;
}
.franja-corte {
  font-size: 9pt;
  font-weight: bold;
  margin-top: 1pt;
  line-height: 1.15;
}
.meta-table { width: 100%; border-collapse: collapse; margin: 3pt 0 5pt 0; }
.meta-table td, .meta-table th {
  border: 1px solid #94a3b8;
  padding: 2.5pt 5pt;
  vertical-align: top;
  font-size: 7.5pt;
  line-height: 1.2;
}
.meta-lbl {
  width: 26%;
  background: #f1f5f9;
  font-weight: bold;
  color: #334155;
}
.cobro-table { width: 100%; border-collapse: collapse; margin: 3pt 0 6pt 0; }
.cobro-table th {
  background: #0e7490;
  color: #fff;
  padding: 3pt 5pt;
  font-size: 7.5pt;
  text-align: center;
  border: 1px solid #0e7490;
}
.cobro-table td {
  border: 1px solid #cbd5e1;
  padding: 3pt 5pt;
  font-size: 7.5pt;
  line-height: 1.2;
}
.cobro-table tr.even td { background: #f8fafc; }
.cobro-table .num { text-align: right; white-space: nowrap; }
.cobro-table .total-row td {
  font-weight: bold;
  background: #e2e8f0;
}
.firmas-table { width: 100%; border-collapse: collapse; margin-top: 6pt; }
.firma-col { width: 48%; vertical-align: top; padding: 3pt 8pt; }
.firma-titulo {
  font-weight: bold;
  font-size: 8pt;
  text-transform: uppercase;
  margin-bottom: 10pt;
}
.firma-linea { border-top: 1px solid #111; margin-bottom: 3pt; height: 1pt; }
.firma-datos { font-size: 7.5pt; line-height: 1.25; }
.doc-footer {
  font-size: 6.5pt;
  color: #64748b;
  text-align: center;
  border-top: 1px solid #cbd5e1;
  padding-top: 3pt;
  line-height: 1.25;
}
"""


class PDFOrdenPagoError(RuntimeError):
    pass


def _esc(s: Any) -> str:
    return html.escape(str(s or ""), quote=False)


def _fmt_fecha(d: date) -> str:
    meses = (
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def _logo_claracore_img() -> str:
    path = logo_claracore_path()
    if not os.path.isfile(path):
        return f'<span style="font-size:9pt;font-weight:bold;color:{_COLOR_FRANJA};">CLARACORE</span>'
    try:
        from PIL import Image

        with Image.open(path) as im:
            nat_w, nat_h = im.size
        escala = _LOGO_CLARACORE_ANCHO_PX / max(nat_w, 1)
        w_px = _LOGO_CLARACORE_ANCHO_PX
        h_px = max(1, int(round(nat_h * escala)))
        with open(path, "rb") as fh:
            b64 = base64.b64encode(fh.read()).decode("ascii")
        return (
            f'<img src="data:image/png;base64,{b64}" alt="ClaraCore" '
            f'width="{w_px}" height="{h_px}" '
            f'style="display:block;width:{w_px}px;height:{h_px}px;" />'
        )
    except OSError as exc:
        _log.warning("Logo ClaraCore orden pago: %s", exc)
        return f'<span style="font-size:9pt;font-weight:bold;color:{_COLOR_FRANJA};">CLARACORE</span>'


def _logo_receptor_img(url: Optional[str]) -> str:
    u = (url or "").strip()
    if not u:
        return "&nbsp;"
    if u.startswith("http://") or u.startswith("https://"):
        src = _esc(u)
        return (
            f'<img src="{src}" alt="" width="80" height="28" '
            f'style="display:block;margin-left:auto;width:80px;height:28px;object-fit:contain;" />'
        )
    return "&nbsp;"


def _fila_meta_html(etiqueta: str, valor_html: str) -> str:
    return (
        f'<tr><td class="meta-lbl">{_esc(etiqueta)}</td>'
        f"<td>{valor_html}</td></tr>"
    )


def _fila_meta(etiqueta: str, valor: str) -> str:
    return _fila_meta_html(etiqueta, _esc(valor))


def generar_pdf_orden_pago(
    *,
    numero_contrato: str,
    numero_corte: int,
    periodo_inicio: date,
    periodo_fin: date,
    fecha_emision: date,
    fecha_vencimiento: date,
    contrato_objeto: str,
    licenciatario: Dict[str, Any],
    empresa: Dict[str, Any],
    descripcion_servicio: str,
    montos: Dict[str, Any],
    iva_etiqueta: str,
    logo_receptor_url: str = "",
    autorizo_nombre: str = "",
    autorizo_cargo: str = "",
) -> bytes:
    emisor_lineas = [
        empresa.get("razon_social") or "",
        f"NIT {empresa.get('nit') or 'En trámite'}",
        empresa.get("direccion") or "",
        empresa.get("email") or "",
        empresa.get("telefono") or "",
    ]
    emisor_txt = " · ".join(x for x in emisor_lineas if x)

    receptor_lineas = [
        licenciatario.get("razon_social") or "",
        f"NIT {licenciatario.get('nit') or ''}",
        licenciatario.get("direccion") or "",
        licenciatario.get("email_notificaciones") or "",
    ]
    receptor_html = "<br/>".join(_esc(x) for x in receptor_lineas if x)
    emisor_html = "<br/>".join(_esc(x) for x in emisor_lineas if x)

    filas_cobro = [
        (
            descripcion_servicio,
            "1",
            montos["subtotal"],
            montos["subtotal"],
        ),
    ]
    cobro_rows = ""
    for i, (desc, cant, unit, sub) in enumerate(filas_cobro):
        cls = "even" if i % 2 == 0 else ""
        cobro_rows += f"""
<tr class="{cls}">
  <td>{_esc(desc)}</td>
  <td class="num">{_esc(cant)}</td>
  <td class="num">{_esc(formato_pesos_cop(unit))}</td>
  <td class="num">{_esc(formato_pesos_cop(sub))}</td>
</tr>"""

    iva_row = f"""
<tr class="even">
  <td colspan="3" style="text-align:right;font-weight:bold;">IVA { _esc(iva_etiqueta) }</td>
  <td class="num">{_esc(formato_pesos_cop(montos["iva_valor"]))}</td>
</tr>"""

    cartera = int(montos.get("saldo_cartera") or 0)
    total_filas = f"""
<tr class="total-row">
  <td colspan="3" style="text-align:right;">TOTAL A PAGAR</td>
  <td class="num">{_esc(formato_pesos_cop(montos["total"]))}</td>
</tr>"""
    if cartera > 0:
        total_filas += f"""
<tr class="even">
  <td colspan="3" style="text-align:right;font-style:italic;">Saldo pendiente cortes anteriores (informativo)</td>
  <td class="num">{_esc(formato_pesos_cop(cartera))}</td>
</tr>"""

    footer_empresa = " · ".join(
        x
        for x in [
            empresa.get("razon_social"),
            f"NIT {empresa.get('nit')}",
            empresa.get("direccion"),
            empresa.get("telefono"),
            empresa.get("email"),
        ]
        if x
    )
    footer_legal = (
        "Este documento no reemplaza la factura electrónica. "
        "Presentar para aprobación previa a facturación."
    )

    elaboro = [
        empresa.get("elaboro_nombre") or "",
        empresa.get("elaboro_cargo") or "",
        empresa.get("razon_social") or "",
    ]
    autorizo = [autorizo_nombre, autorizo_cargo]
    if not any(a.strip() for a in autorizo):
        autorizo = ["", "Interventoría / Supervisor del contrato"]

    html_doc = f"""<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><style>{_PAGE_CSS}</style></head>
<body>
<pdf:footer>
<div class="doc-footer">{_esc(footer_empresa)}<br/>{_esc(footer_legal)}</div>
</pdf:footer>

<table class="w100 hdr-logos">
  <tr>
    <td style="width:50%;text-align:left;">{_logo_claracore_img()}</td>
    <td style="width:50%;text-align:right;">{_logo_receptor_img(logo_receptor_url)}</td>
  </tr>
</table>

<div class="franja">
  <div class="franja-titulo">Orden de pago</div>
  <div class="franja-corte">Corte N.° {int(numero_corte):03d}</div>
</div>

<table class="meta-table">
  {_fila_meta("Número de contrato", numero_contrato)}
  {_fila_meta("Número de corte", f"{int(numero_corte):03d}")}
  {_fila_meta("Fecha de emisión", _fmt_fecha(fecha_emision))}
  {_fila_meta("Período de corte", f"{_fmt_fecha(periodo_inicio)} — {_fmt_fecha(periodo_fin)}")}
  {_fila_meta("Fecha de vencimiento", _fmt_fecha(fecha_vencimiento))}
  {_fila_meta_html("Emisor (facturador)", emisor_html)}
  {_fila_meta_html("Receptor (facturar a)", receptor_html)}
  {_fila_meta("Objeto del contrato", contrato_objeto)}
</table>

<table class="cobro-table">
  <tr>
    <th style="width:46%">Descripción</th>
    <th style="width:10%">Cant.</th>
    <th style="width:22%">Valor unitario</th>
    <th style="width:22%">Subtotal</th>
  </tr>
  {cobro_rows}
  {iva_row}
  {total_filas}
</table>

<table class="firmas-table"><tr>
  <td class="firma-col">
    <div class="firma-titulo">Elaboró</div>
    <div class="firma-linea">&nbsp;</div>
    <div class="firma-datos">{"<br/>".join(_esc(x) for x in elaboro if x)}</div>
  </td>
  <td class="firma-col">
    <div class="firma-titulo">Autorizó</div>
    <div class="firma-linea">&nbsp;</div>
    <div class="firma-datos">{"<br/>".join(_esc(x) for x in autorizo if x)}</div>
  </td>
</tr></table>

</body></html>"""

    try:
        pdf = to_pdf_bytes(html_doc, landscape=False)
    except Exception as exc:
        _log.exception("xhtml2pdf orden pago")
        raise PDFOrdenPagoError(str(exc)) from exc
    if not pdf or len(pdf) < 400:
        raise PDFOrdenPagoError("PDF generado inválido")
    return pdf
