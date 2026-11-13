"""Orden predeterminado de la grilla Por reporte (SicoeObra).

Primero fecha/hora de creación (más reciente → más antiguo);
si empatan, número de reporte (mayor → menor).
"""
from __future__ import annotations

from typing import Any, List, Mapping, MutableMapping, Sequence, Tuple


def reporte_orden_reciente_key(created_at: Any, numero_reporte: Any) -> Tuple[str, int]:
    """Clave comparable con reverse=True: más reciente y mayor número primero."""
    if created_at is None:
        ts = ""
    elif isinstance(created_at, str):
        ts = created_at
    else:
        ts = str(created_at)
    try:
        n = int(numero_reporte or 0)
    except (TypeError, ValueError):
        n = 0
    return (ts, n)


def ordenar_ids_reporte_reciente(
    id_meta: Mapping[int, Tuple[Any, Any]],
) -> List[int]:
    """Ordena IDs de reporte por created_at DESC, numero_reporte DESC."""
    return sorted(
        id_meta.keys(),
        key=lambda rid: reporte_orden_reciente_key(id_meta[rid][0], id_meta[rid][1]),
        reverse=True,
    )


def ordenar_registros_export_como_grilla(
    rows: Sequence[MutableMapping[str, Any]],
) -> List[MutableMapping[str, Any]]:
    """Ordena filas de export Excel como la grilla: reporte reciente → número → id ASC."""
    if not rows:
        return list(rows)
    indexed = list(rows)
    # Estable: primero por id ASC (dentro del mismo reporte), luego criterio de grilla.
    indexed.sort(key=lambda r: int(r.get("id") or 0))
    indexed.sort(
        key=lambda r: reporte_orden_reciente_key(
            r.get("_reporte_created_at"),
            r.get("reporte_numero") if r.get("reporte_numero") is not None else r.get("numero_reporte"),
        ),
        reverse=True,
    )
    for r in indexed:
        r.pop("_reporte_created_at", None)
    return indexed
