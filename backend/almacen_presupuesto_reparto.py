"""Reparto proporcional de cantidad entre registros de presupuesto (por saldo)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence


def _to_float(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def round_cant(v: Any, digits: int = 4) -> float:
    n = _to_float(v)
    f = 10 ** digits
    return round(n * f + (1e-12 if n >= 0 else -1e-12)) / f


def normalize_presupuesto_ids(ids: Optional[Sequence[Any]], fallback_id: Any = None) -> List[int]:
    out: List[int] = []
    seen = set()
    for raw in ids or []:
        try:
            n = int(raw)
        except (TypeError, ValueError):
            continue
        if n <= 0 or n in seen:
            continue
        seen.add(n)
        out.append(n)
    if not out and fallback_id is not None:
        try:
            n = int(fallback_id)
        except (TypeError, ValueError):
            n = 0
        if n > 0:
            out.append(n)
    return out


def total_saldo_registros(registros: Sequence[dict]) -> float:
    return round_cant(sum(max(0.0, _to_float(r.get("saldo_disponible"))) for r in (registros or [])))


def repartir_cantidad_proporcional(
    cantidad: Any,
    registros: Sequence[dict],
) -> List[Dict[str, Any]]:
    """Reparte ``cantidad`` entre registros con peso = saldo_disponible (> 0).

    El último tramo absorbe el residuo para que la suma sea exacta.
    """
    cant = _to_float(cantidad)
    rows = []
    for r in registros or []:
        try:
            pid = int(r.get("presupuesto_id"))
        except (TypeError, ValueError):
            continue
        if pid <= 0:
            continue
        rows.append({
            "presupuesto_id": pid,
            "saldo_disponible": max(0.0, _to_float(r.get("saldo_disponible"))),
        })
    if not rows or cant <= 0:
        return []

    total_saldo = sum(r["saldo_disponible"] for r in rows)
    n = len(rows)
    if total_saldo <= 0:
        rest = cant
        out = []
        for i, r in enumerate(rows):
            share = round_cant(rest) if i == n - 1 else round_cant(cant / n)
            rest = round_cant(rest - share)
            out.append({
                "presupuesto_id": r["presupuesto_id"],
                "cantidad": share,
                "saldo_disponible": r["saldo_disponible"],
                "peso": 1.0 / n,
            })
        return out

    rest = cant
    out = []
    for i, r in enumerate(rows):
        peso = r["saldo_disponible"] / total_saldo
        share = round_cant(rest) if i == n - 1 else round_cant(cant * peso)
        rest = round_cant(rest - share)
        out.append({
            "presupuesto_id": r["presupuesto_id"],
            "cantidad": share,
            "saldo_disponible": r["saldo_disponible"],
            "peso": peso,
        })
    return out
