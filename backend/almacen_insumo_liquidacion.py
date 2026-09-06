"""
Liquidación del valor negociado al cambiar la cotización ganadora.

valor_negociado_total = valor_consumido_congelado
    + max(0, cantidad_negociada − cantidad_entradas_liquidada) × precio_ganador_actual

Al cambiar el precio ganador se congela el tramo de entradas aún no liquidado
al precio anterior y se revalúa solo el remanente pendiente al precio nuevo.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

_log = logging.getLogger(__name__)

_EPS_PRECIO = 0.009  # ~1 centavo


def _f(v) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _round2(v: float) -> float:
    return float(round(float(v) + 0.0, 2))


def _round4(v: float) -> float:
    return float(round(float(v) + 0.0, 4))


def precio_ganadora_cambio(precio_anterior, precio_nuevo) -> bool:
    """True si el valor de compra de referencia cambió de forma material."""
    return abs(_f(precio_nuevo) - _f(precio_anterior)) > _EPS_PRECIO


def calcular_valor_negociado_acumulado(
    *,
    cantidad_negociada: Optional[float],
    precio_actual: Optional[float],
    valor_consumido_congelado: float = 0.0,
    cantidad_entradas_liquidada: float = 0.0,
) -> Optional[float]:
    """
    Valor total negociado acumulado tras liquidaciones.
    Sin cantidad/precio válidos → None (no hay pacto monetario).
    """
    cant = _f(cantidad_negociada) if cantidad_negociada is not None else 0.0
    precio = _f(precio_actual) if precio_actual is not None else 0.0
    if cant <= 0 or precio <= 0:
        if _f(valor_consumido_congelado) > 0:
            return _round2(_f(valor_consumido_congelado))
        return None
    pendiente_qty = max(0.0, cant - _f(cantidad_entradas_liquidada))
    return _round2(_f(valor_consumido_congelado) + pendiente_qty * precio)


def calcular_liquidacion_ganadora(
    *,
    cantidad_negociada: Optional[float],
    precio_anterior: Optional[float],
    precio_nuevo: Optional[float],
    cantidad_entradas: float,
    valor_consumido_congelado: float = 0.0,
    cantidad_entradas_liquidada: float = 0.0,
    valor_negociado_total_antes: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Calcula el estado post-liquidación (puro, sin I/O).

    Congela (cantidad_entradas − cantidad_entradas_liquidada) × precio_anterior
    y revalúa el remanente (cantidad_negociada − cantidad_entradas) × precio_nuevo.
    """
    cant_neg = _f(cantidad_negociada) if cantidad_negociada is not None else 0.0
    p_ant = _f(precio_anterior)
    p_nuevo = _f(precio_nuevo)
    qty_ent = max(0.0, _f(cantidad_entradas))
    qty_liq = max(0.0, _f(cantidad_entradas_liquidada))
    congelado = max(0.0, _f(valor_consumido_congelado))

    delta_qty = max(0.0, _round4(qty_ent - qty_liq))
    delta_valor = _round2(delta_qty * p_ant) if p_ant > 0 else 0.0
    congelado_nuevo = _round2(congelado + delta_valor)
    qty_liq_nueva = _round4(qty_ent)

    pendiente_qty = max(0.0, _round4(cant_neg - qty_ent))
    valor_pendiente = _round2(pendiente_qty * p_nuevo) if p_nuevo > 0 else 0.0
    vnt_despues = _round2(congelado_nuevo + valor_pendiente)

    return {
        "cantidad_negociada": cant_neg if cant_neg > 0 else None,
        "valor_compra_anterior": _round2(p_ant) if p_ant > 0 else None,
        "valor_compra_nuevo": _round2(p_nuevo) if p_nuevo > 0 else None,
        "cantidad_entradas": _round4(qty_ent),
        "cantidad_entradas_prev_liquidada": _round4(qty_liq),
        "cantidad_congelada_delta": delta_qty,
        "valor_congelado_delta": delta_valor,
        "valor_consumido_congelado": congelado_nuevo,
        "cantidad_entradas_liquidada": qty_liq_nueva,
        "cantidad_pendiente": pendiente_qty,
        "valor_pendiente_revaluado": valor_pendiente,
        "valor_negociado_total_antes": (
            _round2(_f(valor_negociado_total_antes))
            if valor_negociado_total_antes is not None
            else None
        ),
        "valor_negociado_total_despues": vnt_despues,
    }


def calcular_saldo_por_consumir(
    valor_negociado_total: Optional[float],
    valor_entradas: float,
) -> Optional[float]:
    """Saldo por consumir = valor negociado acumulado − valor de entradas."""
    if valor_negociado_total is None:
        return None
    return _round2(_f(valor_negociado_total) - _f(valor_entradas))


