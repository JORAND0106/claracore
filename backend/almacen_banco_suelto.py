"""
Conversión de presupuesto en banco (compactado) a cantidad suelta.

El presupuesto guarda la cantidad en banco. La solicitud, la compra y el
consumo están en suelto. El rendimiento del insumo es el factor:

    disponible suelto = round(cantidad en banco × rendimiento, 2)

Si el rendimiento es 1, falta o no es válido, no hay conversión.
"""
from __future__ import annotations

from typing import Optional

TEXTO_SALDO_SIN_INSUMO = (
    "Saldo sin conversión de banco a suelto: la línea aún no tiene insumo asignado. "
    "Se ajustará cuando se asigne el insumo."
)


def _num(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def factor_banco_a_suelto(rendimiento) -> Optional[float]:
    """None cuando no hay que convertir (vacío, ≤ 0 o aproximadamente 1)."""
    n = _num(rendimiento)
    if n is None or n <= 0:
        return None
    if abs(n - 1.0) < 1e-9:
        return None
    return n


def fmt_cant_conversion(n) -> str:
    """Cantidad de la conversión, siempre con 2 decimales y separador es-CO."""
    try:
        v = float(n or 0)
    except (TypeError, ValueError):
        v = 0.0
    texto = f"{v:,.2f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def evaluar_conversion(cant_banco, rendimiento, unidad: str = "", *, tiene_insumo: bool) -> dict:
    """Techo de comparación y texto para mostrar el saldo."""
    banco = float(_num(cant_banco) or 0.0)
    und = str(unidad or "").strip()
    if not tiene_insumo:
        return {
            "cant_presupuestada_banco": banco,
            "cant_disponible_suelto": banco,
            "rendimiento": None,
            "conversion_banco_suelto": False,
            "conversion_pendiente": True,
            "texto_conversion": TEXTO_SALDO_SIN_INSUMO,
        }
    factor = factor_banco_a_suelto(rendimiento)
    if factor is None:
        return {
            "cant_presupuestada_banco": banco,
            "cant_disponible_suelto": banco,
            "rendimiento": _num(rendimiento) if (_num(rendimiento) or 0) > 0 else None,
            "conversion_banco_suelto": False,
            "conversion_pendiente": False,
            "texto_conversion": "",
        }
    suelto = round(banco * factor, 2)
    und_txt = f" {und}" if und else ""
    texto = (
        f"Presupuesto {fmt_cant_conversion(banco)}{und_txt} en banco "
        f"× rendimiento {fmt_cant_conversion(factor)} "
        f"= {fmt_cant_conversion(suelto)}{und_txt} disponibles"
    )
    return {
        "cant_presupuestada_banco": banco,
        "cant_disponible_suelto": suelto,
        "rendimiento": factor,
        "conversion_banco_suelto": True,
        "conversion_pendiente": False,
        "texto_conversion": texto,
    }


def aplicar_conversion_resumen(nodos, rendimiento, *, tiene_insumo: bool) -> list:
    """
    Ajusta el saldo de tramos, PK-ID o registros.

    cant_total sigue siendo la cantidad en banco. El saldo pasa a suelto
    cuando hay rendimiento distinto de 1.
    """
    out = []
    for nodo in nodos or []:
        item = dict(nodo)
        if isinstance(item.get("registros"), list):
            item["registros"] = aplicar_conversion_resumen(
                item["registros"], rendimiento, tiene_insumo=tiene_insumo,
            )
        meta = evaluar_conversion(
            item.get("cant_total"),
            rendimiento,
            item.get("unidad") or "",
            tiene_insumo=tiene_insumo,
        )
        if meta["conversion_banco_suelto"] or meta["conversion_pendiente"]:
            acum = float(_num(item.get("cant_solicitada_acumulada")) or 0.0)
            item["saldo_disponible"] = meta["cant_disponible_suelto"] - acum
            item["cant_presupuestada_banco"] = meta["cant_presupuestada_banco"]
            item["cant_disponible_suelto"] = meta["cant_disponible_suelto"]
            item["rendimiento"] = meta["rendimiento"]
            item["conversion_banco_suelto"] = meta["conversion_banco_suelto"]
            item["conversion_pendiente"] = meta["conversion_pendiente"]
            item["texto_conversion"] = meta["texto_conversion"]
        out.append(item)
    return out
