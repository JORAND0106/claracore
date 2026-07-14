"""
Generación PDF — Orden de Compra (Almacén de Obra).
Formato estándar: encabezado contratista, bloques Para/Enviar a, tabla de insumos y firmas.
"""
from __future__ import annotations

import html
from datetime import date

from almacen_datetime import fmt_fecha_bogota, fmt_fecha_hora_bogota
from almacen_firma_pdf import firma_url_a_data_uri
from typing import Any, Dict, List, Optional

from topografia_utils import _html_logo_pdf, to_pdf_bytes

_COLOR_FRANJA = "#0e7490"
_COLOR_BORDE = "#cbd5e1"


def _esc(val) -> str:
    return html.escape(str(val or ""))


def _fmt_money(v) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"$ {n:,.0f}".replace(",", ".")


def _fmt_cant(v) -> str:
    try:
        n = float(v or 0)
    except (TypeError, ValueError):
        return "—"
    return f"{n:,.4f}".rstrip("0").rstrip(".").replace(",", ".")


def _fmt_fecha(raw) -> str:
    return fmt_fecha_bogota(raw)


def _fmt_fecha_ts(raw) -> str:
    if not raw:
        return "—"
    if "T" in str(raw):
        return fmt_fecha_hora_bogota(raw)
    return fmt_fecha_bogota(raw)


def _html_firma_oc_celda(lbl: str, nombre: str, fecha: str, firma_data_uri: str = "") -> str:
    """Columna de firma con imagen de perfil (mismo mecanismo que informes CCD)."""
    if firma_data_uri:
        img_html = (
            '<table cellspacing="0" cellpadding="0" width="100%" '
            'style="border-collapse:collapse;margin:0 8pt 4pt;table-layout:fixed;">'
            '<tr><td style="height:28pt;max-height:28pt;min-height:28pt;overflow:hidden;'
            'vertical-align:middle;text-align:center;line-height:0;font-size:0;padding:0;border:none;">'
            f'<img src="{firma_data_uri}" alt="" '
            'style="display:block;margin:0 auto;max-width:100%;width:auto;'
            'height:28pt;max-height:28pt;border:0;padding:0;"/>'
            "</td></tr></table>"
        )
    else:
        img_html = '<div style="height:28pt;"></div>'
    return (
        f"<td>"
        f'<div class="firma-lbl">{_esc(lbl)}</div>'
        f"{img_html}"
        f'<div class="firma-line">{_esc(nombre)}</div>'
        f'<div class="firma-fecha">Fecha: {_esc(fecha)}</div>'
        f"</td>"
    )


def _split_line_tax(unit_total: float, insumo: Optional[dict]) -> tuple[float, float, str]:
    """Separa base e impuesto cuando valor unitario incluye IVA/AIU."""
    insumo = insumo or {}
    tipo = (insumo.get("tipo_impuesto") or "").strip().lower()
    try:
        pct = float(insumo.get("impuesto_porcentaje") or 0)
    except (TypeError, ValueError):
        pct = 0.0
    if tipo in ("iva", "aiu") and pct > 0 and unit_total > 0:
        base = round(unit_total / (1 + pct / 100), 2)
        tax = round(unit_total - base, 2)
        label = "IVA" if tipo == "iva" else "AIU"
        return base, tax, f"{label} {pct:g}%"
    return unit_total, 0.0, ""


