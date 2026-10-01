"""
Informe Excel de Logs del Sistema (panel admin).

Reemplaza la exportación CSV plana: encabezado institucional (logo ClaraCore +
datos del contrato), bloque opcional del usuario filtrado, grilla filtrada y
gráfico de barras de actividad por día (openpyxl.chart.BarChart).
"""
from __future__ import annotations

import io
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

try:
    import pytz
except ImportError:  # pragma: no cover
    pytz = None

_TZ_BOGOTA = pytz.timezone("America/Bogota") if pytz else None

_FILL_HDR = PatternFill("solid", fgColor="0077B6")
_FILL_SECTION = PatternFill("solid", fgColor="E0F2FE")
_FILL_META = PatternFill("solid", fgColor="F0F9FF")
_FONT_HDR = Font(bold=True, color="FFFFFF", size=10)
_FONT_TITLE = Font(bold=True, size=14, color="0077B6")
_FONT_SECTION = Font(bold=True, size=11, color="0F2942")
_FONT_LABEL = Font(bold=True, size=9, color="4A7FA5")
_FONT_BODY = Font(size=9, color="0F2942")
_SIDE = Side(style="thin", color="BAE6FD")
_BORDER = Border(left=_SIDE, right=_SIDE, top=_SIDE, bottom=_SIDE)
_AL_CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
_AL_LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)

GRID_COLUMNS: Tuple[Tuple[str, str], ...] = (
    ("created_at", "Fecha"),
    ("usuario_nombre", "Usuario"),
    ("cargo_nombre", "Cargo"),
    ("rol_nombre", "Rol"),
    ("modulo", "Módulo"),
    ("accion", "Acción"),
    ("severidad", "Sever."),
    ("entidad", "Entidad"),
    ("contrato_numero", "Contrato"),
    ("ip", "IP"),
    ("resultado", "Resultado"),
)

_LOGO_BYTES: Optional[bytes] = None
_LOGO_RESOLVED = False


def _logo_claracore_bytes() -> Optional[bytes]:
    global _LOGO_BYTES, _LOGO_RESOLVED
    if _LOGO_RESOLVED:
        return _LOGO_BYTES
    _LOGO_RESOLVED = True
    base = Path(__file__).resolve().parent / "assets"
    for name in ("CLARA.CORE.png", "claracore-logo.png", "logo-claracore.png"):
        path = base / name
        if path.is_file():
            _LOGO_BYTES = path.read_bytes()
            return _LOGO_BYTES
    _LOGO_BYTES = None
    return None


def _parse_created_at(iso: Any) -> Optional[datetime]:
    if iso is None:
        return None
    s = str(iso).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        s = s.replace(" ", "T", 1) if " " in s and "T" not in s else s
        dt = datetime.fromisoformat(s)
    except Exception:
        return None
    if _TZ_BOGOTA is None:
        return dt
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    return dt.astimezone(_TZ_BOGOTA)


def format_log_fecha_bogota(iso: Any) -> str:
    dt = _parse_created_at(iso)
    if not dt:
        return "—" if iso in (None, "") else str(iso)
    return dt.strftime("%d/%m/%Y %I:%M:%S %p")


def day_key_bogota(iso: Any) -> Optional[str]:
    dt = _parse_created_at(iso)
    if not dt:
        return None
    return dt.strftime("%Y-%m-%d")


def aggregate_activity_by_day(rows: Sequence[Dict[str, Any]]) -> List[Tuple[str, int]]:
    """Cuenta eventos por día (Colombia), ordenados cronológicamente."""
    counts: Counter = Counter()
    for r in rows:
        key = day_key_bogota(r.get("created_at"))
        if key:
            counts[key] += 1
    return sorted(counts.items(), key=lambda x: x[0])


def _entidad_cell(row: Dict[str, Any]) -> str:
    tipo = (row.get("entidad_tipo") or "").strip()
    eid = row.get("entidad_id")
    if not tipo and eid in (None, ""):
        return "—"
    if eid in (None, ""):
        return tipo or "—"
    return f"{tipo} #{eid}" if tipo else str(eid)


