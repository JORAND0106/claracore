"""Inventario en árbol: capítulo → ítem (listado) → orden de compra (tab Inventario)."""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from typing import Dict, Iterable, List, Optional, Tuple

_log = logging.getLogger(__name__)
_CACHE: Dict[int, Tuple[float, dict]] = {}
_CACHE_TTL_SEC = 90
_IN_CHUNK = 200


def _norm_item_key_local(item: Optional[str]) -> str:
    t = str(item or "").strip()
    return re.sub(r"\.+$", "", t)


def _norm_capitulo_key_local(s: Optional[str]) -> str:
    if s is None:
        return "Sin capítulo"
    t = str(s).strip()
    if not t:
        return "Sin capítulo"
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def _natural_sort_key_local(text: Optional[str]) -> tuple:
    s = str(text or "").strip()
    parts = re.split(r"(\d+)", s)
    key: list = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part.lower()))
    return tuple(key) if key else ((1, ""),)


def invalidar_cache_inventario_arbol(contrato_id: Optional[int] = None) -> None:
    if contrato_id is None:
        _CACHE.clear()
        return
    _CACHE.pop(int(contrato_id), None)


def _cache_get(contrato_id: int) -> Optional[dict]:
    row = _CACHE.get(int(contrato_id))
    if not row:
        return None
    expires, data = row
    if time.time() > expires:
        _CACHE.pop(int(contrato_id), None)
        return None
    return data


def _cache_set(contrato_id: int, data: dict) -> None:
    _CACHE[int(contrato_id)] = (time.time() + _CACHE_TTL_SEC, data)
    if len(_CACHE) > 200:
        now = time.time()
        dead = [k for k, (exp, _) in _CACHE.items() if exp < now]
        for k in dead:
            _CACHE.pop(k, None)


def _chunks(ids: List[int], size: int = _IN_CHUNK) -> Iterable[List[int]]:
    for i in range(0, len(ids), size):
        yield ids[i : i + size]


def _f(v) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _round4(v: float) -> float:
    return round(float(v), 4)


def _round2(v: float) -> float:
    return round(float(v), 2)


def _unit_cost(qty: float, valor: Optional[float], vu_fallback: Optional[float] = None) -> float:
    q = _f(qty)
    if q > 0 and valor is not None and _f(valor) > 0:
        return _f(valor) / q
    return _f(vu_fallback)


def _empty_resumen() -> dict:
    return {
        "valor_stock": 0.0,
        "valor_entradas": 0.0,
        "valor_salidas": 0.0,
        "entradas": 0.0,
        "salidas": 0.0,
        "saldo": 0.0,
    }


def make_item_key(capitulo: Optional[str], item: Optional[str]) -> str:
    """Clave estable capítulo|ítem (misma lógica de normalización del listado)."""
    return f"{_norm_capitulo_key_local(capitulo)}|{_norm_item_key_local(item)}"


def make_capitulo_key(capitulo: Optional[str]) -> str:
    return _norm_capitulo_key_local(capitulo)


def _fmt_numero_oc(n) -> Optional[str]:
    if n is None or n == "":
        return None
    try:
        return f"#{int(n):05d}"
    except (TypeError, ValueError):
        s = str(n).strip()
        return s if s.startswith("#") else f"#{s}"


def _vu_costo_desde_composicion(comp_list: List[dict]) -> Tuple[Optional[float], Optional[float]]:
    """VU costo del ítem = suma (vu_costo × rendimiento) de insumos asociados."""
    sum_costo = 0.0
    tiene = False
    rend_item = None
    principal = next((c for c in comp_list if c.get("es_principal") is not False), None)
    if principal and principal.get("rendimiento") is not None:
        rend_item = _f(principal.get("rendimiento")) or None
    for c in comp_list:
        vu = c.get("vu_costo")
        vu_f = _f(vu) if vu is not None and _f(vu) > 0 else None
        if vu_f is None:
            continue
        rend = c.get("rendimiento")
        factor = _f(rend) if rend is not None and _f(rend) > 0 else 1.0
        sum_costo += vu_f * factor
        tiene = True
    return (_round2(sum_costo) if tiene else None, rend_item)


def _rentabilidad_pct(vu_cobro: Optional[float], vu_costo: Optional[float]) -> Optional[float]:
    """% rentabilidad = (VU Cobro − VU Costo) / VU Cobro × 100."""
    if vu_cobro is None or vu_costo is None:
        return None
    cobro = _f(vu_cobro)
    if cobro <= 0:
        return None
    return _round2(((_f(vu_cobro) - _f(vu_costo)) / cobro) * 100)


def _insumos_desde_composicion(comp_list: List[dict]) -> List[dict]:
    """Listado real de insumos (principal + asociados) con VU costo individual."""
    out: List[dict] = []
    for c in comp_list:
        iid = c.get("insumo_id")
        if iid is None:
            continue
        vu = c.get("vu_costo")
        vu_f = _f(vu) if vu is not None and _f(vu) > 0 else None
        rend = c.get("rendimiento")
        rend_f = _f(rend) if rend is not None else None
        factor = rend_f if rend_f is not None and rend_f > 0 else 1.0
        contrib = _round2(vu_f * factor) if vu_f is not None else None
        es_principal = c.get("es_principal") is not False
        desc = (c.get("descripcion") or "").strip() or f"Insumo #{int(iid)}"
        codigo = (c.get("codigo") or "").strip() or None
        out.append({
            "insumo_id": int(iid),
            "codigo": codigo,
            "descripcion": desc,
            "unidad": c.get("unidad"),
            "es_principal": es_principal,
            "rendimiento": rend_f,
            "vu_costo": vu_f,
            "costo_contribucion": contrib,
            "valor_entradas": 0.0,
            "valor_salidas": 0.0,
            "valor_stock": 0.0,
            "stock": 0.0,
            "entradas": 0.0,
            "salidas": 0.0,
            "saldo": 0.0,
            "valor_negociado_total": (
                _round2(_f(c.get("valor_negociado_total")))
                if c.get("valor_negociado_total") is not None
                else None
            ),
            "saldo_por_consumir": None,
            "ordenes_compra": [],
        })
    out.sort(key=lambda r: (
        0 if r.get("es_principal") else 1,
        str(r.get("descripcion") or "").lower(),
        int(r.get("insumo_id") or 0),
    ))
    return out