def _lineas_y_totales(
    items: List[dict],
    solicitud_items: Optional[Dict[int, dict]] = None,
    insumo_map: Optional[Dict[int, dict]] = None,
) -> tuple[str, dict]:
    rows = []
    subtotal = 0.0
    impuestos: Dict[str, float] = {}
    sol_map = solicitud_items or {}
    ins_map = insumo_map or {}

    for i, it in enumerate(items, start=1):
        sid = it.get("solicitud_item_id")
        sol_it = sol_map.get(int(sid)) if sid else {}
        ins_id = sol_it.get("insumo_id")
        insumo = ins_map.get(int(ins_id)) if ins_id else {}
        cant = float(it.get("cantidad") or 0)
        vu_total = float(it.get("valor_unitario") or 0)
        vu_base, tax_unit, tax_label = _split_line_tax(vu_total, insumo)
        line_sub = round(cant * vu_base, 2)
        line_tax = round(cant * tax_unit, 2)
        line_total = round(cant * vu_total, 2)
        subtotal += line_sub
        if tax_label:
            impuestos[tax_label] = impuestos.get(tax_label, 0.0) + line_tax

        desc = it.get("material_descripcion") or "—"
        pk = sol_it.get("pk_id")
        tramo = sol_it.get("tramo")
        extra = []
        if pk:
            extra.append(f"PK {pk}")
        if tramo:
            extra.append(str(tramo))
        if extra:
            desc = f"{desc} ({', '.join(extra)})"

        rows.append(
            f"<tr class=\"{'even' if i % 2 == 0 else ''}\">"
            f"<td class=\"num\">{_fmt_cant(cant)}</td>"
            f"<td>{_esc(it.get('unidad') or '')}</td>"
            f"<td>{_esc(desc)}</td>"
            f"<td class=\"num\">{_fmt_money(vu_base)}</td>"
            f"<td class=\"num\">{_fmt_money(line_total)}</td>"
            f"</tr>"
        )

    total_imp = sum(impuestos.values())
    grand = round(subtotal + total_imp, 2)
    imp_rows = ""
    for label, amt in sorted(impuestos.items()):
        if amt:
            imp_rows += (
                f"<tr><td colspan=\"4\" class=\"tot-lbl\">{ _esc(label) }</td>"
                f"<td class=\"num\">{_fmt_money(amt)}</td></tr>"
            )
    totales_html = f"""
<tr class="subtotal-row">
  <td colspan="4" class="tot-lbl">Subtotal</td>
  <td class="num">{_fmt_money(subtotal)}</td>
</tr>
{imp_rows}
<tr class="grand-row">
  <td colspan="4" class="tot-lbl">Total</td>
  <td class="num">{_fmt_money(grand)}</td>
</tr>"""
    return "\n".join(rows), {"rows_html": totales_html, "subtotal": subtotal, "total": grand}


def _bloque_para(proveedores: List[dict]) -> str:
    if not proveedores:
        return "—"
    if len(proveedores) == 1:
        p = proveedores[0]
        partes = [_esc(p.get("razon_social"))]
        if p.get("nit"):
            partes.append(f"NIT {_esc(p.get('nit'))}")
        for key in ("contacto_nombre", "contacto_email", "contacto_telefono"):
            if p.get(key):
                partes.append(_esc(p.get(key)))
        return "<br/>".join(partes)
    nombres = ", ".join(_esc(p.get("razon_social") or "—") for p in proveedores)
    return (
        f"{nombres}<br/>"
        f'<span style="font-size:7.5pt;color:#64748b;">Varios proveedores en esta orden</span>'
    )


def _bloque_enviar_a(contrato: dict, puntos: List[str], observaciones: str = "") -> str:
    lineas = [
        contrato.get("contratista") or contrato.get("numero"),
        contrato.get("objeto"),
    ]
    if puntos:
        lineas.append("Puntos: " + "; ".join(puntos[:8]))
        if len(puntos) > 8:
            lineas.append(f"(+{len(puntos) - 8} puntos más)")
    if observaciones:
        obs = observaciones.strip()
        if len(obs) > 200:
            obs = obs[:197] + "…"
        lineas.append(obs)
    return "<br/>".join(_esc(x) for x in lineas if x) or "—"


def _header_contratista(contrato: dict) -> str:
    logo = _html_logo_pdf(contrato, max_h=48, placeholder_pt=7)
    nombre = _esc(contrato.get("contratista") or "Contratista")
    nit = contrato.get("nit")
    nit_txt = f"NIT {_esc(nit)}" if nit else ""
    objeto = (contrato.get("objeto") or "").strip()
    contacto = "<br/>".join(x for x in [nit_txt, _esc(objeto) if objeto else ""] if x)
    return f"""
<table class="hdr">
  <tr>
    <td class="hdr-logo">{logo}</td>
    <td class="hdr-empresa">
      <div class="hdr-nombre">{nombre}</div>
      <div class="hdr-contacto">{contacto or "—"}</div>
    </td>
    <td class="hdr-oc">
      <div class="oc-label">Orden de compra</div>
      <div class="oc-numero">N.° {_esc(contrato.get('_numero_oc') or '—')}</div>
      <div class="oc-ref">Solicitud N.° {_esc(contrato.get('_numero_sol') or '—')}</div>
    </td>
  </tr>
</table>"""