def _cell_str(v: Any) -> str:
    if v is None or v == "":
        return "—"
    return str(v)


def _apply_header(
    ws,
    *,
    ncols: int,
    contrato_meta: Optional[Dict[str, str]],
    filtros_resumen: str,
    descargado_por: str,
    gen_ts: str,
) -> int:
    """Logo plataforma + datos contrato + meta de exportación. Devuelve primera fila libre."""
    ws.row_dimensions[1].height = 52
    ws.column_dimensions["A"].width = max(float(ws.column_dimensions["A"].width or 0), 16)

    logo_bytes = _logo_claracore_bytes()
    if logo_bytes:
        try:
            img = XLImage(io.BytesIO(logo_bytes))
            target_h = 44
            if img.height:
                img.width = int(img.width * (target_h / img.height))
            img.height = target_h
            ws.add_image(img, "A1")
        except Exception:
            ws.cell(row=1, column=1, value="ClaraCore").font = _FONT_TITLE
    else:
        ws.cell(row=1, column=1, value="ClaraCore").font = _FONT_TITLE

    if ncols > 1:
        ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=ncols)
    title = ws.cell(row=1, column=2, value="Informe de Logs del Sistema")
    title.font = _FONT_TITLE
    title.alignment = Alignment(horizontal="left", vertical="center")

    meta = contrato_meta or {}
    numero = (meta.get("numero") or "").strip() or "—"
    contratista = (meta.get("contratista") or "").strip() or "—"
    interventoria = (meta.get("interventoria") or "").strip() or "—"
    objeto = (meta.get("objeto") or "").strip() or "—"

    row = 2
    pairs = [
        ("Contrato", numero),
        ("Contratista", contratista),
        ("Interventoría", interventoria),
        ("Objeto", objeto),
        ("Filtros aplicados", filtros_resumen or "Sin filtros"),
        ("Generado", f"{gen_ts} · {descargado_por or 'Usuario'}"),
    ]
    for label, value in pairs:
        ws.row_dimensions[row].height = 18 if label != "Objeto" else 28
        c_lab = ws.cell(row=row, column=1, value=label)
        c_lab.font = _FONT_LABEL
        c_lab.fill = _FILL_META
        c_lab.border = _BORDER
        c_lab.alignment = _AL_LEFT
        if ncols > 1:
            ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=ncols)
        c_val = ws.cell(row=row, column=2, value=value)
        c_val.font = _FONT_BODY
        c_val.fill = _FILL_META
        c_val.border = _BORDER
        c_val.alignment = _AL_LEFT
        row += 1

    return row + 1


def _write_usuario_block(
    ws,
    start_row: int,
    ncols: int,
    usuario: Optional[Dict[str, Any]],
) -> int:
    if not usuario:
        return start_row
    ws.merge_cells(start_row=start_row, start_column=1, end_row=start_row, end_column=ncols)
    h = ws.cell(row=start_row, column=1, value="Usuario filtrado")
    h.font = _FONT_SECTION
    h.fill = _FILL_SECTION
    h.alignment = _AL_LEFT
    for col in range(1, ncols + 1):
        ws.cell(row=start_row, column=col).fill = _FILL_SECTION
        ws.cell(row=start_row, column=col).border = _BORDER

    fields = [
        ("Nombre", usuario.get("nombre") or "—"),
        ("Cargo", usuario.get("cargo") or "—"),
        ("Rol", usuario.get("rol") or "—"),
        ("Email", usuario.get("email") or "—"),
        ("Contrato", usuario.get("contrato_numero") or "—"),
        ("ID usuario", usuario.get("id") if usuario.get("id") is not None else "—"),
    ]
    r = start_row + 1
    for i in range(0, len(fields), 3):
        chunk = fields[i : i + 3]
        col = 1
        for label, value in chunk:
            lab = ws.cell(row=r, column=col, value=label)
            lab.font = _FONT_LABEL
            lab.border = _BORDER
            lab.fill = _FILL_META
            val = ws.cell(row=r, column=col + 1, value=str(value))
            val.font = _FONT_BODY
            val.border = _BORDER
            val.alignment = _AL_LEFT
            col += 2
        r += 1
    return r + 1


