"""Exportación Excel de poligonal con fórmulas vivas (alineadas al backend).

Pestañas:
  - «Resumen»: datos generales + parámetros + cierres angular/lineal
  - «Cartera»: tabla armada por armada (entradas + fórmulas de cálculo)
  - «Esquema»: gráfico Este/Norte ajustado (referencia Cartera)

Cierre angular (mismo criterio que ``calcular_cierre_poligonal``):
  - Ángulo derivado: (Az − base) mod 360 en el 1º tramo;
    (Az_i − Az_{i−1} − 180) mod 360 en los siguientes (azimut directo).
  - Con orientación (dist=0): se excluye el ángulo del 1º tramo (amarre) de Σ
    y se suma el ángulo de orientación → evita inflar Σ (~+179° típico).
  - Diff = Σ Observada − Σ Teórica; Diferencia (″) = Diff × 3600.
  - Σ Teórica = (n−2)×180 antihorario / (n+2)×180 horario.
"""
from __future__ import annotations

import io
from typing import List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

_SIDE = Side(style="thin", color="94A3B8")
_BORDER = Border(left=_SIDE, right=_SIDE, top=_SIDE, bottom=_SIDE)
_FILL_HDR = PatternFill("solid", fgColor="1E40AF")
_FILL_HDR2 = PatternFill("solid", fgColor="475569")
_FILL_INPUT = PatternFill("solid", fgColor="FEF9C3")
_FILL_CALC = PatternFill("solid", fgColor="F1F5F9")
_FILL_OK = PatternFill("solid", fgColor="DCFCE7")
_FILL_BAD = PatternFill("solid", fgColor="FEE2E2")
_FILL_ARRANQUE = PatternFill("solid", fgColor="DCFCE7")
_FILL_TITLE = PatternFill("solid", fgColor="EFF6FF")
_FONT_HDR = Font(bold=True, color="FFFFFF", size=9)
_FONT_TITLE = Font(bold=True, size=14, color="1E40AF")
_FONT_SUB = Font(bold=True, size=10, color="0F172A")
_FONT_MUTED = Font(size=8, color="64748B")
_FONT_CELL = Font(size=9, color="0F172A")
_AL_C = Alignment(horizontal="center", vertical="center", wrap_text=True)
_AL_L = Alignment(horizontal="left", vertical="center", wrap_text=True)
_AL_R = Alignment(horizontal="right", vertical="center")


def _cell(ws, row: int, col: int, value=None, *, fill=None, font=None, align=None, border=True, num_fmt=None):
    c = ws.cell(row=row, column=col, value=value)
    if fill:
        c.fill = fill
    if font:
        c.font = font
    if align:
        c.alignment = align
    if border:
        c.border = _BORDER
    if num_fmt:
        c.number_format = num_fmt
    return c


def _legs_estacion(estaciones: list) -> List[dict]:
    out = []
    for e in sorted(estaciones or [], key=lambda x: int(x.get("orden") or 0)):
        if (e.get("tipo_punto") or "auxiliar") != "estacion":
            continue
        if float(e.get("distancia") or 0) <= 1e-9:
            continue
        out.append(e)
    return out


def _estacion_orientacion(estaciones: list) -> Optional[dict]:
    """Primera estación con distancia 0 (lectura de orientación al cierre)."""
    for e in sorted(estaciones or [], key=lambda x: int(x.get("orden") or 0)):
        if (e.get("tipo_punto") or "auxiliar") != "estacion":
            continue
        if float(e.get("distancia") or 0) <= 1e-9 and e.get("angulo_medido") is not None:
            return e
    return None


def _es_azimut_directo(legs: list, orient: Optional[dict] = None) -> bool:
    pool = list(legs or [])
    if orient:
        pool.append(orient)
    return any(
        (e.get("metodo_azimut") == "coordenadas") or bool(e.get("angulo_derivado_para_cierre"))
        for e in pool
    )


