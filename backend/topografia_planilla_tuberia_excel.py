"""
Exportación Excel fiel a Planilla_Tuberia_original.xlsm.

Carga la plantilla original, escribe valores de campo y deja fórmulas vivas
(sección, cartera, resumen, descuentos, Tbl_Auxiliares + ScatterChart).
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any, Optional

from openpyxl import load_workbook
from openpyxl.chart import Reference, ScatterChart, Series

TEMPLATE = (
    Path(__file__).resolve().parents[1]
    / "docs"
    / "topografia"
    / "planillas_tuberia"
    / "Planilla_Tuberia_original.xlsm"
)

TITULO_ALC = "PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS"
TITULO_FIL = "PLANILLA DE INSTALACIÓN DE FILTROS"
CODIGO_DOC = "INF-ING - TOP - 001 - V0"

CARTERA_FIRST = 17
CARTERA_LAST = 36


def _meta(planilla: dict) -> dict:
    m = planilla.get("meta_cabecera") or {}
    return m if isinstance(m, dict) else {}


def _firmas(planilla: dict) -> dict:
    f = planilla.get("firmas") or {}
    return f if isinstance(f, dict) else {}


def _clear_cartera_inputs(ws) -> None:
    for r in range(CARTERA_FIRST, CARTERA_LAST + 1):
        for col in ("B", "C", "D", "E", "F"):
            ws[f"{col}{r}"].value = None


def _write_field_rows(ws, filas: list[dict], tipo: str) -> None:
    _clear_cartera_inputs(ws)
    for i, f in enumerate(filas[: (CARTERA_LAST - CARTERA_FIRST + 1)]):
        r = CARTERA_FIRST + i
        if f.get("vacio"):
            continue
        ws[f"B{r}"] = f.get("abscisa")
        ws[f"C{r}"] = f.get("terreno_natural")
        if tipo == "ALCANTARILLA":
            ws[f"D{r}"] = f.get("subrasante_via") or f.get("nivel_referencia")
            ws[f"E{r}"] = f.get("cota_lomo")
        else:
            ws[f"E{r}"] = f.get("terminado_filtro") or f.get("nivel_referencia")
        ws[f"F{r}"] = f.get("cota_fondo_excavacion")


def _ensure_cartera_formulas(ws) -> None:
    for r in range(CARTERA_FIRST, CARTERA_LAST + 1):
        ws[f"G{r}"] = f'=IFERROR(IF(B{r}<>0,(C{r}-F{r}),""),"")'
        ws[f"H{r}"] = (
            f'=IFERROR(IF(G{r}<>"",IF($F$1=$P$1,$E$15+$F$15,E{r}-F{r}),""),"")'
        )
        ws[f"I{r}"] = (
            f'=IFERROR(IF(G{r}<>"",IF($F$1=$P$1,G{r}-($E$15+$F$15),0),""),"")'
        )
        if r == CARTERA_FIRST:
            ws[f"J{r}"] = None
        else:
            ws[f"J{r}"] = (
                f'=IFERROR(IF(B{r}<>"",IF($F$1=$P$1,"",AVERAGE(H{r-1}:H{r})*2+$G$15*2),""),"")'
            )


def _write_header(ws, planilla: dict, tipo: str) -> None:
    meta = _meta(planilla)
    firmas = _firmas(planilla)
    ws["F1"] = TITULO_FIL if tipo == "FILTRO" else TITULO_ALC
    ws["P1"] = TITULO_ALC
    ws["P2"] = TITULO_FIL
    ws["M1"] = meta.get("codigo_documento") or CODIGO_DOC
    if meta.get("contratista"):
        ws["D5"] = meta["contratista"]
    if meta.get("interventoria"):
        ws["D6"] = meta["interventoria"]
    if meta.get("apoyo_supervision"):
        ws["D7"] = meta["apoyo_supervision"]
    if meta.get("info_contrato"):
        ws["G6"] = meta["info_contrato"]
    ws["L11"] = planilla.get("pk_id")
    ws["M11"] = planilla.get("costado")
    ws["C13"] = meta.get("norte_abs_inicial", planilla.get("norte_ref"))
    ws["D13"] = meta.get("este_abs_inicial", planilla.get("este_ref"))
    ws["F13"] = meta.get("norte_abs_final")
    ws["G13"] = meta.get("este_abs_final")
    if planilla.get("diametro_m") is not None:
        ws["I13"] = float(planilla["diametro_m"])
    if planilla.get("espesor_m") is not None:
        ws["J13"] = float(planilla["espesor_m"])
    if planilla.get("material"):
        ws["L13"] = planilla["material"]
    rel = planilla.get("relacion_atraque") or "1:3"
    ws["D15"] = rel
    if planilla.get("ancho_excavacion_m") is not None:
        ws["G15"] = float(planilla["ancho_excavacion_m"])
    cama = meta.get("cama_triturado_m")
    if cama is None:
        cama = 0.0
    ws["F15"] = float(cama) if tipo == "ALCANTARILLA" else None
    if firmas.get("elaboro_nombre"):
        ws["A65"] = firmas["elaboro_nombre"]
    if firmas.get("aprobo_nombre"):
        ws["H65"] = firmas["aprobo_nombre"]


def _restore_chart(ws, wb) -> None:
    if getattr(ws, "_charts", None):
        return
    aux_name = next((n for n in wb.sheetnames if n.lower().startswith("tbl_aux")), None)
    if not aux_name:
        return
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
    ws.add_chart(chart, "A52")


def build_planilla_tuberia_xlsx(
    *,
    planilla: dict,
    calculo: Optional[dict] = None,
    vacia: bool = False,
) -> bytes:
    if not TEMPLATE.exists():
        raise FileNotFoundError(f"Plantilla XLSM no encontrada: {TEMPLATE}")

    tipo = (planilla.get("tipo") or "ALCANTARILLA").upper()
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "src.xlsm"
        shutil.copy2(TEMPLATE, src)
        wb = load_workbook(src, data_only=False, keep_vba=False)
        ws = wb["planilla"]

        _write_header(ws, planilla, tipo)
        ws["K13"] = "=ROUND((PI()*((I13/2)+J13)^2),3)"
        ws["M13"] = '=IF(F1=P1,"ALCANTARILLA","FILTRO")'
        ws["F14"] = '=IF(F1=P1,"Cama Triturado","")'
        ws["B15"] = (
            '=IFERROR(IF($E$15="","",_xlfn.LET(_xlpm.r,$I$13/2+$J$13,_xlpm.h,$E$15,'
            "ROUND(_xlpm.r^2*ACOS((_xlpm.r-_xlpm.h)/_xlpm.r)"
            '-(_xlpm.r-_xlpm.h)*SQRT(2*_xlpm.r*_xlpm.h-_xlpm.h^2),3))),"")'
        )
        ws["C15"] = '=IFERROR(ROUND(K13-B15,3),"")'
        ws["E15"] = (
            '=IFERROR(IF($D$15="","",ROUND(2*($I$13/2+$J$13)/'
            'VALUE(MID($D$15,FIND(":",$D$15)+1,10)),3)),"")'
        )
        ws["D16"] = '=IF(F1=P2,"","Subrasante de Vía")'
        # Original usa Q1 (vacío); se corrige a P1 para coherencia con el resto del libro.
        ws["E16"] = '=IF(F1=P1,"Cota Lomo","Terminado Filtro")'

        _ensure_cartera_formulas(ws)

        filas: list[dict[str, Any]] = []
        if calculo and not vacia:
            filas = (calculo.get("cartera") or {}).get("filas") or []
        _write_field_rows(ws, filas, tipo)

        ws["B41"] = "=MAX(B17:B36)-MIN(B17:B36)"
        ws["G41"] = '=IFERROR(AVERAGE(G17:G36),"")'
        ws["H41"] = '=IFERROR(AVERAGE(H17:H36),"")'
        ws["I41"] = '=IFERROR(AVERAGE(I17:I36),"")'
        ws["J41"] = '=IFERROR(AVERAGE(J17:J36),"")'

        ws["D45"] = "=B41"
        ws["E45"] = "=G15"
        ws["F45"] = "=IFERROR(G41,0)"
        ws["H45"] = "=ROUND(PRODUCT(D45:F45),2)"
        ws["F46"] = 0.05
        ws["G48"] = '=IF($F$1=$P$1,N46,N45)'
        ws["H48"] = "=ROUND(PRODUCT(D48:F48),2)-G48"
        ws["G49"] = '=IF($F$1=$P$1,N47,0)'
        ws["H49"] = "=ROUND(PRODUCT(D49:F49),2)"

        _restore_chart(ws, wb)

        if vacia:
            ws["A3"] = "PLANTILLA VACÍA — solo Desarrollador (verificación de formato)"

        out = Path(tmp) / "out.xlsx"
        wb.save(out)
        return out.read_bytes()
