"""Helpers de catálogo SICOE (listado_precios) sin deps de Supabase."""
from __future__ import annotations

import re
from typing import Iterable, List, Set


def orden_capitulo_key(c: str):
    m = re.match(r"^(\d+)", c or "")
    return (int(m.group(1)) if m else 9999, c or "")


def capitulos_distinct_desde_filas(rows: Iterable[dict]) -> List[str]:
    seen: Set[str] = set()
    for r in rows or []:
        c = r.get("capitulo") if isinstance(r, dict) else None
        if c is None:
            continue
        s = str(c).strip()
        if s:
            seen.add(s)
    return sorted(seen, key=orden_capitulo_key)


def capitulos_payload(caps: Iterable[str]) -> List[dict]:
    return [{"capitulo": c} for c in caps]
