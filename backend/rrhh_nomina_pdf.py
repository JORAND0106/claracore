"""PDF desprendible de nómina y documento de liquidación."""
from __future__ import annotations

import html
from datetime import date
from typing import Any, Dict, Optional

from contrato_numero_letras import formato_pesos_cop
from topografia_utils import to_pdf_bytes

_PAGE_CSS = """
@page { size: letter; margin: 1.4cm 1.6cm 1.8cm 1.6cm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #0f172a; }
h1 { font-size: 13pt; margin: 0 0 4pt 0; text-align: center; color: #0077B6; }
.sub { text-align: center; color: #64748b; font-size: 8.5pt; margin: 0 0 12pt 0; }
.meta { margin: 0 0 10pt 0; }
.meta td { padding: 2pt 8pt 2pt 0; vertical-align: top; }
table.grid { width: 100%; border-collapse: collapse; margin: 8pt 0; }
table.grid th, table.grid td {
  border: 1px solid #cbd5e1; padding: 4pt 6pt; text-align: left;
}
table.grid th { background: #e0f2fe; color: #0c4a6e; font-size: 8.5pt; }
table.grid td.num { text-align: right; white-space: nowrap; }
.totales { margin-top: 8pt; width: 55%; margin-left: auto; border-collapse: collapse; }
.totales td { padding: 3pt 6pt; }
.totales .lbl { color: #475569; }
.totales .val { text-align: right; font-weight: bold; }
.neto { background: #ecfdf5; }
.footer { margin-top: 14pt; font-size: 7.5pt; color: #64748b; text-align: center;
  border-top: 1px solid #e2e8f0; padding-top: 4pt; }
"""


def _esc(v: Any) -> str:
    return html.escape(str(v if v is not None else "—"))


def _cop(n: Any) -> str:
    try:
        return f"$ {formato_pesos_cop(float(n or 0))}"
    except Exception:
        return f"$ {n}"


def _fmt_fecha(d: Any) -> str:
    if not d:
        return "—"
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    s = str(d).strip()[:10]
    try:
        y, m, day = s.split("-")
        return f"{day}/{m}/{y}"
    except ValueError:
        return s


def build_desprendible_html(
    *,
    nomina: dict,
    item: dict,
    trabajador: Optional[dict] = None,
    contrato_label: str = "",
) -> str:
    det = item.get("detalle_json") or item.get("detalle") or {}
    if isinstance(det, str):
        import json
        try:
            det = json.loads(det)
        except Exception:
            det = {}
    nombre = (det.get("nombre")
              or (f"{(trabajador or {}).get('nombres') or ''} {(trabajador or {}).get('apellidos') or ''}".strip())
              or "—")
    doc = det.get("documento") or "—"
    periodo = f"{_fmt_fecha(nomina.get('fecha_inicio'))} — {_fmt_fecha(nomina.get('fecha_fin'))}"
    per_label = (nomina.get("periodicidad") or "").capitalize()
    if nomina.get("quincena"):
        per_label = f"Quincena {nomina.get('quincena')} · {nomina.get('mes')}/{nomina.get('anio')}"
    else:
        per_label = f"{per_label} · {nomina.get('mes')}/{nomina.get('anio')}"

    extras = (det.get("extras") or {}).get("por_tipo") or {}
    extras_rows = ""
    for tipo, info in extras.items():
        extras_rows += (
            f"<tr><td>{_esc(tipo.replace('_', ' ').title())}</td>"
            f"<td class='num'>{_esc(info.get('horas', 0))} h</td>"
            f"<td class='num'>{_esc(_cop(info.get('valor')))}</td></tr>"
        )
    if not extras_rows:
        extras_rows = "<tr><td colspan='3'>Sin horas extras / recargos / bonificaciones</td></tr>"

    novs = det.get("novedades") or []
    nov_rows = ""
    for n in novs:
        nov_rows += (
            f"<tr><td>{_esc(n.get('tipo'))}</td>"
            f"<td>{_esc(_fmt_fecha(n.get('fecha_inicio')))} – {_esc(_fmt_fecha(n.get('fecha_fin')))}</td>"
            f"<td class='num'>{_esc(n.get('dias'))} d</td>"
            f"<td class='num'>{_esc(_cop(n.get('descuento')))}</td></tr>"
        )
    if not nov_rows:
        nov_rows = "<tr><td colspan='4'>Sin novedades en el periodo</td></tr>"

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><style>{_PAGE_CSS}</style></head><body>
<h1>Desprendible de pago</h1>
<div class="sub">{_esc(contrato_label or 'ClaraCore')} · Nómina {_esc(per_label)}</div>
<table class="meta">
  <tr><td><b>Colaborador</b></td><td>{_esc(nombre)}</td>
      <td><b>Documento</b></td><td>{_esc(doc)}</td></tr>
  <tr><td><b>Cargo</b></td><td>{_esc(det.get('cargo') or (trabajador or {}).get('cargo_aspira'))}</td>
      <td><b>Periodo</b></td><td>{_esc(periodo)}</td></tr>
  <tr><td><b>EPS</b></td><td>{_esc(det.get('eps'))}</td>
      <td><b>Pensión</b></td><td>{_esc(det.get('pension'))}</td></tr>
</table>

