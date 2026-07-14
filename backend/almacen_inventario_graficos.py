"""Gráficos agregados del tab Inventario — caché en memoria."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple

_CACHE: Dict[Tuple[int, str, str], Tuple[float, dict]] = {}
_CACHE_TTL_SEC = 90


def _norm_filter(value: Optional[str]) -> str:
    return (value or "").strip()


def _cache_key(contrato_id: int, capitulo: Optional[str], item: Optional[str]) -> Tuple[int, str, str]:
    return (int(contrato_id), _norm_filter(capitulo), _norm_filter(item))


def _cache_get(contrato_id: int, capitulo: Optional[str], item: Optional[str]) -> Optional[dict]:
    key = _cache_key(contrato_id, capitulo, item)
    row = _CACHE.get(key)
    if not row:
        return None
    expires, data = row
    if time.time() > expires:
        _CACHE.pop(key, None)
        return None
    return data


def _cache_set(contrato_id: int, capitulo: Optional[str], item: Optional[str], data: dict) -> None:
    key = _cache_key(contrato_id, capitulo, item)
    _CACHE[key] = (time.time() + _CACHE_TTL_SEC, data)
    if len(_CACHE) > 400:
        now = time.time()
        dead = [k for k, (exp, _) in _CACHE.items() if exp < now]
        for k in dead:
            _CACHE.pop(k, None)


def invalidar_cache_inventario_graficos(contrato_id: Optional[int] = None) -> None:
    if contrato_id is None:
        _CACHE.clear()
        return
    cid = int(contrato_id)
    dead = [k for k in _CACHE if k[0] == cid]
    for k in dead:
        _CACHE.pop(k, None)


def get_inventario_graficos(
    contrato_id: int,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
) -> dict:
    """Datos agregados para los 3 gráficos del tab Inventario."""
    cap = _norm_filter(capitulo) or None
    it = _norm_filter(item) or None
    cached = _cache_get(contrato_id, cap, it)
    if cached is not None:
        return cached

    from almacen_service import _sb

    sb = _sb()
    res = sb.rpc(
        "almacen_inventario_graficos_agg",
        {
            "p_contrato_id": int(contrato_id),
            "p_capitulo": cap,
            "p_item": it,
        },
    ).execute()
    raw = res.data
    if isinstance(raw, list) and raw:
        payload = raw[0] if isinstance(raw[0], dict) else {"totales": {}, "por_item": [], "por_item_valor": []}
    elif isinstance(raw, dict):
        payload = raw
    else:
        payload = {"totales": {}, "por_item": [], "por_item_valor": []}

    tot = payload.get("totales") or {}
    filtro = payload.get("filtro") or {}
    out: Dict[str, Any] = {
        "filtro": {
            "capitulo": filtro.get("capitulo"),
            "item": filtro.get("item"),
        },
        "totales": {
            "valor_cobro": float(tot.get("valor_cobro") or 0),
            "costo_insumos": float(tot.get("costo_insumos") or 0),
            "entradas": float(tot.get("entradas") or 0),
            "salidas": float(tot.get("salidas") or 0),
            "cobrado": float(tot.get("cobrado") or 0),
        },
        "por_item": payload.get("por_item") or [],
        "por_item_valor": payload.get("por_item_valor") or [],
        "generado_at": payload.get("generado_at"),
        "comparaciones": [
            {
                "id": "valor_cobro_insumos",
                "titulo": "Valor del ítem vs. Costo de insumos",
                "serie_a": {"key": "valor_cobro", "label": "Valor según contrato"},
                "serie_b": {"key": "costo_insumos", "label": "Costo total insumos"},
                "moneda": True,
            },
            {
                "id": "entradas_salidas",
                "titulo": "Entradas vs. Salidas",
                "serie_a": {"key": "entradas", "label": "Entradas"},
                "serie_b": {"key": "salidas", "label": "Salidas a obra"},
            },
            {
                "id": "salidas_cobro",
                "titulo": "Salidas vs. Cobro (SICOE Obra)",
                "serie_a": {"key": "salidas", "label": "Salidas almacén"},
                "serie_b": {"key": "cobrado", "label": "Reportado y cobrado"},
            },
        ],
    }
    _cache_set(contrato_id, cap, it, out)
    return out
