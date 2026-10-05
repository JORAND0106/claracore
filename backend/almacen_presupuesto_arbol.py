"""
Agregados de presupuesto por tramo y PK-ID para el acordeón de solicitud.

Funciones puras: no consultan la base. El servicio les pasa las filas y el acumulado.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Tuple


def to_float(v) -> float:
    if v is None or v == "":
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def norm_tramo(v) -> str:
    return " ".join(str(v or "").split())


def etiqueta_tramo(v) -> str:
    t = norm_tramo(v)
    return t or "Sin tramo"


def _natural_key(text: Optional[str]) -> tuple:
    s = str(text or "").strip()
    parts = re.split(r"(\d+)", s)
    key = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part.lower()))
    return tuple(key) if key else ((1, ""),)


def _acum(acum: Dict[Tuple[int, str], float], pid, pk) -> float:
    try:
        key = (int(pid), str(pk or "").strip())
    except (TypeError, ValueError):
        return 0.0
    return to_float(acum.get(key, 0.0))


def _fila_registro(row: dict, acum: Dict[Tuple[int, str], float]) -> dict:
    pid = int(row["id"])
    pk = str(row.get("pk_id") or "").strip()
    cant = to_float(row.get("cant_total"))
    usado = _acum(acum, pid, pk)
    return {
        "presupuesto_id": pid,
        "pk_id": pk,
        "tramo": norm_tramo(row.get("tramo")),
        "cant_total": cant,
        "cant_solicitada_acumulada": usado,
        "saldo_disponible": cant - usado,
        "abs_inicio": row.get("abs_inicio"),
        "abs_final": row.get("abs_final"),
        "abscisa_inicial": row.get("abscisa_inicial"),
        "abscisa_final": row.get("abscisa_final"),
        "nodo_inicio": row.get("nodo_inicio") if "nodo_inicio" in row else row.get("no_inicio"),
        "nodo_final": row.get("nodo_final") if "nodo_final" in row else row.get("no_final"),
        "calzada": row.get("calzada"),
        "unidad": row.get("und") or row.get("unidad"),
        "descripcion": row.get("descripcion"),
    }


def resumir_tramos(rows: Iterable[dict], acum: Optional[Dict[Tuple[int, str], float]] = None) -> List[dict]:
    """Un renglón por tramo: presupuestado, acumulado y saldo de todos sus PK-ID."""
    acum = acum or {}
    buckets: Dict[str, dict] = {}
    for row in rows or []:
        pk = str(row.get("pk_id") or "").strip()
        if not pk or row.get("id") is None:
            continue
        reg = _fila_registro(row, acum)
        key = reg["tramo"]
        bucket = buckets.get(key)
        if bucket is None:
            bucket = {
                "tramo": key,
                "etiqueta": etiqueta_tramo(key),
                "cant_total": 0.0,
                "cant_solicitada_acumulada": 0.0,
                "saldo_disponible": 0.0,
                "pk_ids": set(),
                "unidad": reg.get("unidad") or "",
            }
            buckets[key] = bucket
        bucket["cant_total"] += reg["cant_total"]
        bucket["cant_solicitada_acumulada"] += reg["cant_solicitada_acumulada"]
        bucket["saldo_disponible"] += reg["saldo_disponible"]
        bucket["pk_ids"].add(pk)
        if not bucket["unidad"] and reg.get("unidad"):
            bucket["unidad"] = reg["unidad"]
    out = []
    for bucket in buckets.values():
        out.append({
            "tramo": bucket["tramo"],
            "etiqueta": bucket["etiqueta"],
            "cant_total": bucket["cant_total"],
            "cant_solicitada_acumulada": bucket["cant_solicitada_acumulada"],
            "saldo_disponible": bucket["saldo_disponible"],
            "pk_count": len(bucket["pk_ids"]),
            "unidad": bucket["unidad"] or "",
        })
    out.sort(key=lambda r: (_natural_key(r["etiqueta"]), r["tramo"] == ""))
    return out


def resumir_pks(
    rows: Iterable[dict],
    acum: Optional[Dict[Tuple[int, str], float]] = None,
    *,
    con_registros: bool = False,
) -> List[dict]:
    """Un renglón por PK-ID. Con con_registros incluye el tercer nivel."""
    acum = acum or {}
    buckets: Dict[str, dict] = {}
    for row in rows or []:
        pk = str(row.get("pk_id") or "").strip()
        if not pk or row.get("id") is None:
            continue
        reg = _fila_registro(row, acum)
        bucket = buckets.get(pk)
        if bucket is None:
            bucket = {
                "pk_id": pk,
                "tramo": reg["tramo"],
                "cant_total": 0.0,
                "cant_solicitada_acumulada": 0.0,
                "saldo_disponible": 0.0,
                "unidad": reg.get("unidad") or "",
                "registros": [],
            }
            buckets[pk] = bucket
        bucket["cant_total"] += reg["cant_total"]
        bucket["cant_solicitada_acumulada"] += reg["cant_solicitada_acumulada"]
        bucket["saldo_disponible"] += reg["saldo_disponible"]
        if not bucket["unidad"] and reg.get("unidad"):
            bucket["unidad"] = reg["unidad"]
        if con_registros:
            bucket["registros"].append(reg)
    out = []
    for bucket in buckets.values():
        item = {
            "pk_id": bucket["pk_id"],
            "tramo": bucket["tramo"],
            "cant_total": bucket["cant_total"],
            "cant_solicitada_acumulada": bucket["cant_solicitada_acumulada"],
            "saldo_disponible": bucket["saldo_disponible"],
            "registros_count": len(bucket["registros"]) if con_registros else None,
            "unidad": bucket["unidad"] or "",
        }
        if con_registros:
            regs = bucket["registros"]
            regs.sort(key=lambda r: (_natural_key(str(r.get("abs_inicio") or "")), r["presupuesto_id"]))
            item["registros"] = regs
            item["registros_count"] = len(regs)
        else:
            # El conteo se calcula aparte si no vienen los registros.
            item.pop("registros_count", None)
        out.append(item)
    if not con_registros:
        counts: Dict[str, int] = {}
        for row in rows or []:
            pk = str(row.get("pk_id") or "").strip()
            if pk:
                counts[pk] = counts.get(pk, 0) + 1
        for item in out:
            item["registros_count"] = counts.get(item["pk_id"], 0)
    out.sort(key=lambda r: _natural_key(r["pk_id"]))
    return out