def _agregar_movimientos_por_insumo(
    movement_lines: List[dict],
) -> Dict[Tuple[str, int], dict]:
    """
    Agrupa movimientos por (item_key, insumo_id) y anida OCs con flags de trazabilidad.
    """
    by_ins: Dict[Tuple[str, int], dict] = {}
    for ln in movement_lines:
        ikey = str(ln.get("item_key") or "")
        if not ikey or ln.get("insumo_id") is None:
            continue
        iid = int(ln["insumo_id"])
        key = (ikey, iid)
        bucket = by_ins.get(key)
        if not bucket:
            bucket = {
                "item_key": ikey,
                "insumo_id": iid,
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
                "material_descripcion": (ln.get("material_descripcion") or "").strip() or None,
                "unidad": (ln.get("unidad") or "").strip() or None,
                "_ocs": {},
            }
            by_ins[key] = bucket

        ent = _f(ln.get("entradas"))
        sal = _f(ln.get("salidas"))
        saldo = _f(ln.get("saldo"))
        v_ent = _f(ln.get("valor_entradas"))
        v_sal = _f(ln.get("valor_salidas"))
        v_stk = _f(ln.get("valor_stock"))

        bucket["entradas"] = _round4(bucket["entradas"] + ent)
        bucket["salidas"] = _round4(bucket["salidas"] + sal)
        bucket["saldo"] = _round4(bucket["saldo"] + saldo)
        bucket["valor_entradas"] = _round2(bucket["valor_entradas"] + v_ent)
        bucket["valor_salidas"] = _round2(bucket["valor_salidas"] + v_sal)
        bucket["valor_stock"] = _round2(bucket["valor_stock"] + v_stk)

        mat = (ln.get("material_descripcion") or "").strip()
        if mat and not bucket.get("material_descripcion"):
            bucket["material_descripcion"] = mat

        oc_id = int(ln["orden_compra_id"]) if ln.get("orden_compra_id") is not None else None
        num_raw = ln.get("numero_oc")
        oc_key = (oc_id, str(num_raw) if num_raw is not None else "")
        oc = bucket["_ocs"].get(oc_key)
        if not oc:
            oc = {
                "orden_compra_id": oc_id,
                "numero_oc": num_raw,
                "numero_oc_fmt": _fmt_numero_oc(num_raw) or "Sin OC",
                "estado": (ln.get("estado") or "").strip() or None,
                "proveedor_nombre": (ln.get("proveedor_nombre") or "Sin proveedor").strip() or "Sin proveedor",
                "material_descripcion": mat or None,
                "unidad": (ln.get("unidad") or "").strip() or None,
                "valor_unitario": None,
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
                "tiene_entrada": False,
                "tiene_salida": False,
            }
            bucket["_ocs"][oc_key] = oc
        else:
            if mat and not oc.get("material_descripcion"):
                oc["material_descripcion"] = mat
            pname = (ln.get("proveedor_nombre") or "").strip()
            if pname and (not oc.get("proveedor_nombre") or oc["proveedor_nombre"] == "Sin proveedor"):
                oc["proveedor_nombre"] = pname
            if ln.get("estado") and not oc.get("estado"):
                oc["estado"] = (ln.get("estado") or "").strip() or None

        oc["entradas"] = _round4(oc["entradas"] + ent)
        oc["salidas"] = _round4(oc["salidas"] + sal)
        oc["saldo"] = _round4(oc["saldo"] + saldo)
        oc["valor_entradas"] = _round2(oc["valor_entradas"] + v_ent)
        oc["valor_salidas"] = _round2(oc["valor_salidas"] + v_sal)
        oc["valor_stock"] = _round2(oc["valor_stock"] + v_stk)
        if ent > 1e-12 or v_ent > 1e-12:
            oc["tiene_entrada"] = True
        if sal > 1e-12 or v_sal > 1e-12:
            oc["tiene_salida"] = True
        vu = ln.get("valor_unitario")
        if vu is not None and _f(vu) > 0 and oc.get("valor_unitario") is None:
            oc["valor_unitario"] = _round2(_f(vu))

    for bucket in by_ins.values():
        ocs = list(bucket.pop("_ocs").values())
        ocs.sort(key=lambda x: (
            int(x["numero_oc"]) if x.get("numero_oc") is not None else 10**9,
            str(x.get("proveedor_nombre") or "").lower(),
            int(x.get("orden_compra_id") or 0),
        ))
        bucket["ordenes_compra"] = ocs
        bucket["stock"] = bucket["valor_stock"]

    return by_ins


