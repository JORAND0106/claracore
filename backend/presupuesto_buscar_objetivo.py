"""
Cálculo de «Buscar objetivo» con precisión completa (sin round a 2 dp en cant).

Solo para el registro comodín de cierre; el resto del presupuesto sigue con
round(área×ancho×espesor, 2) en update_presupuesto_item / bulk_recalcular.
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Optional

DimKey = Literal["area_long_nod", "ancho", "espesor"]


def _f(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def puede_despejar_dimension(dim: str, area: float, ancho: float, espesor: float) -> Optional[str]:
    """None si OK; mensaje de error si no."""
    a, w, e = _f(area), _f(ancho), _f(espesor)
    product = bool(w or e)
    if dim == "area_long_nod":
        if not product:
            return None
        if w * e == 0:
            return "Para ajustar Área/Long/Nodo en modo producto, Ancho y Espesor deben ser ≠ 0."
        return None
    if dim == "ancho":
        if a * e == 0:
            return "Para ajustar Ancho, Área/Long/Nodo y Espesor deben ser ≠ 0."
        return None
    if dim == "espesor":
        if a * w == 0:
            return "Para ajustar Espesor, Área/Long/Nodo y Ancho deben ser ≠ 0."
        return None
    return "Dimensión no válida."


def cant_total_exacta(area: float, ancho: float, espesor: float) -> float:
    """Producto sin redondeo a 2 decimales."""
    a, w, e = _f(area), _f(ancho), _f(espesor)
    if w or e:
        return a * w * e
    return a


def despejar_dimension(
    dim: str, cant_target: float, area: float, ancho: float, espesor: float
) -> Optional[float]:
    err = puede_despejar_dimension(dim, area, ancho, espesor)
    if err:
        return None
    a, w, e = _f(area), _f(ancho), _f(espesor)
    ct = _f(cant_target)
    if dim == "area_long_nod":
        if not (w or e):
            return ct
        return ct / (w * e)
    if dim == "ancho":
        return ct / (a * e)
    if dim == "espesor":
        return ct / (a * w)
    return None


def calcular_ajuste_buscar_objetivo(
    *,
    presupuesto_actual: float,
    presupuesto_objetivo: float,
    costo_directo_registro: float,
    vlr_unitario: float,
    area: float,
    ancho: float,
    espesor: float,
    dimension: str,
) -> Dict[str, Any]:
    """
    Despeja la dimensión con precisión completa.

    - cant_nueva = CD_objetivo_reg / vlr  (sin round a 2 dp)
    - costo_directo del registro = CD exacto (entero) para que Σ cierre en el objetivo
    - total_nuevo = presupuesto_objetivo (exacto)
    """
    actual = int(round(_f(presupuesto_actual)))
    objetivo = int(round(_f(presupuesto_objetivo)))
    cd_old = int(round(_f(costo_directo_registro)))
    vlr = _f(vlr_unitario)
    a, w, e = _f(area), _f(ancho), _f(espesor)

    if vlr <= 0:
        return {"ok": False, "error": "El registro no tiene valor unitario > 0."}

    delta = objetivo - actual
    cd_new = cd_old + delta
    if cd_new < 0:
        return {
            "ok": False,
            "error": "El objetivo exige un costo directo negativo en el registro.",
        }

    err = puede_despejar_dimension(dimension, a, w, e)
    if err:
        return {"ok": False, "error": err}

    # Cantidad exacta (sin truncar a 2 dp) para que cant × vlr = cd_new en aritmética real.
    cant_nueva = cd_new / vlr
    if cant_nueva < 0:
        return {"ok": False, "error": "No se pudo calcular la cantidad objetivo."}

    dim_nueva = despejar_dimension(dimension, cant_nueva, a, w, e)
    if dim_nueva is None or not (dim_nueva == dim_nueva):  # NaN check
        return {"ok": False, "error": "No se pudo despejar la dimensión seleccionada."}

    dims = {"area_long_nod": a, "ancho": w, "espesor": e, dimension: dim_nueva}
    cant_verif = cant_total_exacta(
        dims["area_long_nod"], dims["ancho"], dims["espesor"]
    )

    dim_actual = a if dimension == "area_long_nod" else (w if dimension == "ancho" else e)

    return {
        "ok": True,
        "dimension": dimension,
        "dim_actual": dim_actual,
        "dim_nueva": dim_nueva,
        "cant_actual": cant_total_exacta(a, w, e),
        "cant_nueva": cant_verif,
        "cd_registro_actual": cd_old,
        "cd_registro_nuevo": cd_new,
        "total_actual": actual,
        "total_nuevo": objetivo,
        "presupuesto_objetivo": objetivo,
        "vlr_unitario": vlr,
        "dims": dims,
    }
