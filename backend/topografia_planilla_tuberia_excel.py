"""
Exportación Excel (.xlsx) de Planillas de Tubería.

Fuente única en runtime: inventario JSON versionado.
Nunca abre el .xlsm original.
"""
from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

from openpyxl import Workbook
from openpyxl.cell.cell import MergedCell
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.chart.axis import ChartLines
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.image import Image
from openpyxl.drawing.line import LineProperties
from openpyxl.drawing.spreadsheet_drawing import AnchorMarker, TwoCellAnchor
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

_INVENTORY_CANDIDATES = (
    Path(__file__).resolve().parent
    / "data"
    / "planillas_tuberia"
    / "inventario_planilla_tuberia_xlsm.json",
    Path(__file__).resolve().parents[1]
    / "docs"
    / "topografia"
    / "planillas_tuberia"
    / "inventario_planilla_tuberia_xlsm.json",
)

TITULO_ALC = "PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS"
TITULO_FIL = "PLANILLA DE INSTALACIÓN DE FILTROS"
CODIGO_DOC = "INF-ING - TOP - 001 - V0"
CARTERA_FIRST = 17
CARTERA_LAST = 36

FILL_HDR = PatternFill("solid", fgColor="D9D9D9")
FILL_CALC = PatternFill("solid", fgColor="F2F2F2")
FILL_CANT = PatternFill("solid", fgColor="4472C4")
FILL_DESC = PatternFill("solid", fgColor="EA4296")
FILL_GRAF = PatternFill("solid", fgColor="BFBFBF")
FONT_HDR = Font(name="Arial", size=10, bold=True, color="FFFFFF")
FONT_LABEL = Font(name="Arial", size=10, bold=True)
FONT_TITLE = Font(name="Arial", size=14, bold=True)
THIN = Border(
    left=Side(style="thin", color="64748B"),
    right=Side(style="thin", color="64748B"),
    top=Side(style="thin", color="64748B"),
    bottom=Side(style="thin", color="64748B"),
)
MEDIUM = Border(
    left=Side(style="medium", color="334155"),
    right=Side(style="medium", color="334155"),
    top=Side(style="medium", color="334155"),
    bottom=Side(style="medium", color="334155"),
)

_MEDIA_DIR = Path(__file__).resolve().parent / "data" / "planillas_tuberia" / "media"
_SECCION_PNG = {
    "ALCANTARILLA": _MEDIA_DIR / "seccion_alcantarilla.png",
    "FILTRO": _MEDIA_DIR / "seccion_filtro.png",
}

# Anclas canónicas (inventario XLSM / layout_map). openpyxl usa índices 0-based.
# Imagen sección: L20:N40  → from (col=11,row=19) to (col=14,row=40)
SECCION_IMG_FROM = (11, 19)  # L20
SECCION_IMG_TO = (14, 40)    # esquina inferior-derecha (N40)
# Perfil: B52:N63 (debajo de Resumen/Descuentos en 43–51; encima de firmas en 64+)
# Nota: B43 es el título de Resumen de Cantidades — el chart NO debe empezar ahí.
PERFIL_CHART_FROM = (1, 51)  # B52
PERFIL_CHART_TO = (14, 63)   # N63
# Etiquetas de ejes del ScatterChart de perfil (inventario / layout_map).
PERFIL_X_AXIS_TITLE = "Abscisa (longitud de tramo)"
PERFIL_Y_AXIS_TITLE = "Cota (m)"
# Grilla del chart: tenue y delgada (no compite con series).
# w en EMUs; 12700 EMU ≈ 1 pt → ~0.5 pt.
PERFIL_GRID_LINE_WIDTH_EMU = 3175  # ~0.25 pt
PERFIL_GRID_LINE_COLOR = "E2E8F0"
# Celdas de resultado del panel gráfico que conservan cuadrícula/borde.
PANEL_RESULTADO_CELDAS = ("L18", "K23", "K30")
NO_BORDER = Border()


def _perfil_chart_gridlines() -> ChartLines:
    """Líneas de grilla mayor: gris claro y trazo fino."""
    return ChartLines(
        spPr=GraphicalProperties(
            ln=LineProperties(
                w=PERFIL_GRID_LINE_WIDTH_EMU,
                solidFill=PERFIL_GRID_LINE_COLOR,
            )
        )
    )


def _inventory_path() -> Path:
    for p in _INVENTORY_CANDIDATES:
        if p.exists():
            return p
    raise FileNotFoundError(
        "Inventario planilla tubería no encontrado "
        "(backend/data/planillas_tuberia/inventario_planilla_tuberia_xlsm.json). "
        "El exportador no usa el .xlsm en runtime."
    )


def _load_inventory() -> dict:
    return json.loads(_inventory_path().read_text(encoding="utf-8"))


def _meta(planilla: dict) -> dict:
    m = planilla.get("meta_cabecera") or {}
    return m if isinstance(m, dict) else {}


def _firmas(planilla: dict) -> dict:
    f = planilla.get("firmas") or {}
    return f if isinstance(f, dict) else {}


def _set(ws, addr: str, value: Any) -> None:
    cell = ws[addr]
    if isinstance(cell, MergedCell):
        for rng in ws.merged_cells.ranges:
            if rng.min_row <= cell.row <= rng.max_row and rng.min_col <= cell.column <= rng.max_col:
                ws.cell(row=rng.min_row, column=rng.min_col).value = value
                return
        return
    cell.value = value