def cantidad_entradas_insumo(sb, contrato_id: int, insumo_id: int) -> float:
    """
    Suma cantidad_recibida de líneas de entrada ligadas al insumo en el contrato.
    Cadena: solicitud_item → orden_compra_item → entrada_item (+ filtro entrada.contrato_id).
    """
    iid = int(insumo_id)
    cid = int(contrato_id)
    si_rows = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("insumo_id", iid)
        .execute()
        .data
        or []
    )
    si_ids = [int(r["id"]) for r in si_rows if r.get("id") is not None]
    if not si_ids:
        return 0.0

    oci_ids: list = []
    for i in range(0, len(si_ids), 200):
        chunk = si_ids[i:i + 200]
        oci_ids.extend([
            int(o["id"])
            for o in (
                sb.table("almacen_orden_compra_item")
                .select("id")
                .in_("solicitud_item_id", chunk)
                .execute()
                .data
                or []
            )
            if o.get("id") is not None
        ])
    oci_ids = sorted(set(oci_ids))
    if not oci_ids:
        return 0.0

    ei_rows: list = []
    for i in range(0, len(oci_ids), 200):
        chunk = oci_ids[i:i + 200]
        ei_rows.extend(
            sb.table("almacen_entrada_item")
            .select("id, entrada_id, cantidad_recibida")
            .in_("orden_compra_item_id", chunk)
            .execute()
            .data
            or []
        )
    if not ei_rows:
        return 0.0

    entrada_ids = sorted({
        int(ei["entrada_id"]) for ei in ei_rows if ei.get("entrada_id") is not None
    })
    ok_entradas: set = set()
    for i in range(0, len(entrada_ids), 200):
        chunk = entrada_ids[i:i + 200]
        for e in (
            sb.table("almacen_entrada")
            .select("id")
            .eq("contrato_id", cid)
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            if e.get("id") is not None:
                ok_entradas.add(int(e["id"]))

    total = 0.0
    for ei in ei_rows:
        if int(ei.get("entrada_id") or 0) not in ok_entradas:
            continue
        total += _f(ei.get("cantidad_recibida"))
    return _round4(total)


def aplicar_liquidacion_en_update(
    sb,
    *,
    contrato_id: int,
    insumo_id: int,
    user_id: int,
    existing: dict,
    payload: dict,
    motivo: str = "cambio_ganadora",
) -> Tuple[dict, Optional[dict]]:
    """
    Ajusta payload con liquidación si cambió el precio ganador, o recalcula
    valor_negociado_total con la base congelada existente.

    Retorna (payload, registro_liquidacion|None).
    """
    precio_ant = existing.get("valor_compra_referencia")
    precio_nuevo = payload.get("valor_compra_referencia", precio_ant)
    cant_neg = payload.get("cantidad_negociada")
    if cant_neg is None:
        cant_neg = existing.get("cantidad_negociada")

    congelado = _f(existing.get("valor_consumido_congelado"))
    qty_liq = _f(existing.get("cantidad_entradas_liquidada"))
    vnt_antes = existing.get("valor_negociado_total")

    liquidacion_row = None
    if precio_ganadora_cambio(precio_ant, precio_nuevo):
        try:
            qty_ent = cantidad_entradas_insumo(sb, contrato_id, insumo_id)
        except Exception:
            _log.exception(
                "No se pudo leer entradas para liquidar insumo=%s contrato=%s",
                insumo_id,
                contrato_id,
            )
            qty_ent = qty_liq

        liq = calcular_liquidacion_ganadora(
            cantidad_negociada=cant_neg,
            precio_anterior=precio_ant,
            precio_nuevo=precio_nuevo,
            cantidad_entradas=qty_ent,
            valor_consumido_congelado=congelado,
            cantidad_entradas_liquidada=qty_liq,
            valor_negociado_total_antes=vnt_antes,
        )
        payload["valor_consumido_congelado"] = liq["valor_consumido_congelado"]
        payload["cantidad_entradas_liquidada"] = liq["cantidad_entradas_liquidada"]
        payload["valor_negociado_total"] = liq["valor_negociado_total_despues"]

        liquidacion_row = {
            "insumo_id": int(insumo_id),
            "contrato_id": int(contrato_id),
            "valor_compra_anterior": liq["valor_compra_anterior"],
            "valor_compra_nuevo": liq["valor_compra_nuevo"],
            "cantidad_negociada": liq["cantidad_negociada"],
            "cantidad_entradas": liq["cantidad_entradas"],
            "cantidad_entradas_prev_liquidada": liq["cantidad_entradas_prev_liquidada"],
            "cantidad_congelada_delta": liq["cantidad_congelada_delta"],
            "valor_congelado_delta": liq["valor_congelado_delta"],
            "valor_consumido_congelado": liq["valor_consumido_congelado"],
            "cantidad_pendiente": liq["cantidad_pendiente"],
            "valor_pendiente_revaluado": liq["valor_pendiente_revaluado"],
            "valor_negociado_total_antes": liq["valor_negociado_total_antes"],
            "valor_negociado_total_despues": liq["valor_negociado_total_despues"],
            "cotizacion_numero_anterior": existing.get("cotizacion_numero"),
            "cotizacion_numero_nueva": payload.get("cotizacion_numero"),
            "motivo": motivo,
            "created_by": int(user_id) if user_id else None,
        }
    else:
        # Sin cambio de ganadora: mantener congelado y recalcular VNT sobre esa base.
        payload["valor_consumido_congelado"] = _round2(congelado)
        payload["cantidad_entradas_liquidada"] = _round4(qty_liq)
        payload["valor_negociado_total"] = calcular_valor_negociado_acumulado(
            cantidad_negociada=cant_neg,
            precio_actual=precio_nuevo,
            valor_consumido_congelado=congelado,
            cantidad_entradas_liquidada=qty_liq,
        )

    return payload, liquidacion_row


def persistir_liquidacion(sb, row: dict) -> None:
    """Inserta el evento de liquidación (best-effort si la tabla aún no existe)."""
    try:
        sb.table("almacen_insumo_liquidacion_ganadora").insert(row).execute()
    except Exception:
        _log.exception(
            "No se pudo persistir liquidación ganadora insumo=%s (¿migración SQL pendiente?)",
            row.get("insumo_id"),
        )
