"""
Redondeo dinámico de cantidad_total (SICOE Obra).

Regla:
  - Calcular el producto exacto (factores vacíos = 1).
  - Si round(exacto, 2) >= 0.10 → round a 2 decimales.
  - Si round(exacto, 2) < 0.10 → round a 3 decimales.

costo_directo no se trata aquí (sigue round(..., 0) en el llamador).
"""
from __future__ import annotations

from typing import Any, Optional


def _is_empty(v: Any) -> bool:
    return v is None or v == ""


def _to_factor(v: Any) -> float:
    if _is_empty(v):
        return 1.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def redondear_cantidad_total_dinamico(valor_exacto: Any) -> float:
    """Aplica la regla de redondeo dinámico a un producto ya calculado."""
    try:
        exact = float(valor_exacto)
    except (TypeError, ValueError):
        return 0.0
    if exact != exact:  # NaN
        return 0.0
    r2 = round(exact, 2)
    if r2 >= 0.10:
        return float(r2)
    return float(round(exact, 3))


def calcular_cantidad_con_redondeo(
    longitud: Any = None,
    ancho: Any = None,
    espesor: Any = None,
    cantidad: Any = None,
) -> float:
    """
    Producto longitud × ancho × espesor [× cantidad] con redondeo dinámico.
    Factores vacíos cuentan como 1. Si todos vacíos → 0.
    """
    if (
        _is_empty(longitud)
        and _is_empty(ancho)
        and _is_empty(espesor)
        and _is_empty(cantidad)
    ):
        return 0.0
    lv = _to_factor(longitud)
    av = _to_factor(ancho)
    ev = _to_factor(espesor)
    cv = _to_factor(cantidad)
    if any(x != x for x in (lv, av, ev, cv)):  # NaN
        return 0.0
    return redondear_cantidad_total_dinamico(lv * av * ev * cv)


def decimales_cantidad_total(valor: Any) -> int:
    """Decimales a mostrar para un cantidad_total ya persistido."""
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return 2
    if n != n:
        return 2
    r2 = round(n, 2)
    return 2 if r2 >= 0.10 else 3


def formatear_cantidad_total(valor: Any, *, empty: str = "—") -> str:
    """Formato de visualización para PDF/Excel/HTML de informes."""
    if valor is None or valor == "":
        return empty
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return str(valor)
    if n != n:
        return empty
    dec = decimales_cantidad_total(n)
    return f"{n:,.{dec}f}"