def build_inventario_arbol_from_lines(
    *,
    item_rows: List[dict],
    composition: Dict[str, List[dict]],
    movement_lines: List[dict],
) -> dict:
    """
    Agrega el árbol Capítulo → Ítem → Insumo → OC (testeable sin Supabase).

    item_rows = [
      {item_key, capitulo, item, descripcion, unidad, vu_cobro, presupuesto_ids?}, ...
    ]
    composition[item_key] = [ {insumo_id, codigo, descripcion, vu_costo, rendimiento, es_principal, ...}, ... ]
    movement_lines = [
      {
        item_key, orden_compra_id, numero_oc, proveedor_nombre, estado,
        material_descripcion, unidad, valor_unitario,
        entradas, salidas, saldo,
        valor_entradas, valor_salidas, valor_stock,
      }, ...
    ]

    Entradas/salidas/stock del ítem y capítulo se exponen en valor financiero
    (valor_entradas / valor_salidas / valor_stock). El nivel 3 lista cada insumo
    real del ítem (principal y asociados) con VU costo y valores de entrada/salida.
    Al expandir un insumo se listan sus OCs con trazabilidad OC → Entrada → Salida
    (flags tiene_entrada / tiene_salida).
    """
    # Totales financieros / cantidad por ítem (desde movimientos; sin colapsar materiales)
    mov_by_item: Dict[str, dict] = {}
    for ln in movement_lines:
        ikey = str(ln.get("item_key") or "")
        if not ikey:
            continue
        acc = mov_by_item.get(ikey)
        if not acc:
            acc = {
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
            }
            mov_by_item[ikey] = acc
        acc["entradas"] = _round4(acc["entradas"] + _f(ln.get("entradas")))
        acc["salidas"] = _round4(acc["salidas"] + _f(ln.get("salidas")))
        acc["saldo"] = _round4(acc["saldo"] + _f(ln.get("saldo")))
        acc["valor_entradas"] = _round2(acc["valor_entradas"] + _f(ln.get("valor_entradas")))
        acc["valor_salidas"] = _round2(acc["valor_salidas"] + _f(ln.get("valor_salidas")))
        acc["valor_stock"] = _round2(acc["valor_stock"] + _f(ln.get("valor_stock")))

    mov_by_insumo = _agregar_movimientos_por_insumo(movement_lines)

    items_out: List[dict] = []
    resumen = _empty_resumen()

    for p in item_rows:
        ikey = str(p.get("item_key") or "")
        if not ikey:
            continue
        vu_cobro = p.get("vu_cobro")
        if vu_cobro is not None:
            vu_cobro = _f(vu_cobro) if _f(vu_cobro) > 0 else None

        comp_list = list(composition.get(ikey) or [])
        insumos = _insumos_desde_composicion(comp_list)
        vu_costo, rend_item = _vu_costo_desde_composicion(comp_list)
        utilidad = (
            _round2(_f(vu_cobro) - vu_costo)
            if vu_cobro is not None and vu_costo is not None
            else None
        )
        rentabilidad = _rentabilidad_pct(vu_cobro, vu_costo)

        # Fusionar valores / OCs de movimientos en cada insumo; agregar huérfanos
        seen_ins = {int(i["insumo_id"]) for i in insumos}
        for ins in insumos:
            bucket = mov_by_insumo.get((ikey, int(ins["insumo_id"])))
            if not bucket:
                continue
            ins["entradas"] = bucket["entradas"]
            ins["salidas"] = bucket["salidas"]
            ins["saldo"] = bucket["saldo"]
            ins["valor_entradas"] = bucket["valor_entradas"]
            ins["valor_salidas"] = bucket["valor_salidas"]
            ins["valor_stock"] = bucket["valor_stock"]
            ins["stock"] = bucket["valor_stock"]
            ins["ordenes_compra"] = bucket.get("ordenes_compra") or []

        for (ik, iid), bucket in mov_by_insumo.items():
            if ik != ikey or iid in seen_ins:
                continue
            seen_ins.add(iid)
            desc = bucket.get("material_descripcion") or f"Insumo #{iid}"
            insumos.append({
                "insumo_id": iid,
                "codigo": None,
                "descripcion": desc,
                "unidad": bucket.get("unidad"),
                "es_principal": False,
                "rendimiento": None,
                "vu_costo": None,
                "costo_contribucion": None,
                "entradas": bucket["entradas"],
                "salidas": bucket["salidas"],
                "saldo": bucket["saldo"],
                "valor_entradas": bucket["valor_entradas"],
                "valor_salidas": bucket["valor_salidas"],
                "valor_stock": bucket["valor_stock"],
                "stock": bucket["valor_stock"],
                "valor_negociado_total": None,
                "saldo_por_consumir": None,
                "ordenes_compra": bucket.get("ordenes_compra") or [],
            })

        # Saldo por consumir = valor negociado acumulado − valor entradas (por fila)
        from almacen_insumo_liquidacion import calcular_saldo_por_consumir
        saldo_insumos = 0.0
        tiene_saldo = False
        for ins in insumos:
            spc = calcular_saldo_por_consumir(
                ins.get("valor_negociado_total"),
                ins.get("valor_entradas") or 0.0,
            )
            ins["saldo_por_consumir"] = spc
            if spc is not None:
                saldo_insumos = _round2(saldo_insumos + spc)
                tiene_saldo = True

        insumos.sort(key=lambda r: (
            0 if r.get("es_principal") else 1,
            str(r.get("descripcion") or "").lower(),
            int(r.get("insumo_id") or 0),
        ))

        mov = mov_by_item.get(ikey, {
            "entradas": 0.0,
            "salidas": 0.0,
            "saldo": 0.0,
            "valor_entradas": 0.0,
            "valor_salidas": 0.0,
            "valor_stock": 0.0,
        })
        ent = mov["entradas"]
        sal = mov["salidas"]
        saldo = mov["saldo"]
        v_ent = mov["valor_entradas"]
        v_sal = mov["valor_salidas"]
        v_stk = mov["valor_stock"]

        resumen["valor_entradas"] = _round2(resumen["valor_entradas"] + v_ent)
        resumen["valor_salidas"] = _round2(resumen["valor_salidas"] + v_sal)
        resumen["valor_stock"] = _round2(resumen["valor_stock"] + v_stk)
        resumen["entradas"] = _round4(resumen["entradas"] + ent)
        resumen["salidas"] = _round4(resumen["salidas"] + sal)
        resumen["saldo"] = _round4(resumen["saldo"] + saldo)

        pids = p.get("presupuesto_ids") or []
        items_out.append({
            "item_key": ikey,
            "capitulo_key": make_capitulo_key(p.get("capitulo")),
            "presupuesto_id": int(pids[0]) if pids else None,
            "presupuesto_ids": [int(x) for x in pids],
            "capitulo": p.get("capitulo"),
            "item": p.get("item"),
            "descripcion": p.get("descripcion"),
            "unidad": p.get("unidad") or p.get("und"),
            "cant_presupuestada": _f(p.get("cant_presupuestada") or p.get("cant_total")),
            "pk_id": p.get("pk_id"),
            "vu_cobro": vu_cobro,
            "vu_costo": vu_costo,
            "rendimiento": rend_item,
            "utilidad": utilidad,
            "rentabilidad_pct": rentabilidad,
            "entradas": ent,
            "salidas": sal,
            "saldo": saldo,
            "stock": v_stk,
            "valor_entradas": v_ent,
            "valor_salidas": v_sal,
            "valor_stock": v_stk,
            "saldo_por_consumir": saldo_insumos if tiene_saldo else None,
            "insumos": insumos,
            "ordenes_compra": [],
        })

    def _item_sort_key(it: dict):
        return (
            _natural_sort_key_local(it.get("capitulo")),
            _natural_sort_key_local(it.get("item")),
            str(it.get("descripcion") or ""),
            str(it.get("item_key") or ""),
        )

    items_out.sort(key=_item_sort_key)

    # Agrupar por capítulo (nivel 1)
    by_cap: Dict[str, dict] = {}
    for it in items_out:
        ckey = str(it.get("capitulo_key") or make_capitulo_key(it.get("capitulo")))
        bucket = by_cap.get(ckey)
        if not bucket:
            bucket = {
                "capitulo_key": ckey,
                "capitulo": it.get("capitulo") or "Sin capítulo",
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
                "stock": 0.0,
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "saldo_por_consumir": 0.0,
                "_tiene_saldo_consumir": False,
                "items": [],
            }
            by_cap[ckey] = bucket
        bucket["items"].append(it)
        bucket["valor_entradas"] = _round2(bucket["valor_entradas"] + _f(it.get("valor_entradas")))
        bucket["valor_salidas"] = _round2(bucket["valor_salidas"] + _f(it.get("valor_salidas")))
        bucket["valor_stock"] = _round2(bucket["valor_stock"] + _f(it.get("valor_stock")))
        bucket["stock"] = bucket["valor_stock"]
        bucket["entradas"] = _round4(bucket["entradas"] + _f(it.get("entradas")))
        bucket["salidas"] = _round4(bucket["salidas"] + _f(it.get("salidas")))
        bucket["saldo"] = _round4(bucket["saldo"] + _f(it.get("saldo")))
        if it.get("saldo_por_consumir") is not None:
            bucket["saldo_por_consumir"] = _round2(
                bucket["saldo_por_consumir"] + _f(it.get("saldo_por_consumir"))
            )
            bucket["_tiene_saldo_consumir"] = True

    capitulos = sorted(
        by_cap.values(),
        key=lambda c: _natural_sort_key_local(c.get("capitulo")),
    )
    for cap in capitulos:
        if not cap.pop("_tiene_saldo_consumir", False):
            cap["saldo_por_consumir"] = None

    return {
        "capitulos": capitulos,
        "items": items_out,
        "resumen": resumen,
    }


