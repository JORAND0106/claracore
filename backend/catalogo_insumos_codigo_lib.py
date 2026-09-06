"""
Helpers puros del consecutivo de código de insumos del catálogo.
Regla: último número existente (activos) + 1; sin rellenar huecos; vacío → 001.
"""
from __future__ import annotations

import re
from typing import Any, List


def codigo_insumo_patron(segment: str) -> re.Pattern:
    return re.compile(rf"^CC-{re.escape(str(segment or '').strip())}-(\d{{3,}})$", re.IGNORECASE)


def compute_next_codigo_insumo(codigos: List[Any], segment: str) -> str:
    """
    Siguiente código = último consecutivo existente + 1 (sin rellenar huecos).
    Si no hay códigos válidos, retorna CC-{segment}-001.
    """
    seg = str(segment or "").strip()
    prefix = f"CC-{seg}-"
    pat = codigo_insumo_patron(seg)
    max_n = 0
    for raw in codigos or []:
        m = pat.match(str(raw or "").strip().upper())
        if m:
            max_n = max(max_n, int(m.group(1)))
    return f"{prefix}{max_n + 1:03d}"


def codigo_liberado_para_baja(row: dict) -> str:
    """Libera el código al soft-delete para no bloquear UNIQUE ni reinicio a 001."""
    codigo = (row.get("codigo") or "").strip()
    iid = int(row.get("id") or 0)
    if not codigo:
        return codigo
    if re.search(r"~D\d+$", codigo, flags=re.IGNORECASE):
        return codigo
    return f"{codigo}~D{iid}"