def _az_campo_lectura(e: dict, *, azimut_directo: bool) -> Optional[float]:
    if e.get("angulo_medido") is not None:
        try:
            return float(e["angulo_medido"]) % 360.0
        except (TypeError, ValueError):
            pass
    if azimut_directo and e.get("azimut") is not None:
        try:
            return float(e["azimut"]) % 360.0
        except (TypeError, ValueError):
            pass
    return None


def _base_azimut_arranque(legs: list, armadas: Optional[list]) -> float:
    if armadas:
        arms = sorted(armadas, key=lambda a: int(a.get("orden") or 0))
        if arms and arms[0].get("base_azimut") is not None:
            try:
                return float(arms[0]["base_azimut"]) % 360.0
            except (TypeError, ValueError):
                pass
    if not legs:
        return 0.0
    a0 = legs[0]
    az = None
    if a0.get("angulo_medido") is not None:
        try:
            az = float(a0["angulo_medido"]) % 360.0
        except (TypeError, ValueError):
            az = None
    if az is None and a0.get("azimut") is not None:
        try:
            az = float(a0["azimut"]) % 360.0
        except (TypeError, ValueError):
            az = None
    if a0.get("angulo_derivado") is not None and az is not None:
        return (az - float(a0["angulo_derivado"])) % 360.0
    if a0.get("base_azimut") is not None:
        try:
            return float(a0["base_azimut"]) % 360.0
        except (TypeError, ValueError):
            pass
    return float(az or 0.0)


def _hi_por_armada(armadas: Optional[list], e: dict) -> float:
    if not armadas:
        return float(e.get("altura_instrumento") or 0)
    by_id = {a.get("id"): a for a in armadas if a.get("id")}
    arm = by_id.get(e.get("armada_id"))
    if arm is None:
        for a in armadas:
            if a.get("orden") is not None and a.get("orden") == e.get("armada_orden"):
                arm = a
                break
    if arm and arm.get("altura_instrumento") is not None:
        return float(arm["altura_instrumento"])
    return float(e.get("altura_instrumento") or 0)


def _angulo_orientacion_seed(
    orient: Optional[dict],
    *,
    azimut_directo: bool,
    cierre: dict,
    last_leg_az: Optional[float],
) -> float:
    """Ángulo de orientación que alimenta Σ (mismo criterio que el backend)."""
    for d in cierre.get("angulos_cierre_detalle") or []:
        if d.get("orientacion") and d.get("angulo_cierre") is not None:
            return float(d["angulo_cierre"]) % 360.0
    if not orient:
        return 0.0
    az = _az_campo_lectura(orient, azimut_directo=azimut_directo)
    if az is None and orient.get("azimut") is not None:
        az = float(orient["azimut"]) % 360.0
    if azimut_directo and az is not None and last_leg_az is not None:
        return (az - last_leg_az - 180.0) % 360.0
    if azimut_directo and orient.get("angulo_derivado") is not None:
        return float(orient["angulo_derivado"]) % 360.0
    if az is not None:
        return az % 360.0
    return 0.0


