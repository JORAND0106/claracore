"""Dinero del módulo de Almacén: cálculo exacto y corte solo al mostrar.

Ningún paso del cálculo redondea ni trunca. La pantalla, el PDF y el correo
cortan el decimal hacia cero: 100,60 se ve como 100 y 42.979.871,06 como 42.979.871.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_DOWN
from typing import Any, Optional


def a_decimal(v: Any) -> Decimal:
    if isinstance(v, Decimal):
        return v
    if v is None or v == "":
        return Decimal("0")
    if isinstance(v, bool):
        return Decimal(int(v))
    try:
        return Decimal(str(v).strip().replace(",", "."))
    except Exception:
        return Decimal("0")


def producto(cant: Any, unit: Any) -> float:
    """Cantidad × valor unitario, sin redondear."""
    return float(a_decimal(cant) * a_decimal(unit))


def suma(*valores: Any) -> float:
    total = Decimal("0")
    for v in valores:
        total += a_decimal(v)
    return float(total)


def exacto(v: Any) -> float:
    return float(a_decimal(v))


def truncar_entero(v: Any) -> int:
    """Corta el decimal hacia cero. No redondea."""
    return int(a_decimal(v).to_integral_value(rounding=ROUND_DOWN))


def fmt_dinero(v: Any) -> str:
    """Pesos sin decimales, separador es-CO ($ 1.234)."""
    if v is None or v == "":
        return "—"
    try:
        n = truncar_entero(v)
    except Exception:
        return "—"
    signo = "-" if n < 0 else ""
    texto = f"{abs(n):,}".replace(",", ".")
    return f"{signo}$ {texto}"


def casi_igual(a: Any, b: Any) -> bool:
    """Igualdad del cálculo exacto. Tolera solo el residuo binario, no un centavo."""
    return abs(a_decimal(a) - a_decimal(b)) <= Decimal("0.0000001")


def unitario_se_ve_en_cero(v: Any) -> bool:
    """True si un valor distinto de cero se cortaría a $0."""
    try:
        d = a_decimal(v)
    except Exception:
        return False
    if d == 0:
        return False
    return truncar_entero(d) == 0


def dinero_o_none(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    return exacto(v)