def _fetch_oc_rows(sb, oc_ids: List[int]) -> Dict[int, dict]:
    """Carga OCs tolerando esquemas sin proveedor_id / proveedor_nombre / estado."""
    from almacen_service import _pgrst_unknown_column

    oc_map: Dict[int, dict] = {}
    if not oc_ids:
        return oc_map

    select_variants = [
        "id, numero_oc, estado, proveedor_id, proveedor_nombre",
        "id, numero_oc, proveedor_id, proveedor_nombre",
        "id, numero_oc, estado, proveedor_nombre",
        "id, numero_oc, proveedor_nombre",
        "id, numero_oc",
        "id",
    ]
    last_exc: Optional[BaseException] = None
    for select in select_variants:
        try:
            oc_map = {}
            for chunk in _chunks(oc_ids):
                for o in (
                    sb.table("almacen_orden_compra")
                    .select(select)
                    .in_("id", chunk)
                    .execute()
                    .data
                    or []
                ):
                    oc_map[int(o["id"])] = o
            return oc_map
        except Exception as exc:  # noqa: BLE001 — PostgREST schema drift
            last_exc = exc
            col = _pgrst_unknown_column(exc)
            msg = str(exc or "")
            if col in ("proveedor_id", "proveedor_nombre", "estado", "numero_oc") or any(
                x in msg for x in ("proveedor_id", "proveedor_nombre", "estado", "numero_oc")
            ):
                continue
            raise
    if last_exc:
        raise last_exc
    return oc_map