def build_poligonal_xlsx_bytes(
    *,
    contrato: dict,
    pol: dict,
    estaciones: list,
    punto_inicial: Optional[dict],
    punto_final: Optional[dict] = None,
    cierre: Optional[dict] = None,
    armadas: Optional[list] = None,
) -> bytes:
    del punto_final
    cierre = cierre or {}
    legs = _legs_estacion(estaciones)
    orient = _estacion_orientacion(estaciones)
    n = len(legs)
    pi = punto_inicial or {}

    sentido = (cierre.get("sentido") or pol.get("sentido") or "antihorario").lower()
    antihorario = sentido != "horario"
    tol_rel = int(cierre.get("tolerancia_relativa") or pol.get("tolerancia_relativa") or 30000)
    prec_ang = float(cierre.get("precision_angular_equipo_seg") or pol.get("precision_angular_seg") or 10.0)
    azimut_directo = _es_azimut_directo(legs, orient)
    base_az = _base_azimut_arranque(legs, armadas)

    tiene_orientacion = bool(cierre.get("tiene_orientacion")) or orient is not None
    last_az = None
    if legs:
        last_az = _az_campo_lectura(legs[-1], azimut_directo=azimut_directo)
        if last_az is None and legs[-1].get("azimut") is not None:
            last_az = float(legs[-1]["azimut"]) % 360.0
    ang_orient = _angulo_orientacion_seed(
        orient, azimut_directo=azimut_directo, cierre=cierre, last_leg_az=last_az
    )

    # n_angulos: como backend (tras excluir amarre + orientación, ≈ n_vert)
    n_ang = int(cierre.get("num_angulos") or 0) or n
    if tiene_orientacion and n_ang < 1:
        n_ang = n

    az1_seed = 0.0
    if legs:
        if azimut_directo:
            az1_seed = _az_campo_lectura(legs[0], azimut_directo=True) or 0.0
        elif legs[0].get("azimut") is not None:
            az1_seed = float(legs[0]["azimut"]) % 360.0
        else:
            az1_seed = (base_az + (_az_campo_lectura(legs[0], azimut_directo=False) or 0.0)) % 360.0

    wb = Workbook()

    # ══════════════════════════════════════════════════════════════════════════
    # Hoja Resumen (info + cierres)
    # ══════════════════════════════════════════════════════════════════════════
    wr = wb.active
    wr.title = "Resumen"

    titulo = f"Poligonal trigonométrica — {pol.get('nombre') or ''}"
    wr.merge_cells("A1:F1")
    _cell(wr, 1, 1, titulo, fill=_FILL_TITLE, font=_FONT_TITLE, align=_AL_L, border=False)

    equipo = " / ".join(
        x
        for x in [
            pol.get("equipo_marca"),
            pol.get("equipo_referencia"),
            pol.get("equipo_serial") and f"S/N {pol.get('equipo_serial')}",
        ]
        if x
    ) or pol.get("equipo") or "—"

    meta = [
        ("Contrato", str(contrato.get("numero") or "—")),
        ("Objeto", str(contrato.get("objeto") or "—")[:120]),
        ("Contratista", str(contrato.get("contratista") or "—")),
        ("Interventoría", str(contrato.get("interventoria") or "—")),
        ("Equipo", str(equipo)),
        ("Operador / profesional", str(pol.get("operador") or "—")),
        ("Fecha campo", str(pol.get("fecha_campo") or "—")),
        ("Tipo", str(pol.get("tipo") or "cerrada")),
    ]
    for i, (lab, val) in enumerate(meta):
        r = 2 + i
        _cell(wr, r, 1, lab, font=_FONT_SUB, fill=_FILL_CALC, align=_AL_L)
        wr.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
        _cell(wr, r, 2, val, font=_FONT_CELL, align=_AL_L)

    _cell(wr, 11, 1, "PARÁMETROS DE CÁLCULO", fill=_FILL_HDR2, font=_FONT_HDR, align=_AL_L)
    wr.merge_cells("A11:B11")

    param_b14_label = "Azimut base arranque (°)" if azimut_directo else "Azimut 1º tramo (°)"
    params: List[Tuple[int, str, object, str, bool]] = [
        (12, "Sentido antihorario (1=sí, 0=horario)", 1 if antihorario else 0, "0", True),
        (13, "Tolerancia relativa plan (1:N)", tol_rel, "0", True),
        (14, "Precisión angular equipo (\")", prec_ang, "0.######", True),
        (15, param_b14_label, round(base_az if azimut_directo else az1_seed, 6), "0.000000", True),
        (16, "Nº vértices / tramos (n)", n, "0", False),
        (17, "Modo azimut directo (1=sí)", 1 if azimut_directo else 0, "0", True),
        (18, "Tiene orientación cierre (1=sí)", 1 if tiene_orientacion else 0, "0", True),
        (19, "Ángulo orientación (°)", round(ang_orient, 8), "0.000000", True),
        (20, "Nº ángulos en Σ / corrección", n_ang, "0", True),
    ]
    for r, lab, val, fmt, editable in params:
        _cell(wr, r, 1, lab, font=_FONT_MUTED, fill=_FILL_CALC, align=_AL_L)
        _cell(
            wr,
            r,
            2,
            val,
            fill=_FILL_INPUT if editable else _FILL_CALC,
            font=_FONT_CELL,
            align=_AL_R,
            num_fmt=fmt,
        )

    _cell(
        wr,
        21,
        1,
        "Con orientación=1 el 1º ángulo de Cartera (amarre) se excluye de Σ Observada "
        "y se suma B19 (igual que la plataforma). Diff = Σobs − Σteórica. "
        "Celdas amarillas = editables. La cartera detallada está en la pestaña Cartera.",
        font=_FONT_MUTED,
        border=False,
        align=_AL_L,
    )
    wr.merge_cells("A21:F21")

    # Cierre angular (valores en B)
    _cell(wr, 23, 1, "CIERRE ANGULAR", fill=_FILL_HDR2, font=_FONT_HDR, align=_AL_L)
    wr.merge_cells("A23:B23")

    # Filas Cartera: arranque=5, first leg=6 → last=5+n
    # Definidas tras crear Cartera; aquí usamos nombres fijos acordados:
    # Cartera!I6:I{5+n} ángulos derivados; Cartera!U6:U{5+n} flag Σ (0/1)
    first_leg_row = 6
    last_leg_row = 5 + n if n else 5
    rng_u = f"Cartera!U{first_leg_row}:U{last_leg_row}"
    rng_i = f"Cartera!I{first_leg_row}:I{last_leg_row}"
    rng_l = f"Cartera!L{first_leg_row}:L{last_leg_row}"
    rng_m = f"Cartera!M{first_leg_row}:M{last_leg_row}"
    rng_n = f"Cartera!N{first_leg_row}:N{last_leg_row}"
    rng_e = f"Cartera!E{first_leg_row}:E{last_leg_row}"

    ang_block = [
        (24, "Sentido", '=IF($B$12=1,"Antihorario (int.)","Horario (ext.)")', None),
        (25, "Áng. / Vért.", '=$B$20&" / "&$B$16', None),
        (
            26,
            "Σ Observada (°)",
            f'=IF($B$16<=0,0,SUMIF({rng_u},1,{rng_i})+IF($B$18=1,$B$19,0))',
            "0.000000",
        ),
        (27, "Σ Teórica (°)", '=IF($B$12=1,($B$16-2)*180,($B$16+2)*180)', "0.000000"),
        # Diff genuina = Σobs − Σteor (plataforma)
        (28, "Diff angular (°)", "=$B$26-$B$27", "0.000000"),
        (29, "Diferencia (\")", "=$B$28*3600", "0.00"),
        (30, "Tolerancia (\")", "=$B$14*SQRT(MAX($B$16,1))", "0.0"),
        (31, "Estado", '=IF(ABS(B29)<=B30,"CUMPLE","REVISAR")', None),
    ]
    for r, lab, formul, fmt in ang_block:
        _cell(wr, r, 1, lab, fill=_FILL_CALC, font=_FONT_MUTED, align=_AL_L)
        _cell(
            wr,
            r,
            2,
            formul,
            fill=_FILL_CALC,
            font=Font(bold=True, size=9) if r == 31 else _FONT_CELL,
            align=_AL_R,
            num_fmt=fmt,
        )
    wr.conditional_formatting.add("B31", FormulaRule(formula=['B31="CUMPLE"'], fill=_FILL_OK))
    wr.conditional_formatting.add("B31", FormulaRule(formula=['B31="REVISAR"'], fill=_FILL_BAD))

    # Refs internas para Bowditch (Cartera las usa)
    _cell(wr, 33, 1, "REF. LINEAL (para Bowditch en Cartera)", fill=_FILL_HDR2, font=_FONT_HDR, align=_AL_L)
    wr.merge_cells("A33:B33")
    lin_ref = [
        (34, "ErrN = ΣΔN (m)", f"=IF($B$16<=0,0,SUM({rng_l}))", "0.0000"),
        (35, "ErrE = ΣΔE (m)", f"=IF($B$16<=0,0,SUM({rng_m}))", "0.0000"),
        (36, "Perímetro (m)", f"=IF($B$16<=0,0,SUM({rng_e}))", "0.000"),
        (37, "ErrZ = ΣΔZ (m)", f"=IF($B$16<=0,0,SUM({rng_n}))", "0.0000"),
    ]
    for r, lab, formul, fmt in lin_ref:
        _cell(wr, r, 1, lab, fill=_FILL_CALC, font=_FONT_MUTED, align=_AL_L)
        _cell(wr, r, 2, formul, fill=_FILL_CALC, font=_FONT_CELL, align=_AL_R, num_fmt=fmt)

    _cell(wr, 39, 1, "CIERRE LINEAL (campo)", fill=_FILL_HDR2, font=_FONT_HDR, align=_AL_L)
    wr.merge_cells("A39:B39")
    lin_block = [
        (40, "Perímetro (m)", "=$B$36", "0.000"),
        (41, "ΔN (m)", "=-B34", "0.0000"),
        (42, "ΔE (m)", "=-B35", "0.0000"),
        (43, "ΔZ (m)", "=-B37", "0.0000"),
        (44, "Error lineal (m)", "=SQRT(B34^2+B35^2)", "0.0000"),
        (45, "Cierre 1:N", "=IF(B44<=1E-9,1E9,ROUND(B36/B44,0))", "0"),
        (46, "Tolerancia plan", '="1:"&$B$13', None),
        (47, "Estado", '=IF(B45>=$B$13,"CUMPLE","NO CUMPLE")', None),
    ]
    for r, lab, formul, fmt in lin_block:
        _cell(wr, r, 1, lab, fill=_FILL_CALC, font=_FONT_MUTED, align=_AL_L)
        _cell(
            wr,
            r,
            2,
            formul,
            fill=_FILL_CALC,
            font=Font(bold=True, size=9) if r == 47 else _FONT_CELL,
            align=_AL_R,
            num_fmt=fmt,
        )
    wr.conditional_formatting.add("B47", FormulaRule(formula=['B47="CUMPLE"'], fill=_FILL_OK))
    wr.conditional_formatting.add("B47", FormulaRule(formula=['B47="NO CUMPLE"'], fill=_FILL_BAD))

    for col, w in [("A", 42), ("B", 18), ("C", 12), ("D", 12), ("E", 12), ("F", 12)]:
        wr.column_dimensions[col].width = w

    # ══════════════════════════════════════════════════════════════════════════
    # Hoja Cartera
    # ══════════════════════════════════════════════════════════════════════════
    ws = wb.create_sheet("Cartera")
    _cell(ws, 1, 1, "Cartera de cálculo (fórmulas vivas)", fill=_FILL_TITLE, font=_FONT_TITLE, border=False)
    ws.merge_cells("A1:U1")
    _cell(
        ws,
        2,
        1,
        "Amarillo = editable. Ang.deriv / cierres / Bowditch referencian Resumen. "
        "Columna «En Σ» = 0 excluye el amarre inicial cuando hay orientación.",
        font=_FONT_MUTED,
        border=False,
        align=_AL_L,
    )
    ws.merge_cells("A2:U2")

    HDR_ROW = 4
    START_ROW = 5
    FIRST_LEG = 6
    LAST_LEG = FIRST_LEG + n - 1 if n else FIRST_LEG - 1

    col_d_hdr = "Az campo °" if azimut_directo else "Ang.obs °"
    headers = [
        "#",
        "Armada",
        "Punto",
        col_d_hdr,
        "Dist m",
        "Ang.vert °",
        "HI m",
        "HT m",
        "Ang.deriv °",
        "Ang.corr °",
        "Az corr °",
        "ΔN m",
        "ΔE m",
        "ΔZ m",
        "Corr.N m",
        "Corr.E m",
        "Corr.Z m",
        "Norte aj.",
        "Este aj.",
        "Cota aj.",
        "En Σ",
    ]
    for c, h in enumerate(headers, 1):
        _cell(ws, HDR_ROW, c, h, fill=_FILL_HDR, font=_FONT_HDR, align=_AL_C)

    # Arranque
    _cell(ws, START_ROW, 1, "—", fill=_FILL_ARRANQUE, align=_AL_C)
    _cell(ws, START_ROW, 2, "—", fill=_FILL_ARRANQUE, align=_AL_C)
    _cell(
        ws,
        START_ROW,
        3,
        str(pi.get("nombre") or "Arranque"),
        fill=_FILL_ARRANQUE,
        font=Font(bold=True, size=9),
        align=_AL_L,
    )
    for c in range(4, 18):
        _cell(ws, START_ROW, c, "—", fill=_FILL_ARRANQUE, align=_AL_C, font=_FONT_MUTED)
    _cell(
        ws,
        START_ROW,
        18,
        float(pi["norte"]) if pi.get("norte") is not None else 0.0,
        fill=_FILL_INPUT,
        align=_AL_R,
        num_fmt="0.0000",
    )
    _cell(
        ws,
        START_ROW,
        19,
        float(pi["este"]) if pi.get("este") is not None else 0.0,
        fill=_FILL_INPUT,
        align=_AL_R,
        num_fmt="0.0000",
    )
    _cell(
        ws,
        START_ROW,
        20,
        float(pi["cota"]) if pi.get("cota") is not None else None,
        fill=_FILL_INPUT,
        align=_AL_R,
        num_fmt="0.0000",
    )
    _cell(ws, START_ROW, 21, "—", fill=_FILL_ARRANQUE, align=_AL_C, font=_FONT_MUTED)

    for i, e in enumerate(legs):
        r = FIRST_LEG + i
        lectura = _az_campo_lectura(e, azimut_directo=azimut_directo)
        dist = float(e.get("distancia") or 0)
        ang_v = e.get("angulo_vertical")
        hi = _hi_por_armada(armadas, e)
        ht = e.get("altura_objetivo")
        if ht is None:
            ht = 0

        _cell(ws, r, 1, e.get("orden") or (i + 1), fill=_FILL_CALC, align=_AL_C)
        _cell(ws, r, 2, e.get("armada_orden") or "—", fill=_FILL_CALC, align=_AL_C)
        _cell(
            ws,
            r,
            3,
            str(e.get("nombre_punto") or f"P{i + 1}"),
            fill=_FILL_CALC,
            font=Font(bold=True, size=9),
            align=_AL_L,
        )
        _cell(
            ws,
            r,
            4,
            round(lectura, 8) if lectura is not None else 0.0,
            fill=_FILL_INPUT,
            align=_AL_R,
            num_fmt="0.000000",
        )
        _cell(ws, r, 5, dist, fill=_FILL_INPUT, align=_AL_R, num_fmt="0.000")
        _cell(
            ws,
            r,
            6,
            float(ang_v) if ang_v is not None else 90.0,
            fill=_FILL_INPUT,
            align=_AL_R,
            num_fmt="0.000000",
        )
        _cell(ws, r, 7, float(hi), fill=_FILL_INPUT, align=_AL_R, num_fmt="0.000")
        _cell(ws, r, 8, float(ht), fill=_FILL_INPUT, align=_AL_R, num_fmt="0.000")

        # I Ang.deriv — mismo despeje que angulo_obs_derivado_desde_* en backend
        if azimut_directo:
            if i == 0:
                _cell(ws, r, 9, f"=MOD(D{r}-Resumen!$B$15,360)", fill=_FILL_CALC, align=_AL_R, num_fmt="0.000000")
            else:
                prev = r - 1
                _cell(
                    ws,
                    r,
                    9,
                    f"=MOD(D{r}-D{prev}-180,360)",
                    fill=_FILL_CALC,
                    align=_AL_R,
                    num_fmt="0.000000",
                )
        else:
            _cell(ws, r, 9, f"=D{r}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.000000")

        # J Ang.corr = Ang − Diff/n_angulos   (corr = −Diff/n)
        _cell(
            ws,
            r,
            10,
            f"=I{r}-Resumen!$B$28/MAX(Resumen!$B$20,1)",
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.000000",
        )

        # K Az corr
        if azimut_directo:
            if i == 0:
                _cell(ws, r, 11, f"=D{r}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.000000")
            else:
                prev = r - 1
                _cell(
                    ws,
                    r,
                    11,
                    f"=MOD(K{prev}+180+J{r},360)",
                    fill=_FILL_CALC,
                    align=_AL_R,
                    num_fmt="0.000000",
                )
        else:
            if i == 0:
                _cell(ws, r, 11, "=Resumen!$B$15", fill=_FILL_CALC, align=_AL_R, num_fmt="0.000000")
            else:
                prev = r - 1
                _cell(
                    ws,
                    r,
                    11,
                    f"=MOD(K{prev}+180+J{r},360)",
                    fill=_FILL_CALC,
                    align=_AL_R,
                    num_fmt="0.000000",
                )

        _cell(ws, r, 12, f"=E{r}*COS(RADIANS(K{r}))", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(ws, r, 13, f"=E{r}*SIN(RADIANS(K{r}))", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(
            ws,
            r,
            14,
            f"=IF(ABS(SIN(RADIANS(F{r})))<1E-9,0,G{r}+E{r}*COS(RADIANS(F{r}))/SIN(RADIANS(F{r}))-H{r})",
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.0000",
        )
        _cell(
            ws,
            r,
            15,
            f"=IF(Resumen!$B$36<=0,0,-Resumen!$B$34*E{r}/Resumen!$B$36)",
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.0000",
        )
        _cell(
            ws,
            r,
            16,
            f"=IF(Resumen!$B$36<=0,0,-Resumen!$B$35*E{r}/Resumen!$B$36)",
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.0000",
        )
        _cell(
            ws,
            r,
            17,
            f"=IF(Resumen!$B$36<=0,0,-Resumen!$B$37*E{r}/Resumen!$B$36)",
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.0000",
        )

        prev_r = START_ROW if i == 0 else (r - 1)
        _cell(ws, r, 18, f"=R{prev_r}+L{r}+O{r}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(ws, r, 19, f"=S{prev_r}+M{r}+P{r}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(
            ws,
            r,
            20,
            f'=IF(T{prev_r}="","",T{prev_r}+N{r}+Q{r})',
            fill=_FILL_CALC,
            align=_AL_R,
            num_fmt="0.0000",
        )

        # U En Σ: 1º tramo excluido si hay orientación (amarre inicial)
        if i == 0:
            _cell(
                ws,
                r,
                21,
                '=IF(Resumen!$B$18=1,0,1)',
                fill=_FILL_CALC,
                align=_AL_C,
                num_fmt="0",
            )
        else:
            _cell(ws, r, 21, 1, fill=_FILL_CALC, align=_AL_C, num_fmt="0")

    if n == 0:
        LAST_LEG = START_ROW

    note_row = max(LAST_LEG + 2, 8)
    _cell(
        ws,
        note_row,
        1,
        "Bowditch: Corr = −Err × Dist / Perímetro (Resumen!B34:B37). "
        "Diff angular = Resumen!B28 = Σobs − Σteórica. "
        "Ang.corr = Ang.deriv − Diff / n_ángulos.",
        font=_FONT_MUTED,
        border=False,
        align=_AL_L,
    )
    ws.merge_cells(start_row=note_row, start_column=1, end_row=note_row, end_column=21)

    widths = {
        "A": 5, "B": 7, "C": 12, "D": 11, "E": 9, "F": 10, "G": 7, "H": 7,
        "I": 11, "J": 11, "K": 10, "L": 9, "M": 9, "N": 9, "O": 9, "P": 9, "Q": 9,
        "R": 11, "S": 11, "T": 10, "U": 6,
    }
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A5"

    # ══════════════════════════════════════════════════════════════════════════
    # Hoja Esquema
    # ══════════════════════════════════════════════════════════════════════════
    ws2 = wb.create_sheet("Esquema")
    _cell(
        ws2,
        1,
        1,
        "Esquema de la poligonal (coordenadas ajustadas)",
        fill=_FILL_TITLE,
        font=_FONT_TITLE,
        border=False,
    )
    ws2.merge_cells("A1:D1")
    _cell(
        ws2,
        2,
        1,
        "Este/Norte referencian Cartera. Al editar azimut/ángulo o distancia, el gráfico se actualiza al recalcular.",
        font=_FONT_MUTED,
        border=False,
    )
    ws2.merge_cells("A2:F2")

    for c, h in enumerate(["#", "Punto", "Este aj. (m)", "Norte aj. (m)", "Cota aj. (m)"], 1):
        _cell(ws2, 4, c, h, fill=_FILL_HDR, font=_FONT_HDR, align=_AL_C)

    _cell(ws2, 5, 1, 0, fill=_FILL_ARRANQUE, align=_AL_C)
    _cell(ws2, 5, 2, f"=Cartera!C{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_L)
    _cell(ws2, 5, 3, f"=Cartera!S{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")
    _cell(ws2, 5, 4, f"=Cartera!R{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")
    _cell(ws2, 5, 5, f"=Cartera!T{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")

    for i in range(n):
        r = 6 + i
        src = FIRST_LEG + i
        _cell(ws2, r, 1, i + 1, fill=_FILL_CALC, align=_AL_C)
        _cell(ws2, r, 2, f"=Cartera!C{src}", fill=_FILL_CALC, align=_AL_L)
        _cell(ws2, r, 3, f"=Cartera!S{src}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(ws2, r, 4, f"=Cartera!R{src}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")
        _cell(ws2, r, 5, f"=Cartera!T{src}", fill=_FILL_CALC, align=_AL_R, num_fmt="0.0000")

    close_r = 6 + n
    if n > 0:
        _cell(ws2, close_r, 1, n + 1, fill=_FILL_ARRANQUE, align=_AL_C)
        _cell(ws2, close_r, 2, f'=Cartera!C{START_ROW}&" (cierre)"', fill=_FILL_ARRANQUE, align=_AL_L)
        _cell(ws2, close_r, 3, f"=Cartera!S{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")
        _cell(ws2, close_r, 4, f"=Cartera!R{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")
        _cell(ws2, close_r, 5, f"=Cartera!T{START_ROW}", fill=_FILL_ARRANQUE, align=_AL_R, num_fmt="0.0000")

        chart = ScatterChart()
        chart.title = "Esquema — Este vs Norte (ajustado)"
        chart.style = 10
        chart.x_axis.title = "Este (m)"
        chart.y_axis.title = "Norte (m)"
        chart.height = 14
        chart.width = 18
        xvalues = Reference(ws2, min_col=3, min_row=5, max_row=close_r)
        yvalues = Reference(ws2, min_col=4, min_row=5, max_row=close_r)
        series = Series(yvalues, xvalues, title="Poligonal")
        series.marker.symbol = "circle"
        series.marker.size = 7
        series.graphicalProperties.line.width = 15000
        chart.series.append(series)
        chart.legend = None
        ws2.add_chart(chart, "G4")

    for col, w in [("A", 5), ("B", 18), ("C", 14), ("D", 14), ("E", 12)]:
        ws2.column_dimensions[col].width = w

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
