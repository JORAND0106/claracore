"""Exportación Excel — relación consolidada de nómina."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

_FILL_HDR = PatternFill("solid", fgColor="0077B6")
_FONT_HDR = Font(bold=True, color="FFFFFF", size=10)
_FONT_TITLE = Font(bold=True, size=14, color="0077B6")
_SIDE = Side(style="thin", color="CCCCCC")
_BORDER = Border(left=_SIDE, right=_SIDE, top=_SIDE, bottom=_SIDE)
_AL_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
_AL_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
_AL_RIGHT = Alignment(horizontal="right", vertical="center")
_BOGOTA = ZoneInfo("America/Bogota")

HEADERS = [
    "Documento",
    "Colaborador",
    "Cargo",
    "Salario base",
    "Salario periodo",
    "Horas extras",
    "Recargos",
    "Bonificaciones",
    "Descuento novedades",
    "Detalle novedades",
    "Subsidio transporte",
    "Total devengado",
    "Ded. salud",
    "Ded. pensión",
    "Ded. FSP",
    "Total deducciones",
    "Neto a pagar",
    "Aporte salud patronal",
    "Aporte pensión patronal",
    "ARL",
    "Caja compensación",
    "SENA",
    "ICBF",
    "Total aportes patronales",
    "Prov. cesantías",
    "Prov. interés cesantías",
    "Prov. prima",
    "Prov. vacaciones",
    "Total provisiones",
    "Email",
]


def _nov_detalle(item: dict) -> str:
    det = item.get("detalle_json") or {}
    if isinstance(det, str):
        return ""
    parts = []
    for n in det.get("novedades") or []:
        parts.append(
            f"{n.get('tipo')} {n.get('dias')}d ({n.get('fecha_inicio')}–{n.get('fecha_fin')})"
        )
    return "; ".join(parts)


def _nombre(item: dict, trabajadores_by_id: Dict[int, dict]) -> str:
    det = item.get("detalle_json") or {}
    if isinstance(det, dict) and det.get("nombre"):
        return det["nombre"]
    t = trabajadores_by_id.get(int(item.get("trabajador_id") or 0)) or {}
    return f"{t.get('nombres') or ''} {t.get('apellidos') or ''}".strip()


def _doc(item: dict, trabajadores_by_id: Dict[int, dict]) -> str:
    det = item.get("detalle_json") or {}
    if isinstance(det, dict) and det.get("documento"):
        return det["documento"]
    t = trabajadores_by_id.get(int(item.get("trabajador_id") or 0)) or {}
    return f"{t.get('tipo_documento') or 'CC'} {t.get('numero_documento') or ''}".strip()


def build_nomina_xlsx(
    nomina: dict,
    items: Sequence[dict],
    *,
    trabajadores: Optional[Sequence[dict]] = None,
    contrato_label: str = "",
) -> bytes:
    by_id = {int(t["id"]): t for t in (trabajadores or []) if t.get("id") is not None}
    wb = Workbook()
    ws = wb.active
    ws.title = "Nómina"

    per = nomina.get("periodicidad") or ""
    q = nomina.get("quincena")
    titulo = (
        f"Relación de nómina — {contrato_label or 'Contrato'} — "
        f"{per} {nomina.get('mes')}/{nomina.get('anio')}"
        + (f" Q{q}" if q else "")
    )
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(HEADERS))
    c = ws.cell(row=1, column=1, value=titulo)
    c.font = _FONT_TITLE
    generado = datetime.now(_BOGOTA).strftime("%d/%m/%Y %H:%M")
    ws.cell(
        row=2,
        column=1,
        value=(
            f"Periodo: {nomina.get('fecha_inicio')} — {nomina.get('fecha_fin')} · "
            f"Estado: {nomina.get('estado')} · Generado: {generado}"
        ),
    )

    hr = 4
    for col, h in enumerate(HEADERS, 1):
        cell = ws.cell(row=hr, column=col, value=h)
        cell.fill = _FILL_HDR
        cell.font = _FONT_HDR
        cell.alignment = _AL_CENTER
        cell.border = _BORDER

    money_cols = set(range(4, 30))  # mostly numeric from col 4

    for i, item in enumerate(items, hr + 1):
        tid = int(item.get("trabajador_id") or 0)
        t = by_id.get(tid) or {}
        det = item.get("detalle_json") or {}
        if not isinstance(det, dict):
            det = {}
        vals: List[Any] = [
            _doc(item, by_id),
            _nombre(item, by_id),
            det.get("cargo") or t.get("cargo_aspira") or "",
            float(item.get("salario_base") or 0),
            float(item.get("salario_periodo") or 0),
            float(item.get("valor_extras") or 0),
            float(item.get("valor_recargos") or 0),
            float(item.get("valor_bonificaciones") or 0),
            float(item.get("descuento_novedades") or 0),
            _nov_detalle(item),
            float(item.get("subsidio_transporte") or 0),
            float(item.get("total_devengado") or 0),
            float(item.get("deduccion_salud") or 0),
            float(item.get("deduccion_pension") or 0),
            float(item.get("deduccion_fsp") or 0),
            float(item.get("total_deducciones") or 0),
            float(item.get("neto_pagar") or 0),
            float(item.get("aporte_salud_patronal") or 0),
            float(item.get("aporte_pension_patronal") or 0),
            float(item.get("aporte_arl") or 0),
            float(item.get("aporte_caja") or 0),
            float(item.get("aporte_sena") or 0),
            float(item.get("aporte_icbf") or 0),
            float(item.get("total_aportes_patronales") or 0),
            float(item.get("prov_cesantias") or 0),
            float(item.get("prov_interes_cesantias") or 0),
            float(item.get("prov_prima") or 0),
            float(item.get("prov_vacaciones") or 0),
            float(item.get("total_provisiones") or 0),
            det.get("email") or t.get("email") or "",
        ]
        for col, v in enumerate(vals, 1):
            cell = ws.cell(row=i, column=col, value=v)
            cell.border = _BORDER
            cell.alignment = _AL_RIGHT if col in money_cols and col != 10 else _AL_LEFT

    for idx in range(1, len(HEADERS) + 1):
        ws.column_dimensions[get_column_letter(idx)].width = 16 if idx > 3 else 22
    ws.column_dimensions["J"].width = 36

    # Totales sheet summary row
    tot_row = hr + 1 + len(list(items))
    if items:
        ws.cell(row=tot_row, column=1, value="TOTALES").font = Font(bold=True)
        for col_idx, key in [
            (12, "total_devengado"),
            (16, "total_deducciones"),
            (17, "neto_pagar"),
            (24, "total_aportes_patronales"),
            (29, "total_provisiones"),
        ]:
            s = sum(float(it.get(key) or 0) for it in items)
            cell = ws.cell(row=tot_row, column=col_idx, value=s)
            cell.font = Font(bold=True)
            cell.border = _BORDER

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