def _fetch_proveedor_map(sb, prov_ids: List[int]) -> Dict[int, str]:
    """Mapa id → razón social. Columna real: razon_social (no 'nombre')."""
    from almacen_service import _pgrst_unknown_column

    out: Dict[int, str] = {}
    if not prov_ids:
        return out
    select_variants = [
        "id, razon_social",
        "id",
    ]
    last_exc: Optional[BaseException] = None
    for select in select_variants:
        try:
            out = {}
            for chunk in _chunks(sorted(set(int(x) for x in prov_ids if x))):
                for p in (
                    sb.table("almacen_proveedor")
                    .select(select)
                    .in_("id", chunk)
                    .execute()
                    .data
                    or []
                ):
                    pid = int(p["id"])
                    nombre = (p.get("razon_social") or p.get("nombre") or "").strip()
                    out[pid] = nombre or f"Proveedor #{pid}"
            return out
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            col = _pgrst_unknown_column(exc)
            msg = str(exc or "")
            if col in ("razon_social", "nombre") or "razon_social" in msg or "nombre" in msg:
                continue
            raise
    if last_exc:
        _log.warning("No se pudo cargar almacen_proveedor: %s", last_exc)
    return out


def list_inventario_arbol(contrato_id: int) -> dict:
    """Árbol completo del inventario del contrato (con caché corta)."""
    cached = _cache_get(contrato_id)
    if cached is not None:
        return cached

    from almacen_insumos_service import (
        _fetch_all_listado_rows,
    )
    from almacen_service import (
        _sb,
        list_presupuesto_items,
    )

    sb = _sb()

    # ── 1. Ítems del listado de precios (fuente principal) ──────────────────
    listado_rows = _fetch_all_listado_rows(
        contrato_id,
        "capitulo, item_numero, descripcion, unidad, precio_unitario",
    )
    item_by_key: Dict[str, dict] = {}
    for row in listado_rows:
        raw_cap = (row.get("capitulo") or "").strip()
        raw_item = (row.get("item_numero") or "").strip()
        if not raw_cap or not raw_item:
            continue
        ikey = make_item_key(raw_cap, raw_item)
        if ikey in item_by_key:
            prev = item_by_key[ikey]
            price = _f(row.get("precio_unitario"))
            if (prev.get("vu_cobro") is None or prev.get("vu_cobro") <= 0) and price > 0:
                prev["vu_cobro"] = price
            if not (prev.get("descripcion") or "").strip() and (row.get("descripcion") or "").strip():
                prev["descripcion"] = (row.get("descripcion") or "").strip()
            continue
        price = _f(row.get("precio_unitario"))
        item_by_key[ikey] = {
            "item_key": ikey,
            "capitulo": raw_cap,
            "item": raw_item,
            "descripcion": (row.get("descripcion") or "").strip() or None,
            "unidad": (row.get("unidad") or "").strip() or "UND",
            "vu_cobro": price if price > 0 else None,
            "presupuesto_ids": [],
            "cant_presupuestada": 0.0,
            "pk_id": None,
        }

    ppto_rows = list_presupuesto_items(contrato_id)
    ppto_to_key: Dict[int, str] = {}
    for p in ppto_rows:
        pid = int(p["id"])
        ikey = make_item_key(p.get("capitulo"), p.get("item"))
        ppto_to_key[pid] = ikey
        if ikey not in item_by_key:
            item_by_key[ikey] = {
                "item_key": ikey,
                "capitulo": (p.get("capitulo") or "").strip() or None,
                "item": (p.get("item") or "").strip() or None,
                "descripcion": (p.get("descripcion") or "").strip() or None,
                "unidad": p.get("und") or "UND",
                "vu_cobro": None,
                "presupuesto_ids": [],
                "cant_presupuestada": 0.0,
                "pk_id": p.get("pk_id"),
            }
        bucket = item_by_key[ikey]
        bucket["presupuesto_ids"].append(pid)
        bucket["cant_presupuestada"] = _round4(
            _f(bucket.get("cant_presupuestada")) + _f(p.get("cant_total")),
        )
        if not bucket.get("pk_id") and p.get("pk_id"):
            bucket["pk_id"] = p.get("pk_id")
        if not (bucket.get("descripcion") or "").strip() and (p.get("descripcion") or "").strip():
            bucket["descripcion"] = (p.get("descripcion") or "").strip()

    item_rows = list(item_by_key.values())
    if not item_rows:
        out = {
            "capitulos": [],
            "items": [],
            "resumen": _empty_resumen(),
            "generado_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _cache_set(contrato_id, out)
        return out

    movement_lines: List[dict] = []
    composition: Dict[str, List[dict]] = defaultdict(list)
    try:
        movement_lines, composition = _enrich_inventario_movimientos(
            sb=sb,
            contrato_id=int(contrato_id),
            item_by_key=item_by_key,
            ppto_to_key=ppto_to_key,
        )
    except Exception:
        _log.exception(
            "Inventario árbol: falló enriquecimiento de movimientos (contrato=%s). "
            "Se devuelve el listado de precios sin entradas/salidas.",
            contrato_id,
        )
        movement_lines = []
        composition = defaultdict(list)

    item_rows = list(item_by_key.values())
    built = build_inventario_arbol_from_lines(
        item_rows=item_rows,
        composition=dict(composition),
        movement_lines=movement_lines,
    )
    built["generado_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _cache_set(contrato_id, built)
    return built


def _enrich_inventario_movimientos(
    *,
    sb,
    contrato_id: int,
    item_by_key: Dict[str, dict],
    ppto_to_key: Dict[int, str],
) -> Tuple[List[dict], Dict[str, List[dict]]]:
    """Carga entradas/salidas/composición. Puede lanzar; el caller hace soft-fail."""
    from almacen_service import _despacho_neto_por_entrada_item

    ent_rows: List[dict] = []
    for select in ("id, proveedor_id, insumo_id", "id, insumo_id", "id"):
        try:
            ent_rows = (
                sb.table("almacen_entrada")
                .select(select)
                .eq("contrato_id", int(contrato_id))
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:  # noqa: BLE001
            from almacen_service import _pgrst_unknown_column
            col = _pgrst_unknown_column(exc)
            msg = str(exc or "")
            if col in ("proveedor_id", "insumo_id") or "proveedor_id" in msg or "insumo_id" in msg:
                continue
            raise

    entrada_ids = [int(e["id"]) for e in ent_rows]
    ent_map = {int(e["id"]): e for e in ent_rows}

    ei_rows: List[dict] = []
    for chunk in _chunks(entrada_ids) if entrada_ids else []:
        ei_rows.extend(
            sb.table("almacen_entrada_item")
            .select(
                "id, entrada_id, presupuesto_id, orden_compra_item_id, "
                "cantidad_recibida, valor_recibido"
            )
            .in_("entrada_id", chunk)
            .execute()
            .data
            or []
        )

    oci_ids = sorted({
        int(ei["orden_compra_item_id"])
        for ei in ei_rows
        if ei.get("orden_compra_item_id")
    })
    oci_map: Dict[int, dict] = {}
    oci_select_variants = [
        "id, orden_compra_id, solicitud_item_id, presupuesto_id, "
        "material_descripcion, unidad, valor_unitario, proveedor_nombre",
        "id, orden_compra_id, solicitud_item_id, presupuesto_id, "
        "material_descripcion, unidad, valor_unitario",
    ]
    for select in oci_select_variants:
        try:
            oci_map = {}
            for chunk in _chunks(oci_ids):
                for o in (
                    sb.table("almacen_orden_compra_item")
                    .select(select)
                    .in_("id", chunk)
                    .execute()
                    .data
                    or []
                ):
                    oci_map[int(o["id"])] = o
            break
        except Exception as exc:  # noqa: BLE001
            from almacen_service import _pgrst_unknown_column
            col = _pgrst_unknown_column(exc)
            if col == "proveedor_nombre" or "proveedor_nombre" in str(exc):
                continue
            raise

    oc_ids = sorted({
        int(o["orden_compra_id"]) for o in oci_map.values() if o.get("orden_compra_id")
    })
    oc_map = _fetch_oc_rows(sb, oc_ids)

    si_ids = sorted({
        int(o["solicitud_item_id"]) for o in oci_map.values() if o.get("solicitud_item_id")
    })
    si_map: Dict[int, dict] = {}
    for chunk in _chunks(si_ids):
        for s in (
            sb.table("almacen_solicitud_item")
            .select(
                "id, insumo_id, presupuesto_id, es_principal, cantidad, "
                "valor_compra_unitario, material_descripcion, unidad, capitulo, item"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            si_map[int(s["id"])] = s

    sol_ids = [
        int(r["id"])
        for r in (
            sb.table("almacen_solicitud")
            .select("id, estado")
            .eq("contrato_id", int(contrato_id))
            .in_("estado", ["enviada", "aprobada"])
            .execute()
            .data
            or []
        )
    ]
    si_comp_rows: List[dict] = []
    for chunk in _chunks(sol_ids):
        batch = (
            sb.table("almacen_solicitud_item")
            .select(
                "id, insumo_id, presupuesto_id, es_principal, cantidad, "
                "valor_compra_unitario, material_descripcion, unidad, capitulo, item"
            )
            .in_("solicitud_id", chunk)
            .execute()
            .data
            or []
        )
        si_comp_rows.extend(batch)

    insumo_ids = set()
    for s in si_map.values():
        if s.get("insumo_id"):
            insumo_ids.add(int(s["insumo_id"]))
    for s in si_comp_rows:
        if s.get("insumo_id"):
            insumo_ids.add(int(s["insumo_id"]))
    for e in ent_rows:
        if e.get("insumo_id"):
            insumo_ids.add(int(e["insumo_id"]))

    insumo_map: Dict[int, dict] = {}
    for chunk in _chunks(sorted(insumo_ids)):
        for select in (
            "id, codigo, descripcion, unidad, rendimiento, "
            "valor_compra_referencia, costo_base, proveedor_id, "
            "cantidad_negociada, valor_negociado_total",
            "id, codigo, descripcion, unidad, rendimiento, "
            "valor_compra_referencia, costo_base, proveedor_id",
            "id, codigo, descripcion, unidad, rendimiento, "
            "valor_compra_referencia, costo_base",
            "id, codigo, descripcion, unidad",
        ):
            try:
                for m in (
                    sb.table("almacen_insumo")
                    .select(select)
                    .in_("id", chunk)
                    .execute()
                    .data
                    or []
                ):
                    insumo_map[int(m["id"])] = m
                break
            except Exception as exc:  # noqa: BLE001
                from almacen_service import _pgrst_unknown_column
                col = _pgrst_unknown_column(exc)
                if col or "does not exist" in str(exc).lower():
                    continue
                raise

    prov_ids = set()
    for e in ent_rows:
        if e.get("proveedor_id"):
            prov_ids.add(int(e["proveedor_id"]))
    for o in oc_map.values():
        if o.get("proveedor_id"):
            prov_ids.add(int(o["proveedor_id"]))
    for m in insumo_map.values():
        if m.get("proveedor_id"):
            prov_ids.add(int(m["proveedor_id"]))
    prov_map = _fetch_proveedor_map(sb, sorted(prov_ids))

    ei_ids = [int(ei["id"]) for ei in ei_rows if ei.get("id") is not None]
    despacho_map = _despacho_neto_por_entrada_item(sb, ei_ids) if ei_ids else {}

    def _resolve_item_key(presupuesto_id, si_row=None, oci_row=None) -> Optional[str]:
        if presupuesto_id and int(presupuesto_id) in ppto_to_key:
            return ppto_to_key[int(presupuesto_id)]
        if si_row and (si_row.get("capitulo") or si_row.get("item")):
            return make_item_key(si_row.get("capitulo"), si_row.get("item"))
        if oci_row and oci_row.get("presupuesto_id") and int(oci_row["presupuesto_id"]) in ppto_to_key:
            return ppto_to_key[int(oci_row["presupuesto_id"])]
        return None

    movement_lines: List[dict] = []
    for ei in ei_rows:
        oci = oci_map.get(int(ei["orden_compra_item_id"])) if ei.get("orden_compra_item_id") else {}
        si = si_map.get(int(oci["solicitud_item_id"])) if oci and oci.get("solicitud_item_id") else {}
        ent = ent_map.get(int(ei["entrada_id"]), {})

        pid = ei.get("presupuesto_id") or (oci or {}).get("presupuesto_id") or (si or {}).get("presupuesto_id")
        ikey = _resolve_item_key(pid, si, oci)
        if not ikey:
            continue
        if ikey not in item_by_key:
            item_by_key[ikey] = {
                "item_key": ikey,
                "capitulo": (si or {}).get("capitulo"),
                "item": (si or {}).get("item"),
                "descripcion": (oci or {}).get("material_descripcion"),
                "unidad": (oci or {}).get("unidad") or "UND",
                "vu_cobro": None,
                "presupuesto_ids": [int(pid)] if pid else [],
                "cant_presupuestada": 0.0,
                "pk_id": None,
            }

        oc_id = None
        numero_oc = None
        estado = None
        proveedor_id = None
        proveedor_nombre = None
        if oci and oci.get("orden_compra_id"):
            oc_id = int(oci["orden_compra_id"])
            oc = oc_map.get(oc_id, {})
            numero_oc = oc.get("numero_oc")
            estado = (oc.get("estado") or "").strip() or None
            if oc.get("proveedor_id"):
                proveedor_id = int(oc["proveedor_id"])
            proveedor_nombre = (oc.get("proveedor_nombre") or "").strip() or None
        if ent.get("proveedor_id") and proveedor_id is None:
            proveedor_id = int(ent["proveedor_id"])
        if oci and not proveedor_nombre:
            proveedor_nombre = (oci.get("proveedor_nombre") or "").strip() or None
        if proveedor_id and not proveedor_nombre:
            proveedor_nombre = prov_map.get(proveedor_id)
        if not proveedor_nombre:
            proveedor_nombre = "Sin proveedor"

        qty_in = _f(ei.get("cantidad_recibida"))
        qty_out = _f(despacho_map.get(int(ei["id"]), 0.0))
        saldo = max(0.0, _round4(qty_in - qty_out))
        vu = _unit_cost(qty_in, ei.get("valor_recibido"), (oci or {}).get("valor_unitario"))
        valor_in = _round2(
            _f(ei.get("valor_recibido")) if ei.get("valor_recibido") is not None else qty_in * vu
        )
        valor_out = _round2(qty_out * vu)
        valor_stk = _round2(saldo * vu)

        insumo_id = None
        if si and si.get("insumo_id"):
            insumo_id = int(si["insumo_id"])
        elif ent.get("insumo_id"):
            insumo_id = int(ent["insumo_id"])

        movement_lines.append({
            "item_key": ikey,
            "insumo_id": insumo_id,
            "entrada_item_id": int(ei["id"]) if ei.get("id") is not None else None,
            "orden_compra_id": oc_id,
            "numero_oc": numero_oc,
            "proveedor_nombre": proveedor_nombre,
            "estado": estado,
            "material_descripcion": (oci or {}).get("material_descripcion") or (si or {}).get("material_descripcion"),
            "unidad": (oci or {}).get("unidad") or (si or {}).get("unidad"),
            "valor_unitario": _round2(vu) if vu else ((oci or {}).get("valor_unitario")),
            "entradas": qty_in,
            "salidas": qty_out,
            "saldo": saldo,
            "valor_entradas": valor_in,
            "valor_salidas": valor_out,
            "valor_stock": valor_stk,
        })

    # OCs del contrato vinculadas a insumos de solicitud, incluso sin entrada aún
    # (permite ver "OC sin entrada" en la trazabilidad).
    seen_oc_keys = {
        (
            str(ln.get("item_key") or ""),
            int(ln["insumo_id"]) if ln.get("insumo_id") is not None else None,
            int(ln["orden_compra_id"]) if ln.get("orden_compra_id") is not None else None,
        )
        for ln in movement_lines
    }
    si_comp_ids = sorted({int(s["id"]) for s in si_comp_rows if s.get("id") is not None})
    si_comp_map = {int(s["id"]): s for s in si_comp_rows if s.get("id") is not None}
    if si_comp_ids:
        oci_extra: List[dict] = []
        oci_extra_selects = [
            "id, orden_compra_id, solicitud_item_id, presupuesto_id, "
            "material_descripcion, unidad, valor_unitario, proveedor_nombre",
            "id, orden_compra_id, solicitud_item_id, presupuesto_id, "
            "material_descripcion, unidad, valor_unitario",
        ]
        for select in oci_extra_selects:
            try:
                oci_extra = []
                for chunk in _chunks(si_comp_ids):
                    oci_extra.extend(
                        sb.table("almacen_orden_compra_item")
                        .select(select)
                        .in_("solicitud_item_id", chunk)
                        .execute()
                        .data
                        or []
                    )
                break
            except Exception as exc:  # noqa: BLE001
                from almacen_service import _pgrst_unknown_column
                col = _pgrst_unknown_column(exc)
                if col == "proveedor_nombre" or "proveedor_nombre" in str(exc):
                    continue
                raise

        missing_oc_ids = sorted({
            int(o["orden_compra_id"])
            for o in oci_extra
            if o.get("orden_compra_id") and int(o["orden_compra_id"]) not in oc_map
        })
        if missing_oc_ids:
            oc_map.update(_fetch_oc_rows(sb, missing_oc_ids))
            # Proveedores de OCs nuevas
            extra_prov = sorted({
                int(oc_map[oid]["proveedor_id"])
                for oid in missing_oc_ids
                if oc_map.get(oid) and oc_map[oid].get("proveedor_id")
                and int(oc_map[oid]["proveedor_id"]) not in prov_map
            })
            if extra_prov:
                prov_map.update(_fetch_proveedor_map(sb, extra_prov))

        for oci in oci_extra:
            sid = oci.get("solicitud_item_id")
            si = si_map.get(int(sid)) if sid else None
            if not si and sid:
                si = si_comp_map.get(int(sid))
            if not si or not si.get("insumo_id"):
                continue
            iid = int(si["insumo_id"])
            pid = oci.get("presupuesto_id") or si.get("presupuesto_id")
            ikey = _resolve_item_key(pid, si, oci)
            if not ikey:
                continue
            oc_id = int(oci["orden_compra_id"]) if oci.get("orden_compra_id") else None
            stub_key = (ikey, iid, oc_id)
            if stub_key in seen_oc_keys:
                continue
            seen_oc_keys.add(stub_key)

            if ikey not in item_by_key:
                item_by_key[ikey] = {
                    "item_key": ikey,
                    "capitulo": si.get("capitulo"),
                    "item": si.get("item"),
                    "descripcion": oci.get("material_descripcion") or si.get("material_descripcion"),
                    "unidad": oci.get("unidad") or si.get("unidad") or "UND",
                    "vu_cobro": None,
                    "presupuesto_ids": [int(pid)] if pid else [],
                    "cant_presupuestada": 0.0,
                    "pk_id": None,
                }

            oc = oc_map.get(oc_id, {}) if oc_id else {}
            proveedor_nombre = (oc.get("proveedor_nombre") or oci.get("proveedor_nombre") or "").strip() or None
            if oc.get("proveedor_id") and not proveedor_nombre:
                proveedor_nombre = prov_map.get(int(oc["proveedor_id"]))
            if not proveedor_nombre:
                proveedor_nombre = "Sin proveedor"

            movement_lines.append({
                "item_key": ikey,
                "insumo_id": iid,
                "entrada_item_id": None,
                "orden_compra_id": oc_id,
                "numero_oc": oc.get("numero_oc"),
                "proveedor_nombre": proveedor_nombre,
                "estado": (oc.get("estado") or "").strip() or None,
                "material_descripcion": oci.get("material_descripcion") or si.get("material_descripcion"),
                "unidad": oci.get("unidad") or si.get("unidad"),
                "valor_unitario": oci.get("valor_unitario"),
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
            })

    composition: Dict[str, List[dict]] = defaultdict(list)
    seen_comp: Dict[str, set] = defaultdict(set)

    def _add_comp(ikey: str, row: dict, *, es_principal_default: bool = True):
        iid = row.get("insumo_id")
        if not iid or not ikey:
            return
        iid = int(iid)
        if iid in seen_comp[ikey]:
            return
        seen_comp[ikey].add(iid)
        meta = insumo_map.get(iid, {})
        vu = row.get("valor_compra_unitario")
        vu_f = _f(vu) if vu is not None and _f(vu) > 0 else None
        if vu_f is None:
            ref = meta.get("valor_compra_referencia")
            if ref is not None and _f(ref) > 0:
                vu_f = _f(ref)
            elif meta.get("costo_base") is not None and _f(meta.get("costo_base")) > 0:
                vu_f = _f(meta.get("costo_base"))
        rend = meta.get("rendimiento")
        es_principal = row.get("es_principal")
        if es_principal is None:
            es_principal = es_principal_default
        else:
            es_principal = es_principal is not False
        composition[ikey].append({
            "insumo_id": iid,
            "codigo": meta.get("codigo"),
            "descripcion": (
                (meta.get("descripcion") or "").strip()
                or (row.get("material_descripcion") or "").strip()
                or f"Insumo #{iid}"
            ),
            "unidad": meta.get("unidad") or row.get("unidad"),
            "es_principal": es_principal,
            "rendimiento": _f(rend) if rend is not None else None,
            "vu_costo": vu_f,
            "valor_negociado_total": (
                _round2(_f(meta.get("valor_negociado_total")))
                if meta.get("valor_negociado_total") is not None
                else None
            ),
            "_cantidad": _f(row.get("cantidad")),
        })

    for s in si_comp_rows:
        pid = s.get("presupuesto_id")
        ikey = _resolve_item_key(pid, s, None)
        if not ikey:
            continue
        if ikey not in item_by_key:
            item_by_key[ikey] = {
                "item_key": ikey,
                "capitulo": s.get("capitulo"),
                "item": s.get("item"),
                "descripcion": s.get("material_descripcion"),
                "unidad": s.get("unidad") or "UND",
                "vu_cobro": None,
                "presupuesto_ids": [int(pid)] if pid else [],
                "cant_presupuestada": 0.0,
                "pk_id": None,
            }
        _add_comp(ikey, s)

    for ikey, rows in composition.items():
        principal = next((r for r in rows if r.get("es_principal")), None)
        cant_p = _f(principal.get("_cantidad")) if principal else 0.0
        if cant_p <= 0:
            continue
        for r in rows:
            if r.get("rendimiento") is None and _f(r.get("_cantidad")) > 0:
                r["rendimiento"] = _round4(_f(r["_cantidad"]) / cant_p)

    for rows in composition.values():
        for r in rows:
            r.pop("_cantidad", None)

    return movement_lines, dict(composition)