<h2 style="font-size:10.5pt;color:#0077B6;margin:10pt 0 4pt;">Devengados</h2>
<table class="grid">
  <tr><th>Concepto</th><th class="num">Valor</th></tr>
  <tr><td>Salario del periodo</td><td class="num">{_esc(_cop(item.get('salario_periodo')))}</td></tr>
  <tr><td>(−) Descuento por novedades</td><td class="num">{_esc(_cop(item.get('descuento_novedades')))}</td></tr>
  <tr><td>Horas extras</td><td class="num">{_esc(_cop(item.get('valor_extras')))}</td></tr>
  <tr><td>Recargos</td><td class="num">{_esc(_cop(item.get('valor_recargos')))}</td></tr>
  <tr><td>Bonificaciones</td><td class="num">{_esc(_cop(item.get('valor_bonificaciones')))}</td></tr>
  <tr><td>Subsidio de transporte</td><td class="num">{_esc(_cop(item.get('subsidio_transporte')))}</td></tr>
  <tr><td><b>Total devengado</b></td><td class="num"><b>{_esc(_cop(item.get('total_devengado')))}</b></td></tr>
</table>

<h2 style="font-size:10.5pt;color:#0077B6;margin:10pt 0 4pt;">Detalle extras / recargos</h2>
<table class="grid">
  <tr><th>Tipo</th><th>Horas</th><th class="num">Valor</th></tr>
  {extras_rows}
</table>

<h2 style="font-size:10.5pt;color:#0077B6;margin:10pt 0 4pt;">Novedades</h2>
<table class="grid">
  <tr><th>Tipo</th><th>Fechas</th><th>Días</th><th class="num">Descuento</th></tr>
  {nov_rows}
</table>

<h2 style="font-size:10.5pt;color:#0077B6;margin:10pt 0 4pt;">Deducciones</h2>
<table class="grid">
  <tr><th>Concepto</th><th class="num">Valor</th></tr>
  <tr><td>Salud (4%)</td><td class="num">{_esc(_cop(item.get('deduccion_salud')))}</td></tr>
  <tr><td>Pensión (4%)</td><td class="num">{_esc(_cop(item.get('deduccion_pension')))}</td></tr>
  <tr><td>Fondo solidaridad pensional</td><td class="num">{_esc(_cop(item.get('deduccion_fsp')))}</td></tr>
  <tr><td><b>Total deducciones</b></td><td class="num"><b>{_esc(_cop(item.get('total_deducciones')))}</b></td></tr>
</table>

<table class="totales">
  <tr class="neto"><td class="lbl">Neto a pagar</td><td class="val">{_esc(_cop(item.get('neto_pagar')))}</td></tr>
</table>

<div class="footer">Documento generado automáticamente por ClaraCore · Recursos Humanos</div>
</body></html>"""


def build_desprendible_pdf(**kwargs) -> bytes:
    return to_pdf_bytes(build_desprendible_html(**kwargs))


def build_liquidacion_html(
    *,
    liquidacion: dict,
    trabajador: Optional[dict] = None,
    contrato_label: str = "",
) -> str:
    det = liquidacion.get("detalle_json") or liquidacion.get("detalle") or {}
    if isinstance(det, str):
        import json
        try:
            det = json.loads(det)
        except Exception:
            det = {}
    nombre = det.get("nombre") or (
        f"{(trabajador or {}).get('nombres') or ''} {(trabajador or {}).get('apellidos') or ''}".strip()
    ) or "—"
    doc = det.get("documento") or "—"
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><style>{_PAGE_CSS}</style></head><body>
<h1>Liquidación de contrato laboral</h1>
<div class="sub">{_esc(contrato_label or 'ClaraCore')}</div>
<table class="meta">
  <tr><td><b>Colaborador</b></td><td>{_esc(nombre)}</td>
      <td><b>Documento</b></td><td>{_esc(doc)}</td></tr>
  <tr><td><b>Fecha ingreso</b></td><td>{_esc(_fmt_fecha(det.get('fecha_ingreso')))}</td>
      <td><b>Fecha retiro</b></td><td>{_esc(_fmt_fecha(liquidacion.get('fecha_retiro')))}</td></tr>
  <tr><td><b>Causa</b></td><td colspan="3">{_esc(liquidacion.get('causa') or det.get('causa') or '—')}</td></tr>
</table>
<table class="grid">
  <tr><th>Concepto</th><th class="num">Valor</th></tr>
  <tr><td>Salario pendiente</td><td class="num">{_esc(_cop(liquidacion.get('salario_pendiente')))}</td></tr>
  <tr><td>Vacaciones no disfrutadas</td><td class="num">{_esc(_cop(liquidacion.get('vacaciones_dinero')))}</td></tr>
  <tr><td>Cesantías</td><td class="num">{_esc(_cop(liquidacion.get('cesantias')))}</td></tr>
  <tr><td>Intereses sobre cesantías</td><td class="num">{_esc(_cop(liquidacion.get('interes_cesantias')))}</td></tr>
  <tr><td>Prima proporcional</td><td class="num">{_esc(_cop(liquidacion.get('prima_proporcional')))}</td></tr>
  <tr><td>Indemnización</td><td class="num">{_esc(_cop(liquidacion.get('indemnizacion')))}</td></tr>
  <tr><td><b>Total liquidación</b></td><td class="num"><b>{_esc(_cop(liquidacion.get('total_liquidacion')))}</b></td></tr>
</table>
<div class="footer">Documento generado automáticamente por ClaraCore · Recursos Humanos</div>
</body></html>"""


def build_liquidacion_pdf(**kwargs) -> bytes:
    return to_pdf_bytes(build_liquidacion_html(**kwargs))
