"""Reparto proporcional de transporte (Obra Ejecutada) — lógica pura."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def repartir_transporte_por_pk(
    filas: List[Dict[str, Any]],
    cantidad_reportar: float,
) -> Dict[str, Any]:
    """
    Peso = cant_compacta / total.
    Asignación redondeada a 2 decimales; el residuo de redondeo va al PK de mayor peso.
    """
    list_in: List[Dict[str, Any]] = []
    for f in filas or []:
        pk = str((f or {}).get("pk_id") or "").strip()
        try:
            cant = float((f or {}).get("cant_compacta") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        if pk and cant > 0:
            list_in.append({"pk_id": pk, "cant_compacta": cant})

    total_compacta = round(sum(x["cant_compacta"] for x in list_in), 6)
    try:
        qty = round(float(cantidad_reportar or 0), 2)
    except (TypeError, ValueError):
        qty = 0.0

    if total_compacta <= 0:
        return {
            "ok": False,
            "error": "La cantidad compacta de la selección es cero; no se puede repartir.",
            "total_compacta": 0.0,
            "filas": [],
            "total_asignado": 0.0,
        }
    if qty <= 0:
        return {
            "ok": False,
            "error": "Indique una cantidad a reportar mayor que cero.",
            "total_compacta": total_compacta,
            "filas": [],
            "total_asignado": 0.0,
        }

    out: List[Dict[str, Any]] = []
    for f in list_in:
        peso = f["cant_compacta"] / total_compacta
        cant_t = round(qty * peso, 2)
        out.append({
            "pk_id": f["pk_id"],
            "cant_compacta": f["cant_compacta"],
            "peso": peso,
            "cant_transporte": cant_t,
        })

    suma = round(sum(x["cant_transporte"] for x in out), 2)
    diff = round(qty - suma, 2)
    if diff != 0 and out:
        idx_max = 0
        for i in range(1, len(out)):
            if out[i]["cant_compacta"] > out[idx_max]["cant_compacta"]:
                idx_max = i
        out[idx_max]["cant_transporte"] = round(out[idx_max]["cant_transporte"] + diff, 2)

    total_asignado = round(sum(x["cant_transporte"] for x in out), 2)
    return {
        "ok": True,
        "total_compacta": total_compacta,
        "filas": out,
        "total_asignado": total_asignado,
    }


def normalizar_items_origen(items: Optional[List[Any]]) -> List[str]:
    seen = set()
    out: List[str] = []
    for x in items or []:
        s = str(x or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    out.sort(key=lambda v: (0, v.lower()) if v else (1, ""))
    # Orden numérico aproximado tipo ítem
    try:
        out.sort(key=lambda v: [int(p) if p.isdigit() else p for p in __import__("re").split(r"(\d+)", v)])
    except Exception:
        out.sort()
    return out


def elegir_ubicacion_origen(regs_pk: List[dict]) -> dict:
    """De varios registros del mismo PK, toma el de mayor cant_total."""
    best = None
    best_cant = -1.0
    for r in regs_pk or []:
        try:
            c = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            c = 0.0
        if best is None or c > best_cant:
            best = r
            best_cant = c
    return best or {}
