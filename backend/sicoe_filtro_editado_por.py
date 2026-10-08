"""
Filtro SicoeObra «Editado por»: usuarios que modificaron reportes y/o registros.

- Listado por reporte: reporte.modificado_por ∈ ids  ∪  existe línea con
  modificado_por_reg ∈ ids.
- Dentro del reporte / cantidades / auditoría: solo líneas con
  modificado_por_reg ∈ ids.
"""
from __future__ import annotations

import json
from typing import Any, Iterable, List, Optional, Sequence, Set


def normalize_editado_por_ids(
    filtro_json: Optional[str] = None,
    legacy_id: Optional[Any] = None,
) -> List[int]:
    """Parsea `editado_por_filtro` (JSON de ids) o un id suelto. Sin duplicados."""
    out: List[int] = []
    if filtro_json is not None and str(filtro_json).strip():
        try:
            j = json.loads(filtro_json)
            if isinstance(j, list):
                for x in j:
                    try:
                        out.append(int(x))
                    except (TypeError, ValueError):
                        continue
            else:
                try:
                    out.append(int(j))
                except (TypeError, ValueError):
                    pass
        except Exception:
            pass
    if not out and legacy_id is not None and str(legacy_id).strip():
        try:
            out.append(int(legacy_id))
        except (TypeError, ValueError):
            pass
    seen: Set[int] = set()
    deduped: List[int] = []
    for i in out:
        if i not in seen and i > 0:
            seen.add(i)
            deduped.append(i)
    return deduped


def union_reporte_ids(
    ids_desde_reporte: Iterable[Any],
    ids_desde_registro: Iterable[Any],
) -> List[int]:
    """Une ids de reporte (cabecera editada ∪ líneas editadas)."""
    out: Set[int] = set()
    for src in (ids_desde_reporte, ids_desde_registro):
        for x in src or []:
            try:
                out.add(int(x))
            except (TypeError, ValueError):
                continue
    return sorted(out)


def registro_coincide_editado_por(reg: Optional[dict], uids: Sequence[int]) -> bool:
    if not reg or not uids:
        return False
    try:
        mid = reg.get("modificado_por_reg")
        if mid is None:
            return False
        return int(mid) in {int(x) for x in uids}
    except (TypeError, ValueError):
        return False
