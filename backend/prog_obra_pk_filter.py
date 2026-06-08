"""Filtro opcional por PK(s) en exportaciones y curva S."""
from __future__ import annotations

from typing import Dict, Optional, Set


def parse_pk_ids_param(pk_ids: Optional[str]) -> Optional[Set[str]]:
    if not pk_ids or not str(pk_ids).strip():
        return None
    out = {p.strip() for p in str(pk_ids).split(",") if p.strip()}
    return out or None


def parse_tramos_param(tramos: Optional[str]) -> Optional[list]:
    """Nombres de tramo separados por coma (alcance Curva S / presupuesto)."""
    if not tramos or not str(tramos).strip():
        return None
    out = [t.strip() for t in str(tramos).split(",") if t.strip()]
    return out or None


def filter_nodes_by_pk(nodes: Dict[str, dict], pk_ids: Optional[Set[str]]) -> Dict[str, dict]:
    if not pk_ids:
        return nodes
    return {
        k: n
        for k, n in nodes.items()
        if str(n.get("pk_id") or "").strip() in pk_ids
    }
