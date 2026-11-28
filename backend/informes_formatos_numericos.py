"""
Formatos numéricos únicos CC-SUB / CC-MES (PDF y Excel).

- Dimensiones: 3 decimales (p. ej. 1.000).
- Cantidades (Cant. Total y agregados): regla única SICOE
  (entero sin dp; si no 2 dp; <0,01 con los dp necesarios).
- Valores: Round0 mostrado con 2 decimales (p. ej. $ 13,239,136.00).

Presentación alineada a sicoe_cantidad_redondeo.
"""
from __future__ import annotations

import math
from typing import Any, Optional

# ── Constantes Excel (number_format openpyxl) ────────────────────────────────
EXCEL_FMT_DIM = "0.000"
# Enteros sin forzar .00; decimales visibles según el valor ya redondeado.
EXCEL_FMT_CANT = "#,##0.############"
EXCEL_FMT_MONEY = '"$"#,##0.00'


def _to_float(n: Any) -> Optional[float]:
    if n is None or n == "":
        return None
    try:
        x = float(n)
    except (TypeError, ValueError):
        try:
            x = float(str(n).replace(",", "").replace(" ", "").strip())
        except Exception:
            return None
    if math.isnan(x) or math.isinf(x):
        return None
    return x


def fmt_dim_informe(n: Any, *, empty: str = "—") -> str:
    """Dimensión PDF: siempre 3 decimales (1.000)."""
    x = _to_float(n)
    if x is None:
        return empty
    return f"{round(x, 3):,.3f}"


def fmt_cant_informe(n: Any, *, empty: str = "—") -> str:
    """Cantidad PDF: misma regla única que formatear_cantidad_total."""
    from sicoe_cantidad_redondeo import formatear_cantidad_total

    x = _to_float(n)
    if x is None:
        return empty
    return formatear_cantidad_total(x, empty=empty)


def fmt_money_informe(n: Any, *, empty: str = "—") -> str:
    """
    Valor PDF: Round0 del importe, mostrado siempre con 2 decimales
    ($ 13,239,136.00) — idéntico al formato Excel ``$"#,##0.00``.
    """
    x = _to_float(n)
    if x is None:
        return empty
    return f"$ {round(x, 0):,.2f}"
