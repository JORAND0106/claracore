"""
Redondeo de cantidad_total (SICOE Obra) — regla única de plataforma.

- Si el resultado (tras round a 2 dp) es entero → sin decimales (p. ej. 24).
- Si no → 2 decimales.
- Si el resultado exacto es < 0,01 y round a 2 quedaría 0 → se conservan
  los decimales necesarios para que no quede en cero.

Aplica al resultado. Datos de entrada (p. ej. peso varilla a 3 dp) conservan
sus propios decimales. costo_directo no se trata aquí (round 0 en el llamador).
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


def redondear_dimension(valor: Any) -> Optional[float]:
    """Redondea longitud/ancho/espesor/cantidad a 3 decimales (None si vacío)."""
    if _is_empty(valor):
        return None
    try:
        return float(round(float(valor), 3))
    except (TypeError, ValueError):
        return None


def redondear_cantidad_total_dinamico(valor_exacto: Any) -> float:
    """Aplica la regla única a un producto ya calculado."""
    try:
        exact = float(valor_exacto)
    except (TypeError, ValueError):
        return 0.0
    if exact != exact:  # NaN
        return 0.0
    if exact == 0.0:
        return 0.0

    abs_e = abs(exact)
    r2 = round(exact, 2)

    if abs_e < 0.01:
        if r2 != 0.0:
            return float(r2)
        for d in range(3, 13):
            rd = round(exact, d)
            if rd != 0.0:
                return float(rd)
        return float(exact)

    if float(r2).is_integer():
        return float(int(r2))
    return float(r2)


def calcular_cantidad_con_redondeo(
    longitud: Any = None,
    ancho: Any = None,
    espesor: Any = None,
    cantidad: Any = None,
) -> float:
    """
    Producto longitud × ancho × espesor [× cantidad] con redondeo único.
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
    if n == 0.0:
        return 0
    abs_n = abs(n)
    if abs_n < 0.01:
        for d in range(2, 13):
            if round(n, d) != 0.0:
                return d
        return 12
    r2 = round(n, 2)
    if float(r2).is_integer():
        return 0
    return 2


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


def cantidad_total_cumple_regla(valor: Any) -> bool:
    """True si el valor ya coincide con redondear_cantidad_total_dinamico(valor)."""
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return False
    if n != n:
        return False
    return float(n) == redondear_cantidad_total_dinamico(n)