def _write_grid(ws, start_row: int, rows: Sequence[Dict[str, Any]]) -> int:
    ncols = len(GRID_COLUMNS)
    ws.merge_cells(start_row=start_row, start_column=1, end_row=start_row, end_column=ncols)
    title = ws.cell(
        row=start_row,
        column=1,
        value=f"Registros filtrados ({len(rows)})",
    )
    title.font = _FONT_SECTION
    title.fill = _FILL_SECTION
    for col in range(1, ncols + 1):
        ws.cell(row=start_row, column=col).fill = _FILL_SECTION
        ws.cell(row=start_row, column=col).border = _BORDER

    hdr_row = start_row + 1
    for ci, (_key, label) in enumerate(GRID_COLUMNS, start=1):
        cell = ws.cell(row=hdr_row, column=ci, value=label)
        cell.font = _FONT_HDR
        cell.fill = _FILL_HDR
        cell.border = _BORDER
        cell.alignment = _AL_CENTER
        ws.column_dimensions[get_column_letter(ci)].width = max(
            float(ws.column_dimensions[get_column_letter(ci)].width or 0),
            min(max(len(label) + 2, 10), 22),
        )

    data_row = hdr_row + 1
    if not rows:
        ws.merge_cells(start_row=data_row, start_column=1, end_row=data_row, end_column=ncols)
        empty = ws.cell(row=data_row, column=1, value="Sin registros con los filtros aplicados")
        empty.font = Font(italic=True, size=9, color="4A7FA5")
        empty.alignment = _AL_CENTER
        return data_row + 2

    for row in rows:
        for ci, (key, _label) in enumerate(GRID_COLUMNS, start=1):
            if key == "created_at":
                val = format_log_fecha_bogota(row.get("created_at"))
            elif key == "entidad":
                val = _entidad_cell(row)
            else:
                val = _cell_str(row.get(key))
            cell = ws.cell(row=data_row, column=ci, value=val)
            cell.font = _FONT_BODY
            cell.border = _BORDER
            cell.alignment = _AL_LEFT
        data_row += 1
    return data_row + 1


def _write_chart_block(
    ws,
    start_row: int,
    series: Sequence[Tuple[str, int]],
    *,
    accion_filtro: Optional[str],
    ncols: int,
) -> int:
    """Escribe tabla día/conteo y gráfico de barras. Devuelve última fila usada."""
    titulo = "Actividad por fecha"
    if accion_filtro:
        titulo = f"Actividad por fecha · acción {accion_filtro}"
    else:
        titulo = "Actividad por fecha · todas las acciones del filtro"

    ws.merge_cells(start_row=start_row, start_column=1, end_row=start_row, end_column=min(ncols, 4))
    h = ws.cell(row=start_row, column=1, value=titulo)
    h.font = _FONT_SECTION
    h.fill = _FILL_SECTION
    for col in range(1, min(ncols, 4) + 1):
        ws.cell(row=start_row, column=col).fill = _FILL_SECTION
        ws.cell(row=start_row, column=col).border = _BORDER

    table_hdr = start_row + 1
    c1 = ws.cell(row=table_hdr, column=1, value="Fecha")
    c2 = ws.cell(row=table_hdr, column=2, value="Eventos")
    for c in (c1, c2):
        c.font = _FONT_HDR
        c.fill = _FILL_HDR
        c.border = _BORDER
        c.alignment = _AL_CENTER

    if not series:
        empty_row = table_hdr + 1
        ws.cell(row=empty_row, column=1, value="Sin datos para graficar").font = Font(
            italic=True, size=9, color="4A7FA5"
        )
        return empty_row + 1

    data_start = table_hdr + 1
    r = data_start
    for day, count in series:
        d_cell = ws.cell(row=r, column=1, value=day)
        d_cell.font = _FONT_BODY
        d_cell.border = _BORDER
        n_cell = ws.cell(row=r, column=2, value=int(count))
        n_cell.font = _FONT_BODY
        n_cell.border = _BORDER
        n_cell.alignment = _AL_CENTER
        r += 1
    data_end = r - 1

    chart = BarChart()
    chart.type = "col"
    chart.style = 10
    chart.title = titulo
    chart.y_axis.title = "Eventos"
    chart.x_axis.title = "Fecha"
    chart.y_axis.majorGridlines = None
    data_ref = Reference(ws, min_col=2, min_row=table_hdr, max_row=data_end)
    cats_ref = Reference(ws, min_col=1, min_row=data_start, max_row=data_end)
    chart.add_data(data_ref, titles_from_data=True)
    chart.set_categories(cats_ref)
    chart.shape = 4
    chart.width = 18
    chart.height = 10
    # Anclar a la derecha de la tabla resumen
    ws.add_chart(chart, f"D{table_hdr}")
    return max(data_end, table_hdr + 18) + 1


