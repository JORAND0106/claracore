"""
Corrección de cantidad_total en so_registros no sellados según la regla única.

Sellado = bloqueado True o nivel máximo del contrato en Aprobado.
No modifica sellados. Recalcula Cant. Total desde dimensiones (o re-aplica
redondeo al valor guardado) y costo_directo = round(cant × VU, 0).
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Tuple

from sicoe_cantidad_redondeo import (
    cantidad_total_cumple_regla,
    redondear_cantidad_total_dinamico,
)
from sicoe_varilla import sicoe_calcular_cantidad_registro


def _num(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n:
        return None
    return n


def cantidad_esperada_registro(row: dict) -> Optional[float]:
    """Recalcula desde dims/varilla; si no hay dims, re-redondea cantidad_total."""
    has_dims = any(
        row.get(k) is not None and row.get(k) != ""
        for k in ("longitud", "ancho", "espesor", "cantidad", "peso_kg_m", "diametro_varilla")
    )
    if has_dims or row.get("es_varilla") is True:
        return float(
            sicoe_calcular_cantidad_registro(
                es_varilla=row.get("es_varilla"),
                longitud=row.get("longitud"),
                ancho=row.get("ancho"),
                espesor=row.get("espesor"),
                cantidad=row.get("cantidad"),
                peso_kg_m=row.get("peso_kg_m"),
                diametro_varilla=row.get("diametro_varilla"),
            )
        )
    cur = _num(row.get("cantidad_total"))
    if cur is None:
        return None
    return float(redondear_cantidad_total_dinamico(cur))


def costo_esperado(cant: float, vlr_unitario: Any) -> Optional[float]:
    vu = _num(vlr_unitario)
    if vu is None:
        return None
    try:
        return float(round(float(cant) * float(vu), 0))
    except (TypeError, ValueError):
        return None


def plan_correccion_registros(
    rows: List[dict],
    *,
    es_sellado: Callable[[dict], bool],
) -> Dict[str, Any]:
    """
    Devuelve resumen + patches sin escribir en BD.
    """
    corregidos: List[dict] = []
    sellados_sin_cambio = 0
    delta_cant = 0.0
    delta_costo = 0.0

    for row in rows or []:
        if es_sellado(row):
            sellados_sin_cambio += 1
            continue
        cur = _num(row.get("cantidad_total"))
        if cur is None:
            continue
        if cantidad_total_cumple_regla(cur):
            # Aun así, si hay dims la Cant puede no coincidir con el producto
            # bajo la nueva regla (p. ej. varilla 0.99→0.994). Recalcular.
            pass
        nueva = cantidad_esperada_registro(row)
        if nueva is None:
            continue
        if float(cur) == float(nueva):
            continue
        vu = row.get("vlr_unitario")
        costo_old = _num(row.get("costo_directo"))
        costo_new = costo_esperado(nueva, vu)
        patch = {
            "id": row.get("id"),
            "contrato_id": row.get("contrato_id"),
            "cantidad_total_antes": cur,
            "cantidad_total_despues": nueva,
            "costo_directo_antes": costo_old,
            "costo_directo_despues": costo_new,
            "delta_cantidad": float(nueva) - float(cur),
            "delta_costo": (
                (float(costo_new) - float(costo_old))
                if costo_new is not None and costo_old is not None
                else None
            ),
        }
        delta_cant += patch["delta_cantidad"]
        if patch["delta_costo"] is not None:
            delta_costo += patch["delta_costo"]
        corregidos.append(patch)

    return {
        "corregidos": len(corregidos),
        "sellados_sin_cambio": sellados_sin_cambio,
        "delta_cantidad_total": round(delta_cant, 6),
        "delta_costo_directo_total": round(delta_costo, 2),
        "detalle": corregidos,
    }