def _style(ws, addr: str, *, fill=None, font=None, alignment=None, border=None) -> None:
    cell = ws[addr]
    if isinstance(cell, MergedCell):
        for rng in ws.merged_cells.ranges:
            if rng.min_row <= cell.row <= rng.max_row and rng.min_col <= cell.column <= rng.max_col:
                cell = ws.cell(row=rng.min_row, column=rng.min_col)
                break
        else:
            return
    if fill is not None:
        cell.fill = fill
    if font is not None:
        cell.font = font
    if alignment is not None:
        cell.alignment = alignment
    if border is not None:
        cell.border = border


def _apply_widths(ws, sheet_inv: dict) -> None:
    widths = sheet_inv.get("column_widths") or {}
    items = (
        widths.items()
        if isinstance(widths, dict)
        else [(w.get("letter") or w.get("col"), w) for w in widths]
    )
    for letter, info in items:
        if not letter:
            continue
        w = info.get("width") if isinstance(info, dict) else None
        if w:
            ws.column_dimensions[str(letter)].width = float(w)
        if isinstance(info, dict) and info.get("hidden"):
            ws.column_dimensions[str(letter)].hidden = True


def _apply_merges(ws, sheet_inv: dict) -> None:
    for m in sheet_inv.get("merged_cells") or []:
        try:
            ws.merge_cells(str(m))
        except Exception:
            continue


def _write_static_labels(ws) -> None:
    labels = {
        "B5": "Contratista:",
        "B6": "Interventoría:",
        "B7": "Apoyo a la Supervisión",
        "B8": "FECHA DE ELABORACIÓN",
        "G5": "INFORMACION DEL CONTRATO",
        "I10": "Abs Inicial",
        "J10": "Abs Final",
        "L10": "PK_ID",
        "M10": "Costado",
        "B12": "Abscisa Inicial",
        "C12": "Norte Abs Inicial",
        "D12": "Este Abs Incial",
        "E12": "Abscisa Final",
        "F12": "Norte Abs Final",
        "G12": "Este Abs Final",
        "I12": "θ TUBERÍA\n(Mts)",
        "J12": "ESP. TUBERÍA",
        "K12": "AREA TUBERÍA",
        "L12": "MATERIAL",
        "M12": "TIPO DE RED",
        "B14": "Area 1",
        "C14": "Area 2",
        "D14": "Altura Atraque",
        "E14": "Altura Relleno",
        "G14": "Anc. Excavación",
        "B16": "Abscisa",
        "C16": "Terreno Natural",
        "F16": "Cota Fondo Excavación",
        "G16": "Altura Excavacion",
        "H16": "Altura Triturado",
        "I16": "Altura Relleno",
        "J16": "Ancho Geotextil",
        "K16": "GRAFICO",
        "B43": "Resumen de Cantidades",
        "I43": "Descuentos Específicos",
        "A64": "Elaboró",
        "H64": "Aprobó:",
        "A66": "Topografo de Obra (Contratista)",
        "H66": "Topografo Interventoria",
    }
    for addr, text in labels.items():
        _set(ws, addr, text)
        _style(ws, addr, font=FONT_LABEL)
    _style(ws, "K16", fill=FILL_GRAF)
    for addr in ("B16", "C16", "F16", "G16", "H16", "I16", "J16"):
        _style(ws, addr, fill=FILL_HDR, border=THIN)
    for addr in ("G16", "H16", "I16", "J16"):
        _style(ws, addr, fill=FILL_CALC)


def _write_aux_feed(ws_aux, n_rows: int = 24) -> None:
    ws_aux["B3"] = "APOYO GRÁFICO PERFIL (no editar — se alimenta de planilla)"
    ws_aux["B4"] = "ABSCISA"
    ws_aux["C4"] = "=planilla!$C$16"
    ws_aux["D4"] = "=planilla!$E$16"
    ws_aux["E4"] = "=planilla!$F$16"
    for i in range(n_rows):
        r = 5 + i
        src = 17 + i
        ws_aux[f"B{r}"] = f'=IF(planilla!$B{src}="",NA(),planilla!$B{src})'
        ws_aux[f"C{r}"] = f'=IF(OR(planilla!$B{src}="",planilla!C{src}=""),NA(),planilla!C{src})'
        ws_aux[f"D{r}"] = f'=IF(OR(planilla!$B{src}="",planilla!E{src}=""),NA(),planilla!E{src})'
        ws_aux[f"E{r}"] = f'=IF(OR(planilla!$B{src}="",planilla!F{src}=""),NA(),planilla!F{src})'


def _add_profile_chart(ws_planilla, wb, *, tipo: str = "ALCANTARILLA") -> None:
    """ScatterChart de perfil anclado exactamente en B52:N63 (no invade firmas)."""
    aux_name = next((n for n in wb.sheetnames if n.lower().startswith("tbl_aux")), None)
    if not aux_name:
        return
    ws_planilla._charts = []
    chart = ScatterChart()
    chart.title = "Perfil Longitudinal de Tubería"
    chart.x_axis.title = PERFIL_X_AXIS_TITLE
    chart.y_axis.title = PERFIL_Y_AXIS_TITLE
    # ScatterChart: X abajo, Y izquierda (openpyxl deja ambos en "l" por defecto).
    chart.x_axis.axPos = "b"
    chart.y_axis.axPos = "l"
    # Grilla tenue/delgada en ambos ejes (sin minor gridlines).
    chart.x_axis.majorGridlines = _perfil_chart_gridlines()
    chart.y_axis.majorGridlines = _perfil_chart_gridlines()
    chart.x_axis.minorGridlines = None
    chart.y_axis.minorGridlines = None
    # Evitar estilo de tema Excel que fuerza grillas gruesas/oscuras.
    chart.style = None
    aux = wb[aux_name]
    xvalues = Reference(aux, min_col=2, min_row=5, max_row=28)
    titulo_nivel = "Terminado Filtro" if (tipo or "").upper() == "FILTRO" else "Cota Lomo"
    for col, title in (
        (3, "Terreno Natural"),
        (4, titulo_nivel),
        (5, "Cota Fondo Excavación"),
    ):
        yvalues = Reference(aux, min_col=col, min_row=5, max_row=28)
        chart.series.append(Series(yvalues, xvalues, title=title))
    # TwoCellAnchor: tamaño = rango de celdas (evita height/width sueltos que cruzaban firmas).
    c0, r0 = PERFIL_CHART_FROM
    c1, r1 = PERFIL_CHART_TO
    chart.anchor = TwoCellAnchor(
        _from=AnchorMarker(col=c0, colOff=0, row=r0, rowOff=0),
        to=AnchorMarker(col=c1, colOff=0, row=r1, rowOff=0),
        editAs="twoCell",
    )
    ws_planilla.add_chart(chart)


