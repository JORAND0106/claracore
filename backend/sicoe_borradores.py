"""Borradores SicoeObra: permisos de eliminación y reutilización de números."""
from __future__ import annotations

from typing import Iterable, Optional, Set


PISO_NUMERO_REPORTE = 35000


def menor_numero_reporte_libre(
    usados: Iterable[int],
    *,
    desde_uno: bool = False,
    piso: int = PISO_NUMERO_REPORTE,
) -> int:
    """Menor entero libre para un nuevo reporte (huecos de borradores eliminados).

    - ``desde_uno``: la secuencia empieza en 1.
    - En caso contrario: empieza en ``piso`` (legacy 35000).
    Los números de reportes enviados que siguen en ``usados`` nunca se reutilizan.
    """
    used: Set[int] = set()
    for x in usados or []:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if n > 0:
            used.add(n)
    start = 1 if desde_uno else int(piso)
    if start < 1:
        start = 1
    n = start
    while n in used:
        n += 1
    return n


def puede_eliminar_borrador(
    *,
    estado: Optional[str],
    user_id: Optional[int],
    creado_por: Optional[int],
    permiso_eliminar: bool,
) -> bool:
    """Solo estado Borrador. Creador o quien tenga permiso de eliminar reportes."""
    if str(estado or "").strip() != "Borrador":
        return False
    if permiso_eliminar:
        return True
    try:
        uid = int(user_id) if user_id is not None else None
        cid = int(creado_por) if creado_por is not None else None
    except (TypeError, ValueError):
        return False
    if uid is None or cid is None:
        return False
    return uid == cid
