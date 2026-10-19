"""Número de línea al guardar una solicitud, sin chocar el índice único."""
from __future__ import annotations

from typing import List, Optional


def planificar_numeros_linea(existing_rows, payload_items) -> List[int]:
    """
    Las líneas que ya existen conservan su numero_linea.
    Las nuevas reciben el siguiente número libre (max + 1, + 2, …),
    en el orden en que aparecen en el payload.

    Así se puede insertar una fila en medio de una solicitud masiva
    sin renumerar las demás y sin violar (solicitud_id, numero_linea).
    """
    by_id = {}
    max_n = 0
    for row in existing_rows or []:
        if not isinstance(row, dict):
            continue
        try:
            iid = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        try:
            numero = int(row.get("numero_linea") or 0)
        except (TypeError, ValueError):
            numero = 0
        by_id[iid] = numero
        if numero > max_n:
            max_n = numero

    numeros: List[int] = []
    for it in payload_items or []:
        raw = it.get("id") if isinstance(it, dict) else None
        try:
            iid = int(raw) if raw is not None else None
        except (TypeError, ValueError):
            iid = None
        if iid and iid in by_id and by_id[iid] > 0:
            numeros.append(by_id[iid])
            continue
        max_n += 1
        numeros.append(max_n)
    return numeros


def linea_congelada(row: Optional[dict], en_oc_ids=None) -> bool:
    """Aprobada o ya incluida en una OC: no se reescribe al agregar materiales."""
    if not row:
        return False
    try:
        iid = int(row.get("id") or 0)
    except (TypeError, ValueError):
        iid = 0
    if iid and iid in (en_oc_ids or set()):
        return True
    return str(row.get("estado_validacion") or "").strip().lower() == "aprobado"
