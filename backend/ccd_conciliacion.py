"""Consultas so_registros para formatos CCD de conciliación interventoría–contratista (semana / acta RPO)."""
from __future__ import annotations

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("uvicorn.error")


def _sf(n: Any, default: float = 0.0) -> float:
    try:
        x = float(n)
        return x if math.isfinite(x) else default
    except (TypeError, ValueError):
        return default


def fetch_registros_conciliacion(
    sb,
    contrato_id: int,
    *,
    semana_id: Optional[int] = None,
    acta_rpo_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Registros con nivel3 Aprobado; preferiblemente bloqueados. Sin filtro de subcontratista."""
    if semana_id is None and acta_rpo_id is None:
        return []
    sel = "item_numero, item_descripcion, unidad, cantidad_total, vlr_unitario, capitulo"
    q = (
        sb.table("so_registros")
        .select(sel)
        .eq("contrato_id", contrato_id)
        .eq("nivel3_estado", "Aprobado")
    )
    if semana_id is not None:
        q = q.eq("semana_id", semana_id)
    if acta_rpo_id is not None:
        q = q.eq("acta_rpo_id", acta_rpo_id)
    try:
        rows = q.eq("bloqueado", True).execute().data or []
    except Exception as e:
        _log.warning("conciliación: filtro bloqueado omitido (%s)", e)
        rows = q.execute().data or []
    return rows


def aggregate_items_conciliacion(registros: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], float]:
    items_map: Dict[str, Dict[str, Any]] = {}
    for r in registros or []:
        k = r.get("item_numero") or "SIN_ITEM"
        if k not in items_map:
            items_map[k] = {
                "item_numero": r.get("item_numero", ""),
                "item_descripcion": r.get("item_descripcion", ""),
                "unidad": r.get("unidad", ""),
                "cantidad": 0.0,
                "vlr_unitario": 0.0,
                "costo_directo": 0.0,
                "capitulo": "",
            }
        cap = str(r.get("capitulo") or "").strip()
        if cap and not items_map[k].get("capitulo"):
            items_map[k]["capitulo"] = cap
        items_map[k]["cantidad"] += _sf(r.get("cantidad_total"), 0.0)
        vu = _sf(r.get("vlr_unitario"), 0.0)
        if items_map[k]["vlr_unitario"] == 0.0 and vu != 0.0:
            items_map[k]["vlr_unitario"] = vu
    for _k, it in items_map.items():
        cd = _sf(it.get("cantidad"), 0.0) * _sf(it.get("vlr_unitario"), 0.0)
        if not math.isfinite(cd):
            cd = 0.0
        it["costo_directo"] = cd
    items = list(items_map.values())
    total = sum(_sf(i.get("costo_directo"), 0.0) for i in items)
    if not math.isfinite(total):
        total = 0.0
    return items, total


def fetch_registros_memoria_conciliacion(
    sb,
    contrato_id: int,
    item_numero: str,
    *,
    semana_id: Optional[int] = None,
    acta_rpo_id: Optional[int] = None,
    item_exacto: bool = False,
) -> List[Dict[str, Any]]:
    """Mismo detalle que memoria CC-SUB-002, con filtro semana o acta RPO."""
    if semana_id is None and acta_rpo_id is None:
        return []
    sel = (
        "numero_registro, abs_inicio, abs_final, pk_id_id, pk_ids(pk_id), calzada, longitud, ancho, espesor, "
        "cantidad, cantidad_total, observacion, foto_url, foto_numero, item_numero, item_descripcion, unidad"
    )

    def _base_q():
        qq = (
            sb.table("so_registros")
            .select(sel)
            .eq("contrato_id", contrato_id)
            .eq("nivel3_estado", "Aprobado")
        )
        if semana_id is not None:
            qq = qq.eq("semana_id", semana_id)
        if acta_rpo_id is not None:
            qq = qq.eq("acta_rpo_id", acta_rpo_id)
        if item_exacto:
            qq = qq.eq("item_numero", (item_numero or "").strip())
        else:
            qq = qq.ilike("item_numero", f"%{item_numero}%")
        return qq

    try:
        rows = _base_q().eq("bloqueado", True).order("numero_registro").execute().data or []
    except Exception as e:
        _log.warning("memoria conc: filtro bloqueado omitido (%s)", e)
        rows = _base_q().order("numero_registro").execute().data or []
    return rows