def build_filtros_resumen(
    *,
    usuario_nombre: Optional[str] = None,
    modulo: Optional[str] = None,
    accion: Optional[str] = None,
    categoria: Optional[str] = None,
    severidad: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    excluir_rutina_auth: bool = False,
) -> str:
    parts: List[str] = []
    if usuario_nombre:
        parts.append(f"Usuario: {usuario_nombre}")
    if modulo:
        parts.append(f"Módulo: {modulo}")
    if accion:
        parts.append(f"Acción: {accion}")
    if categoria:
        parts.append(f"Categoría: {categoria}")
    if severidad:
        parts.append(f"Severidad: {severidad}")
    if fecha_desde or fecha_hasta:
        parts.append(f"Rango: {fecha_desde or '…'} → {fecha_hasta or '…'}")
    if excluir_rutina_auth and not accion:
        parts.append("Sin LOGIN/LOGIN_FAIL")
    return " · ".join(parts) if parts else "Sin filtros"


def build_logs_informe_xlsx(
    rows: Sequence[Dict[str, Any]],
    *,
    contrato_meta: Optional[Dict[str, str]] = None,
    usuario_filtrado: Optional[Dict[str, Any]] = None,
    filtros_resumen: str = "",
    accion_filtro: Optional[str] = None,
    descargado_por: str = "",
    gen_ts: Optional[str] = None,
) -> bytes:
    """
    Genera el .xlsx del informe de logs.

    Librería de gráfico: openpyxl.chart.BarChart (nativo OOXML, sin dependencias
    extra; mismo criterio que topografía/poligonales en el proyecto).
    """
    if gen_ts is None:
        if _TZ_BOGOTA:
            gen_ts = datetime.now(_TZ_BOGOTA).strftime("%d/%m/%Y %I:%M %p")
        else:
            gen_ts = datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC")

    wb = Workbook()
    ws = wb.active
    ws.title = "Logs"
    ws.sheet_view.showGridLines = False

    ncols = len(GRID_COLUMNS)
    next_row = _apply_header(
        ws,
        ncols=ncols,
        contrato_meta=contrato_meta,
        filtros_resumen=filtros_resumen,
        descargado_por=descargado_por,
        gen_ts=gen_ts,
    )
    next_row = _write_usuario_block(ws, next_row, ncols, usuario_filtrado)
    next_row = _write_grid(ws, next_row, rows)
    series = aggregate_activity_by_day(rows)
    _write_chart_block(
        ws,
        next_row,
        series,
        accion_filtro=(accion_filtro or "").strip() or None,
        ncols=ncols,
    )

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