def generar_pdf_orden_compra(
    *,
    contrato: dict,
    orden_compra: dict,
    solicitud: dict,
    aprobador_nombre: str = "—",
    aprobador_firma_url: Optional[str] = None,
    solicitante_firma_url: Optional[str] = None,
    proveedores: Optional[List[dict]] = None,
    insumo_map: Optional[Dict[int, dict]] = None,
    puntos_entrega: Optional[List[str]] = None,
    terminos: str = "",
) -> bytes:
    numero_oc = orden_compra.get("numero_oc") or "—"
    numero_sol = solicitud.get("consecutivo") or "—"
    contrato_hdr = dict(contrato)
    contrato_hdr["_numero_oc"] = numero_oc
    contrato_hdr["_numero_sol"] = numero_sol

    sol_items = {int(it["id"]): it for it in (solicitud.get("items") or []) if it.get("id")}
    lineas, _tot = _lineas_y_totales(
        orden_compra.get("items") or [],
        sol_items,
        insumo_map,
    )

    fecha_oc = _fmt_fecha_ts(orden_compra.get("created_at") or date.today().isoformat())
    solicitante = solicitud.get("solicitante_nombre") or "—"
    fecha_sol = _fmt_fecha_ts(solicitud.get("enviada_at") or solicitud.get("created_at"))
    fecha_apr = _fmt_fecha_ts(solicitud.get("validada_at") or orden_compra.get("created_at"))

    pk_tramos: List[str] = []
    seen = set()
    for it in solicitud.get("items") or []:
        pk = (it.get("pk_id") or "").strip()
        tramo = (it.get("tramo") or "").strip()
        if not pk and not tramo:
            continue
        key = f"{pk}|{tramo}"
        if key in seen:
            continue
        seen.add(key)
        if pk and tramo:
            pk_tramos.append(f"{pk} · {tramo}")
        elif pk:
            pk_tramos.append(pk)
        else:
            pk_tramos.append(tramo)

    punto_entrega = "; ".join(pk_tramos[:5]) if pk_tramos else "—"
    if len(pk_tramos) > 5:
        punto_entrega += f" (+{len(pk_tramos) - 5})"

    medio_envio = "Entrega en obra"
    if not terminos:
        terminos = (solicitud.get("observaciones") or "").strip() or "Según cotización y condiciones del proveedor."

    para_html = _bloque_para(proveedores or [])
    enviar_html = _bloque_enviar_a(
        contrato,
        puntos_entrega or pk_tramos,
        solicitud.get("observaciones") or "",
    )

    firma_sol_uri = firma_url_a_data_uri(solicitante_firma_url)
    firma_apr_uri = firma_url_a_data_uri(aprobador_firma_url)
    celda_sol = _html_firma_oc_celda("Solicitó requisición", solicitante, fecha_sol, firma_sol_uri)
    celda_apr = _html_firma_oc_celda("Aprobó y generó OC", aprobador_nombre, fecha_apr, firma_apr_uri)

    doc = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
