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


def _add_profile_chart(ws_planilla, wb) -> None:
    aux_name = next((n for n in wb.sheetnames if n.lower().startswith("tbl_aux")), None)
    if not aux_name:
        return
    ws_planilla._charts = []
    chart = ScatterChart()
    chart.title = "Perfil Longitudinal de Tubería"
    chart.x_axis.title = "longitud de tramo"
    chart.y_axis.title = "cota"
    chart.style = 10
    aux = wb[aux_name]
    xvalues = Reference(aux, min_col=2, min_row=5, max_row=28)
    for col, title in (
        (3, "Terreno Natural"),
        (4, "Terminado Filtro"),
        (5, "Cota Fondo Excavación"),
    ):
        yvalues = Reference(aux, min_col=col, min_row=5, max_row=28)
        chart.series.append(Series(yvalues, xvalues, title=title))
    chart.width = 18
    chart.height = 8
    ws_planilla.add_chart(chart, "A52")


def _overlay_data(ws, planilla: dict, calculo: Optional[dict], tipo: str, vacia: bool) -> None:
    meta = _meta(planilla)
    firmas = _firmas(planilla)

    _set(ws, "F1", TITULO_FIL if tipo == "FILTRO" else TITULO_ALC)
    _style(
        ws,
        "F1",
        font=FONT_TITLE,
        alignment=Alignment(horizontal="center", vertical="center", wrap_text=True),
    )
    _set(ws, "P1", TITULO_ALC)
    _set(ws, "P2", TITULO_FIL)
    _set(ws, "M1", meta.get("codigo_documento") or CODIGO_DOC)

    dv = DataValidation(type="list", formula1="$P$1:$P$2", allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("F1")

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
    _set(ws, "M13", '=IF(F1=P1,"ALCANTARILLA","FILTRO")')

    rel = planilla.get("relacion_atraque") or "1:3"
    _set(ws, "D15", rel if ":" in str(rel) else f"1:{rel}")
    dv_atr = DataValidation(type="list", formula1='"1:1,1:2,1:3,1:4,1:6"', allow_blank=True)
    ws.add_data_validation(dv_atr)
    dv_atr.add("D15")

    _set(ws, "F14", '=IF(F1=P1,"Cama Triturado","")')
    cama = meta.get("cama_triturado_m")
    if cama is None:
        cama = 0.0
    _set(ws, "F15", float(cama) if tipo == "ALCANTARILLA" else None)
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
    _set(ws, "D16", '=IF(F1=P2,"","Subrasante de Vía")')
    _set(ws, "E16", '=IF(F1=P1,"Cota Lomo","Terminado Filtro")')

    for r in range(CARTERA_FIRST, CARTERA_LAST + 1):
        _set(ws, f"G{r}", f'=IFERROR(IF(B{r}<>0,(C{r}-F{r}),""),"")')
        _set(ws, f"H{r}", f'=IFERROR(IF(G{r}<>"",IF($F$1=$P$1,$E$15+$F$15,E{r}-F{r}),""),"")')
        _set(ws, f"I{r}", f'=IFERROR(IF(G{r}<>"",IF($F$1=$P$1,G{r}-($E$15+$F$15),0),""),"")')
        if r == CARTERA_FIRST:
            _set(ws, f"J{r}", None)
        else:
            _set(
                ws,
                f"J{r}",
                f'=IFERROR(IF(B{r}<>"",IF($F$1=$P$1,"",AVERAGE(H{r-1}:H{r})*2+$G$15*2),""),"")',
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
        if tipo == "ALCANTARILLA":
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
        ("D", "Long"),
        ("E", "Ancho"),
        ("F", "Espesor"),
        ("G", "Desc."),
        ("H", "Cantidad"),
    ):
        _set(ws, f"{col}44", label)
        _style(ws, f"{col}44", fill=FILL_CANT, font=FONT_HDR)
    for col, label in (
        ("I", "Item"),
        ("K", "Long"),
        ("L", "Ancho"),
        ("M", "Espesor"),
        ("N", "Cantidad"),
    ):
        _set(ws, f"{col}44", label)
        _style(ws, f"{col}44", fill=FILL_DESC, font=FONT_HDR)

    for addr, name in (
        ("B45", "Excavación Varias"),
        ("B46", "Excavación Roca"),
        ("B47", "Long Tubería"),
        ("B48", "Triturado / Atraque"),
        ("B49", "Relleno Gran."),
        ("B50", "Geotextil"),
    ):
        _set(ws, addr, name)

    _set(ws, "D45", "=B41")
    _set(ws, "E45", "=G15")
    _set(ws, "F45", "=IFERROR(G41,0)")
    _set(ws, "H45", "=ROUND(PRODUCT(D45:F45),2)")
    _set(ws, "D46", "=D45")
    _set(ws, "E46", "=E45")
    _set(ws, "F46", 0.05)
    _set(ws, "H46", "=ROUND(PRODUCT(D46:F46),2)")
    _set(ws, "D47", "=D45")
    _set(ws, "H47", "=ROUND(PRODUCT(D47:F47),2)")
    _set(ws, "D48", "=D45")
    _set(ws, "E48", "=E45")
    _set(ws, "F48", "=IFERROR(H41,0)")
    _set(ws, "G48", '=IF($F$1=$P$1,N46,N45)')
    _set(ws, "H48", "=ROUND(PRODUCT(D48:F48),2)-G48")
    _set(ws, "D49", "=D45")
    _set(ws, "E49", "=E45")
    _set(ws, "F49", "=IFERROR(I41,0)")
    _set(ws, "G49", '=IF($F$1=$P$1,N47,0)')
    _set(ws, "H49", "=ROUND(PRODUCT(D49:F49),2)")
    _set(ws, "D50", "=D45")
    _set(ws, "E50", "=J41")
    _set(ws, "H50", "=ROUND(PRODUCT(D50:F50),2)")

    _set(ws, "I45", '=IF($F$1=$P$1,"","Tubería Filtro")')
    _set(ws, "K45", '=IF(I45<>"",$B$41,"")')
    _set(ws, "M45", '=IF(I45<>"",$K$13,"")')
    _set(ws, "N45", "=PRODUCT(K45:M45)")
    _set(ws, "I46", '=IF($F$1=$P$1,"Area 1","")')
    _set(ws, "K46", '=IF(I46<>"",$B$41,"")')
    _set(ws, "M46", '=IF(I46<>"",$B$15,"")')
    _set(ws, "N46", '=IF(I46<>"",PRODUCT(K46:M46),"")')
    _set(ws, "I47", '=IF($F$1=$P$1,"Area 2","")')
    _set(ws, "K47", '=IF(I47<>"",$B$41,"")')
    _set(ws, "M47", '=IF(I47<>"",$C$15,"")')
    _set(ws, "N47", '=IF(I47<>"",PRODUCT(K47:M47),"")')
    _set(ws, "I48", "Otros")

    _set(ws, "L18", '="Ancho "&G15')
    _style(ws, "L18", fill=FILL_CALC)
    _set(
        ws,
        "K23",
        '=IFERROR(IF(G17<>"",IF($F$1=$P$1,"Alt Rell. "&ROUND(I41,3),"Anc. Geot "&ROUND(J41,3)),""),"")',
    )
    _style(ws, "K23", fill=FILL_CALC)
    _set(
        ws,
        "K30",
        '=IFERROR(IF(G17<>"",IF($F$1=$P$1,"Alt Tritur. "&ROUND(H41,3),"Alt Tritur. "&ROUND(H41,3)),""),"")',
    )
    _style(ws, "K30", fill=FILL_CALC)

    _set(ws, "A65", firmas.get("elaboro_nombre") or firmas.get("elaboro") or "")
    _set(ws, "H65", firmas.get("aprobo_nombre") or firmas.get("aprobo") or "")

    if vacia:
        _set(ws, "A9", "PLANTILLA VACÍA — solo Desarrollador (verificación de formato)")


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
    _overlay_data(ws, planilla, calculo, tipo, vacia)
    _add_profile_chart(ws, wb)

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
