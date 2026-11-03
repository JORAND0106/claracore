"""Protección contra entradas duplicadas (remisión, idempotencia, soft-duplicado reciente)."""
from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger(__name__)

VENTANA_SOFT_DUP_MINUTOS = 10
TOLERANCIA_SALDO = 0.0001


def fingerprint_items(orden_compra_id: Optional[int], items: List[dict]) -> str:
    oid = int(orden_compra_id or 0)
    parts: List[str] = []
    for it in items or []:
        oci = it.get("orden_compra_item_id")
        if oci in (None, "", 0):
            continue
        try:
            cant = round(float(it.get("cantidad_recibida") or 0), 4)
        except (TypeError, ValueError):
            cant = 0.0
        if cant <= 0:
            continue
        parts.append(f"{int(oci)}:{cant}")
    parts.sort()
    return f"{oid}|{','.join(parts)}"


def mensaje_remision_duplicada(codigo: str) -> str:
    return (
        f"Este N.º de remisión ya se registró con este proveedor en {codigo}. "
        "No se puede crear otra entrada igual."
    )


def mensaje_soft_duplicado(codigo: str, minutos: float) -> str:
    mins = max(1, int(round(minutos)))
    return (
        f"Ya hay una entrada igual hace {mins} minuto{'s' if mins != 1 else ''} ({codigo}). "
        "¿Es otra llegada?"
    )


def lookup_entrada_por_idempotency(sb, contrato_id: int, key: str) -> Optional[dict]:
    k = (key or "").strip()
    if not k:
        return None
    try:
        rows = (
            sb.table("almacen_entrada")
            .select("id, codigo, numero_entrada, idempotency_key, created_at")
            .eq("contrato_id", int(contrato_id))
            .eq("idempotency_key", k)
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _log.warning("lookup idempotency_key: %s", exc)
        return None
    return rows[0] if rows else None


def lookup_entrada_similar_reciente(
    sb,
    contrato_id: int,
    *,
    orden_compra_id: Optional[int],
    items: List[dict],
    ventana_minutos: int = VENTANA_SOFT_DUP_MINUTOS,
    exclude_entrada_id: Optional[int] = None,
) -> Optional[dict]:
    """Misma OC + mismos oci/cantidades en la ventana (otra remisión)."""
    if not orden_compra_id:
        return None
    fp = fingerprint_items(orden_compra_id, items)
    if "|" not in fp or fp.endswith("|"):
        return None
    desde = (datetime.now(timezone.utc) - timedelta(minutes=int(ventana_minutos))).isoformat()
    try:
        q = (
            sb.table("almacen_entrada")
            .select("id, codigo, numero_entrada, created_at, orden_compra_id, numero_documento")
            .eq("contrato_id", int(contrato_id))
            .eq("tipo", "recibo")
            .eq("orden_compra_id", int(orden_compra_id))
            .gte("created_at", desde)
            .order("created_at", desc=True)
            .limit(20)
        )
        rows = q.execute().data or []
    except Exception as exc:
        _log.warning("lookup soft-duplicado: %s", exc)
        return None

    target_parts = set(fp.split("|", 1)[1].split(",")) if "|" in fp else set()
    for row in rows:
        eid = row.get("id")
        if exclude_entrada_id and eid is not None and int(eid) == int(exclude_entrada_id):
            continue
        ei_rows = (
            sb.table("almacen_entrada_item")
            .select("orden_compra_item_id, cantidad_recibida")
            .eq("entrada_id", int(eid))
            .execute()
            .data
            or []
        )
        other_fp = fingerprint_items(orden_compra_id, [
            {
                "orden_compra_item_id": r.get("orden_compra_item_id"),
                "cantidad_recibida": r.get("cantidad_recibida"),
            }
            for r in ei_rows
        ])
        other_parts = set(other_fp.split("|", 1)[1].split(",")) if "|" in other_fp else set()
        if other_parts and other_parts == target_parts:
            created = row.get("created_at")
            mins = float(ventana_minutos)
            try:
                if created:
                    ts = datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                    mins = max(0.0, (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds() / 60.0)
            except Exception:
                pass
            return {
                "entrada_id": eid,
                "codigo_entrada": row.get("codigo") or row.get("numero_entrada"),
                "created_at": created,
                "minutos": mins,
                "fingerprint": fp,
                "message": mensaje_soft_duplicado(
                    str(row.get("codigo") or row.get("numero_entrada") or eid),
                    mins,
                ),
            }
    return None


def hash_intento_fallback(body: dict) -> str:
    """Hash estable si el cliente no envía idempotency_key (último recurso)."""
    raw = "|".join([
        str(body.get("tipo") or ""),
        str(body.get("orden_compra_id") or ""),
        str((body.get("numero_documento") or "")).strip().upper(),
        str(body.get("proveedor_id") or ""),
        fingerprint_items(body.get("orden_compra_id"), body.get("items") or []),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def umbral_alerta_saldo_oc(
    saldo_restante: float,
    cantidad_pedida: float,
    *,
    amarillo_pct: float = 20.0,
    rojo_pct: float = 5.0,
) -> Optional[str]:
    """Devuelve 'rojo' | 'amarillo' | None según saldo restante / pedido."""
    pedida = float(cantidad_pedida or 0)
    rest = max(0.0, float(saldo_restante or 0))
    if pedida <= TOLERANCIA_SALDO:
        return None
    pct = (rest / pedida) * 100.0
    if rest <= TOLERANCIA_SALDO or pct <= float(rojo_pct):
        return "rojo"
    if pct <= float(amarillo_pct):
        return "amarillo"
    return None