def _side(style: str, color: str = "64748B") -> Side:
    return Side(style=style, color=color)


def _border_box(
    ws,
    min_row: int,
    max_row: int,
    min_col: int,
    max_col: int,
    *,
    edge: Border = MEDIUM,
    inner: Border = THIN,
) -> None:
    """Marco exterior más grueso + separadores finos internos (estilo plantilla)."""
    for r in range(min_row, max_row + 1):
        for c in range(min_col, max_col + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = Border(
                left=edge.left if c == min_col else inner.left,
                right=edge.right if c == max_col else inner.right,
                top=edge.top if r == min_row else inner.top,
                bottom=edge.bottom if r == max_row else inner.bottom,
            )


def _border_box_outer_only(
    ws,
    min_row: int,
    max_row: int,
    min_col: int,
    max_col: int,
    *,
    edge: Border = MEDIUM,
) -> None:
    """Solo marco exterior (sin cuadrícula interna)."""
    for r in range(min_row, max_row + 1):
        for c in range(min_col, max_col + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = Border(
                left=edge.left if c == min_col else None,
                right=edge.right if c == max_col else None,
                top=edge.top if r == min_row else None,
                bottom=edge.bottom if r == max_row else None,
            )


def _clear_borders_range(ws, min_row: int, max_row: int, min_col: int, max_col: int) -> None:
    for r in range(min_row, max_row + 1):
        for c in range(min_col, max_col + 1):
            ws.cell(row=r, column=c).border = NO_BORDER


_EPS_CANTIDAD_EXCEL = 1e-9


def _excel_cantidad_no_cero(v: Any) -> bool:
    """True si la cantidad calculada es distinta de cero (misma semántica que SICOE)."""
    try:
        if v is None or v == "":
            return False
        return abs(float(v)) > _EPS_CANTIDAD_EXCEL
    except (TypeError, ValueError):
        return False


def _netos_visibles_excel(calculo: Optional[dict]) -> list[dict]:
    out: list[dict] = []
    for n in (calculo or {}).get("netos") or []:
        if not isinstance(n, dict):
            continue
        cod = str(n.get("codigo") or "").strip()
        if not cod:
            continue
        cant = n.get("neto")
        if cant is None:
            cant = n.get("cantidad")
        if not _excel_cantidad_no_cero(cant):
            continue
        out.append(n)
    return out


def _descuentos_visibles_excel(calculo: Optional[dict]) -> list[dict]:
    out: list[dict] = []
    for d in (calculo or {}).get("descuentos") or []:
        if not isinstance(d, dict) or not d.get("nombre"):
            continue
        if not _excel_cantidad_no_cero(d.get("cantidad")):
            continue
        out.append(d)
    return out


def _notas_planilla_para_excel(calculo: Optional[dict], planilla: Optional[dict]) -> list[str]:
    """Notas dinámicas (descuento altura) + notas manuales de meta_cabecera."""
    lines: list[str] = []
    seen: set[str] = set()
    for n in (calculo or {}).get("notas_descuento_altura") or []:
        txt = str(n or "").strip()
        if txt and txt not in seen:
            seen.add(txt)
            lines.append(txt)
    for d in (calculo or {}).get("descuentos_altura_detalle") or []:
        if not isinstance(d, dict):
            continue
        txt = str(d.get("nota") or "").strip()
        if txt and txt not in seen:
            seen.add(txt)
            lines.append(txt)
    meta = (planilla or {}).get("meta_cabecera") if isinstance(planilla, dict) else {}
    if isinstance(meta, dict):
        manual = meta.get("notas") or meta.get("notas_planilla")
        if isinstance(manual, list):
            for n in manual:
                txt = str(n or "").strip()
                if txt and txt not in seen:
                    seen.add(txt)
                    lines.append(txt)
        elif isinstance(manual, str) and manual.strip():
            for part in manual.replace("\r\n", "\n").split("\n"):
                txt = part.strip()
                if txt and txt not in seen:
                    seen.add(txt)
                    lines.append(txt)
    return lines


def _write_bloque_notas(
    ws,
    *,
    calculo: Optional[dict],
    planilla: Optional[dict],
    after_row: int,
) -> int:
    """
    Bloque «Notas» entre tablas de cantidades y firmas (fila 64).
    Reserva varias filas para notas dinámicas y futuras anotaciones manuales.
    """
    start = max(int(after_row or 51) + 2, 53)
    max_start = 56
    start = min(start, max_start)
    end = 63
    if end < start:
        end = start

    notas = _notas_planilla_para_excel(calculo, planilla)
    _set(ws, f"A{start}", "Notas")
    _style(ws, f"A{start}", font=FONT_LABEL, fill=FILL_HDR, border=THIN)
    try:
        ws.merge_cells(start_row=start, start_column=1, end_row=start, end_column=14)
    except Exception:
        pass

    cuerpo = "\n".join(f"• {n}" for n in notas) if notas else ""
    body_row = start + 1
    body_end = end
    _set(ws, f"A{body_row}", cuerpo)
    try:
        ws.merge_cells(
            start_row=body_row, start_column=1, end_row=body_end, end_column=14,
        )
    except Exception:
        pass
    cell = ws.cell(row=body_row, column=1)
    cell.alignment = Alignment(wrap_text=True, vertical="top", horizontal="left")
    cell.font = Font(name="Arial", size=9)
    for r in range(body_row, body_end + 1):
        for c in range(1, 15):
            coord = ws.cell(row=r, column=c).coordinate
            _style(ws, coord, border=THIN)
        ws.row_dimensions[r].height = 18
    _border_box(ws, start, body_end, 1, 14)
    return body_end


def _clear_tabla_cantidades_descuentos(ws, first_row: int = 45, last_row: int = 70) -> None:
    for r in range(first_row, last_row + 1):
        for col in ("B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"):
            cell = ws[f"{col}{r}"]
            if isinstance(cell, MergedCell):
                continue
            cell.value = None


def _set_nombre_item_cantidad(ws, row: int, nombre: Any, unidad: Any = None) -> None:
    """Escribe el ítem en B{row}. B:C suele estar mergeado: no pisar el nombre con la unidad."""
    _set(ws, f"B{row}", nombre)
    cell_c = ws[f"C{row}"]
    if isinstance(cell_c, MergedCell):
        return
    if unidad is not None:
        _set(ws, f"C{row}", unidad)


def _set_nombre_item_descuento(ws, row: int, nombre: Any) -> None:
    """Escribe el ítem de descuento en I{row} (I:J mergeado en plantilla)."""
    _set(ws, f"I{row}", nombre)


def _style_fila_cantidad(ws, r: int) -> None:
    for col in ("B", "C", "D", "E", "F", "G", "H"):
        _style(ws, f"{col}{r}", border=THIN)


def _style_fila_descuento(ws, r: int) -> None:
    for col in ("I", "J", "K", "L", "M", "N"):
        _style(ws, f"{col}{r}", border=THIN)


def _write_descuento_fila_formula(ws, r: int, codigo: str, es_alc: bool) -> None:
    """Fórmulas vivas de descuentos conocidos (Area1/Area2 / Tubería Filtro)."""
    cod = str(codigo or "").upper()
    if es_alc and cod == "DESC_A1":
        _set(ws, f"K{r}", "=$B$41")
        _set(ws, f"M{r}", "=$B$15")
        _set(ws, f"N{r}", f"=PRODUCT(K{r}:M{r})")
    elif es_alc and cod == "DESC_A2":
        _set(ws, f"K{r}", "=$B$41")
        _set(ws, f"M{r}", "=$C$15")
        _set(ws, f"N{r}", f"=PRODUCT(K{r}:M{r})")
    elif (not es_alc) and cod == "DESC_TUB_FILT":
        _set(ws, f"K{r}", "=$B$41")
        _set(ws, f"M{r}", "=$K$13")
        _set(ws, f"N{r}", f"=PRODUCT(K{r}:M{r})")


def _write_resumen_fila_formulas(
    ws,
    r: int,
    codigo: str,
    *,
    es_alc: bool,
    desc_row_by_cod: dict[str, int],
    exc_row: Optional[int],
) -> None:
    """Fórmulas vivas de Resumen según código; G enlaza N del descuento visible."""
    cod = str(codigo or "").upper()

    def _g_ref(*codigos: str) -> Any:
        for c in codigos:
            rr = desc_row_by_cod.get(c)
            if rr:
                return f"=N{rr}"
        return 0

    d_from_exc = f"=D{exc_row}" if exc_row else "=B41"
    e_from_exc = f"=E{exc_row}" if exc_row else "=G15"

    if cod == "EXC":
        _set(ws, f"D{r}", "=B41")
        _set(ws, f"E{r}", "=G15")
        _set(ws, f"F{r}", "=IFERROR(G41,0)")
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
    elif cod == "TUB":
        _set(ws, f"D{r}", d_from_exc)
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
    elif cod == "TRI":
        _set(ws, f"D{r}", d_from_exc)
        _set(ws, f"E{r}", e_from_exc)
        _set(ws, f"F{r}", "=IFERROR(H41,0)")
        _set(ws, f"G{r}", _g_ref("DESC_A1", "DESC_TUB_FILT"))
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)-G{r}")
    elif cod == "REL":
        _set(ws, f"D{r}", d_from_exc)
        _set(ws, f"E{r}", e_from_exc)
        _set(ws, f"F{r}", "=IFERROR(I41,0)")
        _set(ws, f"G{r}", _g_ref("DESC_A2") if es_alc else 0)
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
    elif cod == "GEO":
        _set(ws, f"D{r}", d_from_exc)
        # FILTRO: ancho = prom geotextil (J41) + traslapo (F15). ALC: solo J41.
        _set(ws, f"E{r}", "=IFERROR(J41,0)+IFERROR($F$15,0)" if not es_alc else "=J41")
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
    elif cod == "OTROS" or cod.startswith("OTROS_"):
        _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")


def _write_tablas_cantidades_descuentos_plantilla(ws, *, es_alc: bool) -> None:
    """Layout fijo (plantilla vacía / sin lista netos): filas 45–51 + descuentos por tipo."""
    from topografia_planilla_tuberia import nombre_triturado_por_tipo
    tri_nombre = nombre_triturado_por_tipo("ALCANTARILLA" if es_alc else "FILTRO")
    for row, name, und in (
        (45, "Excavación Varias", "m³"),
        (46, "Long Tubería", "ml"),
        (47, tri_nombre, "m³"),
        (48, "Relleno Gran.", "m³"),
        (49, "Geotextil", "m²"),
        (50, "Excavación Roca", "m³"),
        (51, "Otros: ____", "m³"),
    ):
        _set_nombre_item_cantidad(ws, row, name, und)

    _set(ws, "D45", "=B41")
    _set(ws, "E45", "=G15")
    _set(ws, "F45", "=IFERROR(G41,0)")
    _set(ws, "H45", "=ROUND(PRODUCT(D45:F45),2)")
    _set(ws, "D46", "=D45")
    _set(ws, "H46", "=ROUND(PRODUCT(D46:F46),2)")
    _set(ws, "D47", "=D45")
    _set(ws, "E47", "=E45")
    _set(ws, "F47", "=IFERROR(H41,0)")
    _set(ws, "G47", "=N46" if es_alc else "=N45")
    _set(ws, "H47", "=ROUND(PRODUCT(D47:F47),2)-G47")
    _set(ws, "D48", "=D45")
    _set(ws, "E48", "=E45")
    _set(ws, "F48", "=IFERROR(I41,0)")
    _set(ws, "G48", "=N47" if es_alc else 0)
    _set(ws, "H48", "=ROUND(PRODUCT(D48:F48),2)")
    _set(ws, "D49", "=D45")
    _set(ws, "E49", "=IFERROR(J41,0)+IFERROR($F$15,0)" if not es_alc else "=J41")
    _set(ws, "H49", "=ROUND(PRODUCT(D49:F49),2)")
    _set(ws, "D50", "=D45")
    _set(ws, "E50", "=E45")
    _set(ws, "F50", 0.05)
    _set(ws, "H50", "=ROUND(PRODUCT(D50:F50),2)")
    _set(ws, "H51", "=ROUND(PRODUCT(D51:F51),2)")

    if es_alc:
        _set(ws, "I45", "")
        _set(ws, "K45", "")
        _set(ws, "M45", "")
        _set(ws, "N45", "")
        _set_nombre_item_descuento(ws, 46, "Area 1")
        _set(ws, "K46", "=$B$41")
        _set(ws, "M46", "=$B$15")
        _set(ws, "N46", "=PRODUCT(K46:M46)")
        _set_nombre_item_descuento(ws, 47, "Area 2")
        _set(ws, "K47", "=$B$41")
        _set(ws, "M47", "=$C$15")
        _set(ws, "N47", "=PRODUCT(K47:M47)")
    else:
        _set_nombre_item_descuento(ws, 45, "Tubería Filtro")
        _set(ws, "K45", "=$B$41")
        _set(ws, "M45", "=$K$13")
        _set(ws, "N45", "=PRODUCT(K45:M45)")
        _set(ws, "I46", "")
        _set(ws, "K46", "")
        _set(ws, "M46", "")
        _set(ws, "N46", "")
        _set(ws, "I47", "")
        _set(ws, "K47", "")
        _set(ws, "M47", "")
        _set(ws, "N47", "")
    _set_nombre_item_descuento(ws, 48, "Otros")


def _overlay_valores_editables_resumen(ws, calculo: dict) -> None:
    """Overlay EXC_ROC / OTROS sobre filas fijas de plantilla (sin filtro de ceros)."""
    netos = list(calculo.get("netos") or [])
    codigo_a_fila = {
        "EXC": 45, "TUB": 46, "TRI": 47, "REL": 48, "GEO": 49, "EXC_ROC": 50,
    }
    for n in netos:
        cod = str(n.get("codigo") or "")
        if cod in codigo_a_fila:
            r = codigo_a_fila[cod]
            if n.get("unidad"):
                _set_nombre_item_cantidad(ws, r, ws[f"B{r}"].value, n.get("unidad"))
            if cod == "EXC_ROC":
                if n.get("long") is not None:
                    _set(ws, f"D{r}", float(n["long"]))
                if n.get("ancho") is not None:
                    _set(ws, f"E{r}", float(n["ancho"]))
                if n.get("espesor") is not None:
                    _set(ws, f"F{r}", float(n["espesor"]))
                if n.get("neto") is not None:
                    _set(ws, f"H{r}", float(n["neto"]))
    otros = [n for n in netos if str(n.get("codigo") or "").upper().startswith("OTROS")]
    for i, n in enumerate(otros):
        r = 51 + i
        _set_nombre_item_cantidad(ws, r, n.get("nombre") or "Otros: ____", n.get("unidad") or "m³")
        if n.get("long") is not None:
            _set(ws, f"D{r}", float(n["long"]))
        if n.get("ancho") is not None:
            _set(ws, f"E{r}", float(n["ancho"]))
        if n.get("espesor") is not None:
            _set(ws, f"F{r}", float(n["espesor"]))
        if n.get("neto") is not None:
            _set(ws, f"H{r}", float(n["neto"]))
        else:
            _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
        _style_fila_cantidad(ws, r)


def _write_tablas_cantidades_descuentos(
    ws,
    *,
    tipo: str,
    calculo: Optional[dict],
    vacia: bool,
) -> int:
    """
    Escribe Resumen de Cantidades + Descuentos Específicos.
    Con cálculo real (listas netos/descuentos): excluye líneas con cantidad 0,
    compacta filas y mantiene fórmulas vivas en las restantes (refs N ajustadas).
    Plantilla vacía / sin listas: layout fijo histórico.
    """
    es_alc = tipo == "ALCANTARILLA"
    usar_filtro = (
        bool(calculo)
        and not vacia
        and (
            isinstance(calculo.get("netos"), list)
            or isinstance(calculo.get("descuentos"), list)
        )
    )

    if not usar_filtro:
        _write_tablas_cantidades_descuentos_plantilla(ws, es_alc=es_alc)
        if calculo and not vacia:
            _overlay_valores_editables_resumen(ws, calculo)
        return 51

    netos_vis = _netos_visibles_excel(calculo)
    desc_vis = _descuentos_visibles_excel(calculo)
    _clear_tabla_cantidades_descuentos(ws)

    desc_row_by_cod: dict[str, int] = {}
    for i, d in enumerate(desc_vis):
        r = 45 + i
        cod = str(d.get("codigo") or "").strip()
        if cod:
            desc_row_by_cod[cod] = r
        _set_nombre_item_descuento(ws, r, d.get("nombre"))
        _write_descuento_fila_formula(ws, r, cod, es_alc)
        if ws[f"N{r}"].value is None:
            if d.get("long") is not None:
                _set(ws, f"K{r}", float(d["long"]))
            if d.get("ancho") is not None:
                _set(ws, f"L{r}", float(d["ancho"]))
            if d.get("espesor") is not None:
                _set(ws, f"M{r}", float(d["espesor"]))
            if d.get("cantidad") is not None:
                _set(ws, f"N{r}", float(d["cantidad"]))
        _style_fila_descuento(ws, r)

    exc_row = None
    for i, n in enumerate(netos_vis):
        if str(n.get("codigo") or "").upper() == "EXC":
            exc_row = 45 + i
            break
    for i, n in enumerate(netos_vis):
        r = 45 + i
        cod = str(n.get("codigo") or "").strip()
        _set_nombre_item_cantidad(ws, r, n.get("nombre") or cod, n.get("unidad") or "m³")
        _write_resumen_fila_formulas(
            ws,
            r,
            cod,
            es_alc=es_alc,
            desc_row_by_cod=desc_row_by_cod,
            exc_row=exc_row,
        )
        cod_u = cod.upper()
        if cod_u == "EXC_ROC" or cod_u == "OTROS" or cod_u.startswith("OTROS_"):
            if n.get("long") is not None:
                _set(ws, f"D{r}", float(n["long"]))
            if n.get("ancho") is not None:
                _set(ws, f"E{r}", float(n["ancho"]))
            if n.get("espesor") is not None:
                _set(ws, f"F{r}", float(n["espesor"]))
            if n.get("neto") is not None:
                _set(ws, f"H{r}", float(n["neto"]))
            elif ws[f"H{r}"].value is None:
                _set(ws, f"H{r}", f"=ROUND(PRODUCT(D{r}:F{r}),2)")
        _style_fila_cantidad(ws, r)

    return max(44 + len(netos_vis), 44 + len(desc_vis), 45)


def _apply_sheet_borders(ws, cant_last_row: int = 51) -> None:
    """Bordes de bloques: cabecera, franja, cartera, cantidades, descuentos, firmas."""
    last = max(int(cant_last_row or 51), 45)
    _border_box(ws, 1, 4, 6, 12)  # título F1:L4
    _border_box(ws, 1, 2, 13, 14)  # código doc
    _border_box(ws, 5, 8, 2, 6)  # partes contratista
    _border_box(ws, 5, 8, 7, 14)  # info contrato
    _border_box(ws, 10, 11, 9, 13)  # abs / pk franja
    _border_box(ws, 12, 13, 2, 7)  # geo
    _border_box(ws, 12, 13, 9, 13)  # params tubo
    _border_box(ws, 14, 15, 2, 7)  # áreas / sección
    _border_box(ws, 16, 41, 2, 10)  # cartera + totales
    # Panel gráfico K16:N40: marco exterior sin cuadrícula interna.
    _border_box_outer_only(ws, 16, 40, 11, 14)
    # Zona de la imagen L20:N40 sin bordes (salvo celdas de resultado más abajo).
    _clear_borders_range(ws, 20, 40, 12, 14)  # L20:N40
    _clear_borders_range(ws, 17, 40, 11, 11)  # K17:K40 (columna GRAFICO cuerpo)
    _border_box(ws, 43, last, 2, 8)  # resumen cantidades
    _border_box(ws, 43, last, 9, 14)  # descuentos
    _border_box(ws, 64, 66, 1, 7)  # elaboró
    _border_box(ws, 64, 66, 8, 14)  # aprobó
    # Celdas de captura de cartera: borde fino explícito
    for r in range(CARTERA_FIRST, CARTERA_LAST + 1):
        for c in range(2, 11):  # B..J
            cell = ws.cell(row=r, column=c)
            if not cell.border or not cell.border.left:
                cell.border = THIN
    # Únicas celdas del panel gráfico que conservan cuadrícula (valores de resultado).
    for addr in PANEL_RESULTADO_CELDAS:
        _style(ws, addr, border=THIN)


def _embed_seccion_png(ws, tipo: str) -> None:
    """PNG de sección típica anclado exactamente en L20:N40."""
    path = _SECCION_PNG.get(tipo) or _SECCION_PNG["ALCANTARILLA"]
    if not path.is_file():
        return
    img = Image(str(path))
    c0, r0 = SECCION_IMG_FROM
    c1, r1 = SECCION_IMG_TO
    img.anchor = TwoCellAnchor(
        _from=AnchorMarker(col=c0, colOff=0, row=r0, rowOff=0),
        to=AnchorMarker(col=c1, colOff=0, row=r1, rowOff=0),
        editAs="twoCell",
    )
    ws.add_image(img)


def _overlay_data(ws, planilla: dict, calculo: Optional[dict], tipo: str, vacia: bool) -> int:
    """Datos + fórmulas fijas al tipo de planilla (sin dropdown ni IF de tipo)."""
    meta = _meta(planilla)
    firmas = _firmas(planilla)
    es_alc = tipo == "ALCANTARILLA"

    # Título fijo — ya resuelto al exportar (sin DataValidation de tipo).
    _set(ws, "F1", TITULO_FIL if tipo == "FILTRO" else TITULO_ALC)
    _style(
        ws,
        "F1",
        font=FONT_TITLE,
        alignment=Alignment(horizontal="center", vertical="center", wrap_text=True),
    )
    _set(ws, "M1", meta.get("codigo_documento") or CODIGO_DOC)

    if meta.get("contratista"):
        _set(ws, "D5", meta["contratista"])
    if meta.get("interventoria"):
        _set(ws, "D6", meta["interventoria"])
    if meta.get("apoyo_supervision"):
        _set(ws, "D7", meta["apoyo_supervision"])
    if meta.get("info_contrato"):
        _set(ws, "G6", meta["info_contrato"])

    _set(ws, "D8", "=TODAY()")
    _set(ws, "L11", planilla.get("pk_id"))
    _set(ws, "M11", planilla.get("costado"))

    _set(ws, "I11", "=MIN(B17:B36)")
    _set(ws, "J11", "=MAX(B17:B36)")
    _set(ws, "B13", "=I11")
    _set(ws, "E13", "=J11")
    _set(ws, "C13", meta.get("norte_abs_inicial", planilla.get("norte_ref")))
    _set(ws, "D13", meta.get("este_abs_inicial", planilla.get("este_ref")))
    _set(ws, "F13", meta.get("norte_abs_final"))
    _set(ws, "G13", meta.get("este_abs_final"))

    if planilla.get("diametro_m") is not None:
        _set(ws, "I13", float(planilla["diametro_m"]))
    if planilla.get("espesor_m") is not None:
        _set(ws, "J13", float(planilla["espesor_m"]))
    _set(ws, "K13", "=ROUND((PI()*((I13/2)+J13)^2),3)")
    if planilla.get("material"):
        _set(ws, "L13", planilla["material"])
    _set(ws, "M13", tipo)

    rel = planilla.get("relacion_atraque") or "1:3"
    _set(ws, "D15", rel if ":" in str(rel) else f"1:{rel}")
    dv_atr = DataValidation(type="list", formula1='"1:1,1:2,1:3,1:4,1:6"', allow_blank=True)
    ws.add_data_validation(dv_atr)
    dv_atr.add("D15")

    # Cama triturado (ALC) / Traslapo geotextil (FIL) en F14:F15.
    if es_alc:
        _set(ws, "F14", "Cama Triturado")
        cama = meta.get("cama_triturado_m")
        if cama is None:
            cama = 0.0
        _set(ws, "F15", float(cama))
    else:
        _set(ws, "F14", "Traslapo")
        traslapo = meta.get("traslapo_m")
        if traslapo is None:
            traslapo = 0.0
        try:
            _set(ws, "F15", float(traslapo))
        except (TypeError, ValueError):
            _set(ws, "F15", 0.0)
    if planilla.get("ancho_excavacion_m") is not None:
        _set(ws, "G15", float(planilla["ancho_excavacion_m"]))

    _set(
        ws,
        "B15",
        '=IFERROR(IF($E$15="","",_xlfn.LET(_xlpm.r,$I$13/2+$J$13,_xlpm.h,$E$15,'
        "ROUND(_xlpm.r^2*ACOS((_xlpm.r-_xlpm.h)/_xlpm.r)"
        '-(_xlpm.r-_xlpm.h)*SQRT(2*_xlpm.r*_xlpm.h-_xlpm.h^2),3))),"")',
    )
    _set(ws, "C15", '=IFERROR(ROUND(K13-B15,3),"")')
    _set(
        ws,
        "E15",
        '=IFERROR(IF($D$15="","",ROUND(2*($I$13/2+$J$13)/'
        'VALUE(MID($D$15,FIND(":",$D$15)+1,10)),3)),"")',
    )
    # Encabezados de columna de cartera ya resueltos por tipo.
    _set(ws, "D16", "Subrasante de Vía" if es_alc else "")
    _set(ws, "E16", "Cota Lomo" if es_alc else "Terminado Filtro")
    if es_alc:
        _style(ws, "D16", fill=FILL_HDR, border=THIN, font=FONT_LABEL)
    _style(ws, "E16", fill=FILL_HDR, border=THIN, font=FONT_LABEL)

    for r in range(CARTERA_FIRST, CARTERA_LAST + 1):
        _set(ws, f"G{r}", f'=IFERROR(IF(B{r}<>0,(C{r}-F{r}),""),"")')
        if es_alc:
            _set(ws, f"H{r}", f'=IFERROR(IF(G{r}<>"",$E$15+$F$15,""),"")')
            _set(ws, f"I{r}", f'=IFERROR(IF(G{r}<>"",G{r}-($E$15+$F$15),""),"")')
            _set(ws, f"J{r}", None)
        else:
            _set(ws, f"H{r}", f'=IFERROR(IF(G{r}<>"",E{r}-F{r},""),"")')
            _set(ws, f"I{r}", f'=IFERROR(IF(G{r}<>"",0,""),"")')
            if r == CARTERA_FIRST:
                _set(ws, f"J{r}", None)
            else:
                _set(
                    ws,
                    f"J{r}",
                    f'=IFERROR(IF(B{r}<>"",AVERAGE(H{r-1}:H{r})*2+$G$15*2,""),"")',
                )
        for col in ("B", "C", "D", "E", "F"):
            _set(ws, f"{col}{r}", None)
        for col in ("G", "H", "I", "J"):
            _style(ws, f"{col}{r}", fill=FILL_CALC, border=THIN)

    filas: list = []
    if calculo and not vacia:
        filas = (calculo.get("cartera") or {}).get("filas") or []
    for i, f in enumerate(filas[: (CARTERA_LAST - CARTERA_FIRST + 1)]):
        r = CARTERA_FIRST + i
        if f.get("vacio"):
            continue
        _set(ws, f"B{r}", f.get("abscisa"))
        _set(ws, f"C{r}", f.get("terreno_natural"))
        if es_alc:
            _set(ws, f"D{r}", f.get("subrasante_via") or f.get("nivel_referencia"))
            _set(ws, f"E{r}", f.get("cota_lomo"))
        else:
            _set(ws, f"E{r}", f.get("terminado_filtro") or f.get("nivel_referencia"))
        _set(ws, f"F{r}", f.get("cota_fondo_excavacion"))

    _set(ws, "B41", "=MAX(B17:B36)-MIN(B17:B36)")
    _set(ws, "G41", '=IFERROR(AVERAGE(G17:G36),"")')
    _set(ws, "H41", '=IFERROR(AVERAGE(H17:H36),"")')
    _set(ws, "I41", '=IFERROR(AVERAGE(I17:I36),"")')
    _set(ws, "J41", '=IFERROR(AVERAGE(J17:J36),"")')

    for col, label in (
        ("B", "Item"),
        ("C", "Und."),
        ("D", "Long"),
        ("E", "Ancho"),
        ("F", "Espesor"),
        ("G", "Desc."),
        ("H", "Cantidad"),
    ):
        _set(ws, f"{col}44", label)
        _style(ws, f"{col}44", fill=FILL_CANT, font=FONT_HDR, border=THIN)
    for col, label in (
        ("I", "Item"),
        ("K", "Long"),
        ("L", "Ancho"),
        ("M", "Área"),
        ("N", "Cantidad"),
    ):
        _set(ws, f"{col}44", label)
        _style(ws, f"{col}44", fill=FILL_DESC, font=FONT_HDR, border=THIN)

    cant_last = _write_tablas_cantidades_descuentos(
        ws, tipo=tipo, calculo=calculo, vacia=vacia,
    )

    _set(ws, "L18", '="Ancho "&G15')
    _style(ws, "L18", fill=FILL_CALC, border=THIN)
    if es_alc:
        _set(ws, "K23", '=IFERROR(IF(G17<>"","Alt Rell. "&ROUND(I41,3),""),"")')
    else:
        _set(ws, "K23", '=IFERROR(IF(G17<>"","Anc. Geot "&ROUND(J41,3),""),"")')
    _style(ws, "K23", fill=FILL_CALC, border=THIN)
    _set(ws, "K30", '=IFERROR(IF(G17<>"","Alt Tritur. "&ROUND(H41,3),""),"")')
    _style(ws, "K30", fill=FILL_CALC, border=THIN)

    _set(ws, "A65", firmas.get("elaboro_nombre") or firmas.get("elaboro") or "")
    _set(ws, "H65", firmas.get("aprobo_nombre") or firmas.get("aprobo") or "")

    if vacia:
        _set(ws, "A9", "PLANTILLA VACÍA — solo Desarrollador (verificación de formato)")

    # Guardar refs para Notas (se escriben tras bordes de cantidades).
    ws._cc_notas_calculo = calculo
    ws._cc_notas_planilla = planilla
    return cant_last


def build_planilla_tuberia_xlsx(
    *,
    planilla: dict,
    calculo: Optional[dict] = None,
    vacia: bool = False,
) -> bytes:
    """Genera bytes .xlsx (sin macros) desde el inventario JSON. No abre .xlsm."""
    inv = _load_inventory()
    sheets = {s["title"]: s for s in inv.get("sheets") or []}
    pl_inv = sheets.get("planilla") or next(iter(sheets.values()))
    aux_inv = next((s for t, s in sheets.items() if t.lower().startswith("tbl_aux")), None)

    wb = Workbook()
    ws_aux = wb.active
    ws_aux.title = (aux_inv or {}).get("title") or "Tbl_Auxiliares"
    ws_aux.sheet_state = "hidden"
    _write_aux_feed(ws_aux)
    if aux_inv:
        _apply_widths(ws_aux, aux_inv)

    ws = wb.create_sheet("planilla", 0)
    ws.sheet_view.showGridLines = False
    ws.sheet_view.showZeros = False
    _apply_widths(ws, pl_inv)
    _apply_merges(ws, pl_inv)
    _write_static_labels(ws)

    tipo = (planilla.get("tipo") or "ALCANTARILLA").upper()
    if tipo not in ("ALCANTARILLA", "FILTRO"):
        tipo = "ALCANTARILLA"
    cant_last = _overlay_data(ws, planilla, calculo, tipo, vacia)
    _embed_seccion_png(ws, tipo)
    _apply_sheet_borders(ws, cant_last_row=cant_last or 51)
    _write_bloque_notas(
        ws,
        calculo=getattr(ws, "_cc_notas_calculo", calculo),
        planilla=getattr(ws, "_cc_notas_planilla", planilla),
        after_row=cant_last or 51,
    )
    _add_profile_chart(ws, wb, tipo=tipo)

    base = sheets.get("Resumen_BASE")
    if base:
        ws_base = wb.create_sheet("Resumen_BASE")
        ws_base.sheet_state = "hidden"
        _apply_widths(ws_base, base)
        _apply_merges(ws_base, base)

    buf = BytesIO()
    wb.save(buf)
    data = buf.getvalue()
    if data[:2] != b"PK":
        raise RuntimeError("Exportación Excel inválida")
    return data