@page {{ size: letter; margin: 1.1cm 1.3cm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #111827; line-height: 1.25; }}
.hdr {{ width: 100%; border-collapse: collapse; margin-bottom: 8pt; }}
.hdr td {{ vertical-align: top; padding: 2pt 4pt; }}
.hdr-logo {{ width: 18%; }}
.hdr-empresa {{ width: 42%; }}
.hdr-nombre {{ font-size: 11pt; font-weight: bold; color: #0f172a; }}
.hdr-contacto {{ font-size: 8pt; color: #475569; margin-top: 3pt; }}
.hdr-oc {{ width: 40%; text-align: right; }}
.oc-label {{ font-size: 9pt; text-transform: uppercase; color: #64748b; letter-spacing: 0.3pt; }}
.oc-numero {{ font-size: 16pt; font-weight: bold; color: {_COLOR_FRANJA}; margin-top: 2pt; }}
.oc-ref {{ font-size: 8pt; color: #64748b; margin-top: 2pt; }}
.blocks {{ width: 100%; border-collapse: collapse; margin-bottom: 8pt; }}
.blocks td {{ border: 1px solid {_COLOR_BORDE}; padding: 6pt 8pt; vertical-align: top; width: 50%; font-size: 8pt; }}
.block-lbl {{ font-size: 7.5pt; font-weight: bold; text-transform: uppercase; color: {_COLOR_FRANJA}; margin-bottom: 4pt; }}
.datos {{ width: 100%; border-collapse: collapse; margin-bottom: 8pt; font-size: 7.5pt; }}
.datos th {{ background: #f1f5f9; border: 1px solid {_COLOR_BORDE}; padding: 4pt 5pt; text-align: left; font-weight: bold; }}
.datos td {{ border: 1px solid {_COLOR_BORDE}; padding: 4pt 5pt; }}
.items {{ width: 100%; border-collapse: collapse; }}
.items th {{ background: {_COLOR_FRANJA}; color: #fff; padding: 4pt 5pt; font-size: 7.5pt; border: 1px solid {_COLOR_FRANJA}; }}
.items td {{ border: 1px solid {_COLOR_BORDE}; padding: 4pt 5pt; font-size: 8pt; }}
.items tr.even td {{ background: #f8fafc; }}
.items .num {{ text-align: right; white-space: nowrap; }}
.tot-lbl {{ text-align: right; font-weight: bold; }}
.subtotal-row td {{ background: #f1f5f9; }}
.grand-row td {{ font-weight: bold; background: #e2e8f0; font-size: 9pt; }}
.firmas {{ width: 100%; border-collapse: collapse; margin-top: 18pt; }}
.firmas td {{ width: 50%; vertical-align: top; padding: 4pt 12pt; text-align: center; }}
.firma-lbl {{ font-size: 7.5pt; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 2pt; }}
.firma-line {{ border-top: 1px solid #334155; margin: 0 8pt; padding-top: 4pt; font-size: 8pt; }}
.firma-fecha {{ font-size: 7.5pt; color: #64748b; margin-top: 2pt; }}
.footer {{ margin-top: 10pt; font-size: 7pt; color: #94a3b8; text-align: center; }}
</style></head><body>

{_header_contratista(contrato_hdr)}

<table class="blocks"><tr>
  <td><div class="block-lbl">Para</div>{para_html}</td>
  <td><div class="block-lbl">Enviar a</div>{enviar_html}</td>
</tr></table>

<table class="datos">
  <tr>
    <th>Fecha OC</th>
    <th>Solicitó</th>
    <th>Medio de envío</th>
    <th>Punto de entrega</th>
    <th>Términos y condiciones</th>
  </tr>
  <tr>
    <td>{_esc(fecha_oc)}</td>
    <td>{_esc(solicitante)}</td>
    <td>{_esc(medio_envio)}</td>
    <td>{_esc(punto_entrega)}</td>
    <td>{_esc(terminos[:120] + ('…' if len(terminos) > 120 else ''))}</td>
  </tr>
</table>

<table class="items">
  <thead><tr>
    <th style="width:9%">Cantidad</th>
    <th style="width:8%">Und.</th>
    <th style="width:45%">Descripción</th>
    <th style="width:19%">Precio unit.</th>
    <th style="width:19%">Total</th>
  </tr></thead>
  <tbody>
    {lineas}
    {_tot['rows_html']}
  </tbody>
</table>

<table class="firmas"><tr>
  {celda_sol}
  {celda_apr}
</tr></table>

<div class="footer">Documento generado por ClaraCore — Almacén de Obra · Contrato {_esc(contrato.get('numero') or '')}</div>
</body></html>"""
    pdf = to_pdf_bytes(doc, landscape=False)
    if not pdf or len(pdf) < 100:
        raise ValueError("No se pudo generar el PDF de la Orden de Compra.")
    return pdf
