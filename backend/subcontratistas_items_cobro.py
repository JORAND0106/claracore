"""
Ítems de cobro del subcontratista según cantidades asignadas en Presupuesto.

Une `presupuesto.subcontratista_id` (cantidades) con `listado_precios` (VU Cobro)
y `subcontratista_precios` (VU Costo M.O. ya pactado).
"""
from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple


def norm_item_key(s: Optional[str]) -> str:
    """Alinea con `_dash_norm_item_key_py` (quita puntos finales)."""
    if s is None:
        return ""
    t = str(s).strip()
    if not t:
        return ""
    return re.sub(r"\.+$", "", t)


def norm_capitulo_key(s: Optional[str]) -> str:
    """Alinea con `_dash_norm_capitulo_key_py`."""
    if s is None:
        return "Sin capítulo"
    t = str(s).strip()
    if not t:
        return "Sin capítulo"
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def lookup_cant(
    cant_map: Dict[Tuple[str, str, str], float],
    capitulo: str,
    competencia: str,
    item_numero: str,
) -> float:
    """Misma regla que `_listado_precio_cant_lookup` en main.py."""
    cap_k = norm_capitulo_key(capitulo) if capitulo else ""
    comp_f = (competencia or "").strip()
    it_k = norm_item_key(item_numero)
    if not it_k:
        return 0.0
    if comp_f:
        return float(cant_map.get((cap_k, comp_f, it_k), 0) or 0)
    total = 0.0
    for (ck, _cp, ik), val in cant_map.items():
        if ck == cap_k and ik == it_k:
            total += float(val or 0)
    return total


def aggregate_presupuesto_cant_map(
    rows: Iterable[dict],
) -> Dict[Tuple[str, str, str], float]:
    """Agrega cant_total por (capítulo, competencia, ítem) normalizados."""
    out: Dict[Tuple[str, str, str], float] = defaultdict(float)
    for r in rows or []:
        it_k = norm_item_key(r.get("item"))
        if not it_k:
            continue
        cap_k = norm_capitulo_key(r.get("capitulo") or "")
        comp = (r.get("competencia") or "").strip()
        try:
            cant = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        if cant == 0:
            continue
        out[(cap_k, comp, it_k)] += cant
    return dict(out)


def build_items_cobro_asignados(
    listado_items: Iterable[dict],
    cant_map: Dict[Tuple[str, str, str], float],
    precios_by_lp: Optional[Dict[int, dict]] = None,
) -> List[dict]:
    """
    Filas para el modal: solo ítems del listado con cantidad > 0 asignada al sub.

    precios_by_lp: { listado_precio_id: { id, precio_unitario_sub } }
    """
    precios_by_lp = precios_by_lp or {}
    rows: List[dict] = []
    for item in listado_items or []:
        try:
            lp_id = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        cap = item.get("capitulo") or ""
        comp = item.get("competencia") or ""
        it = item.get("item_numero") or ""
        cant = lookup_cant(cant_map, cap, comp, it)
        if cant <= 0:
            continue
        prev = precios_by_lp.get(lp_id) or {}
        vu_ref = item.get("precio_unitario")
        try:
            vu_ref_n = float(vu_ref) if vu_ref is not None and vu_ref != "" else None
        except (TypeError, ValueError):
            vu_ref_n = None
        vu_sub = prev.get("precio_unitario_sub")
        try:
            vu_sub_n = float(vu_sub) if vu_sub is not None and vu_sub != "" else None
        except (TypeError, ValueError):
            vu_sub_n = None
        rows.append({
            "listado_precio_id": lp_id,
            "precio_id": prev.get("id"),
            "capitulo": cap,
            "competencia": comp,
            "item_numero": it,
            "descripcion": item.get("descripcion") or "",
            "unidad": item.get("unidad") or item.get("und") or "",
            "cantidad": round(cant, 4),
            "vu_cobro": vu_ref_n,
            "vu_costo_mo": vu_sub_n,
        })

    def _sort_key(r: dict) -> Tuple:
        return (
            norm_capitulo_key(r.get("capitulo")),
            norm_item_key(r.get("item_numero")),
            str(r.get("competencia") or ""),
        )

    rows.sort(key=_sort_key)
    return rows


def normalize_bulk_precios_payload(items: Any) -> List[dict]:
    """Valida body de bulk: [{ listado_precio_id, precio_unitario_sub }, ...]."""
    if not isinstance(items, list) or not items:
        raise ValueError("Debe enviar al menos un ítem con precio.")
    out: List[dict] = []
    seen = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        try:
            lp_id = int(raw.get("listado_precio_id"))
        except (TypeError, ValueError):
            raise ValueError("listado_precio_id inválido.")
        if lp_id <= 0:
            raise ValueError("listado_precio_id inválido.")
        if lp_id in seen:
            continue
        seen.add(lp_id)
        try:
            precio = float(raw.get("precio_unitario_sub"))
        except (TypeError, ValueError):
            raise ValueError(f"precio_unitario_sub inválido para listado_precio_id={lp_id}.")
        if precio < 0:
            raise ValueError(f"precio_unitario_sub no puede ser negativo (listado_precio_id={lp_id}).")
        out.append({"listado_precio_id": lp_id, "precio_unitario_sub": precio})
    if not out:
        raise ValueError("Debe enviar al menos un ítem con precio.")
    return out
