"""Enrich de ubicación (tramo / infraestructura) para filas de presupuesto."""
from __future__ import annotations

from typing import Dict, List, Optional


def enrich_presupuesto_ubicacion_desde_pk_map(
    rows: Optional[List[dict]],
    pk_ubic: Optional[Dict[str, dict]],
) -> List[dict]:
    """
    Completa infraestructura (y tramo vacío) desde el mapa pk_id → ubicación.
    No pisa valores ya presentes en la fila. No muta no_inicio / no_final.
    """
    if not rows:
        return rows or []
    if not pk_ubic:
        return list(rows)
    out: List[dict] = []
    for r in rows:
        row = dict(r) if isinstance(r, dict) else r
        if not isinstance(row, dict):
            out.append(row)
            continue
        pk = str(row.get("pk_id") or "").strip()
        info = pk_ubic.get(pk) or {}
        if not (row.get("infraestructura") or "").strip():
            infra = info.get("infraestructura")
            row["infraestructura"] = str(infra).strip() if infra is not None and str(infra).strip() else ""
        if not (row.get("tramo") or "").strip():
            tr = info.get("tramo")
            if tr is not None and str(tr).strip():
                row["tramo"] = str(tr).strip()
        out.append(row)
    return out
