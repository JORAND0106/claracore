"""Inventario en árbol: ítem → insumo → proveedor (tab Inventario)."""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

_CACHE: Dict[int, Tuple[float, dict]] = {}
_CACHE_TTL_SEC = 90
_IN_CHUNK = 200


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
    """Costo unitario efectivo de una línea de entrada."""
    q = _f(qty)
    if q > 0 and valor is not None and _f(valor) > 0:
        return _f(valor) / q
    return _f(vu_fallback)


def build_inventario_arbol_from_lines(
    *,
    ppto_rows: List[dict],
    vu_cobro_by_ppto: Dict[int, Optional[float]],
    composition: Dict[int, List[dict]],
    movement_lines: List[dict],
) -> dict:
    """
    Agrega el árbol a partir de datos ya resueltos (testeable sin Supabase).

    composition[presupuesto_id] = [
      {insumo_id, codigo, descripcion, unidad, es_principal, rendimiento, vu_costo}, ...
    ]
    movement_lines = [
      {
        presupuesto_id, insumo_id, proveedor_id, proveedor_nombre,
        entradas, salidas, saldo,
        valor_entradas, valor_salidas, valor_stock,
        vu_costo_mov (opcional),
      }, ...
    ]
    """
    # Agregar movimientos por (ppto, insumo, proveedor)
    mov_prov: Dict[Tuple[int, int, Optional[int]], dict] = {}
    for ln in movement_lines:
        pid = int(ln["presupuesto_id"])
        iid = int(ln["insumo_id"]) if ln.get("insumo_id") is not None else 0
        prid = int(ln["proveedor_id"]) if ln.get("proveedor_id") is not None else None
        key = (pid, iid, prid)
        acc = mov_prov.get(key)
        if not acc:
            acc = {
                "presupuesto_id": pid,
                "insumo_id": iid or None,
                "proveedor_id": prid,
                "proveedor_nombre": ln.get("proveedor_nombre") or "Sin proveedor",
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
            }
            mov_prov[key] = acc
        acc["entradas"] = _round4(acc["entradas"] + _f(ln.get("entradas")))
        acc["salidas"] = _round4(acc["salidas"] + _f(ln.get("salidas")))
        acc["saldo"] = _round4(acc["saldo"] + _f(ln.get("saldo")))
        acc["valor_entradas"] = _round2(acc["valor_entradas"] + _f(ln.get("valor_entradas")))
        acc["valor_salidas"] = _round2(acc["valor_salidas"] + _f(ln.get("valor_salidas")))
        acc["valor_stock"] = _round2(acc["valor_stock"] + _f(ln.get("valor_stock")))
        if ln.get("proveedor_nombre"):
            acc["proveedor_nombre"] = ln["proveedor_nombre"]

    # Roll-up a (ppto, insumo)
    mov_insumo: Dict[Tuple[int, int], dict] = {}
    for acc in mov_prov.values():
        iid = int(acc["insumo_id"] or 0)
        key = (int(acc["presupuesto_id"]), iid)
        bucket = mov_insumo.get(key)
        if not bucket:
            bucket = {
                "presupuesto_id": acc["presupuesto_id"],
                "insumo_id": iid or None,
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
                "proveedores": [],
            }
            mov_insumo[key] = bucket
        bucket["entradas"] = _round4(bucket["entradas"] + acc["entradas"])
        bucket["salidas"] = _round4(bucket["salidas"] + acc["salidas"])
        bucket["saldo"] = _round4(bucket["saldo"] + acc["saldo"])
        bucket["valor_entradas"] = _round2(bucket["valor_entradas"] + acc["valor_entradas"])
        bucket["valor_salidas"] = _round2(bucket["valor_salidas"] + acc["valor_salidas"])
        bucket["valor_stock"] = _round2(bucket["valor_stock"] + acc["valor_stock"])
        # Nivel 3: solo proveedores con stock real
        if acc["saldo"] > 1e-9:
            bucket["proveedores"].append({
                "proveedor_id": acc["proveedor_id"],
                "proveedor_nombre": acc["proveedor_nombre"],
                "entradas": acc["entradas"],
                "salidas": acc["salidas"],
                "saldo": acc["saldo"],
                "valor_entradas": acc["valor_entradas"],
                "valor_salidas": acc["valor_salidas"],
                "valor_stock": acc["valor_stock"],
            })

    items_out: List[dict] = []
    resumen = {
        "valor_stock": 0.0,
        "valor_entradas": 0.0,
        "valor_salidas": 0.0,
        "entradas": 0.0,
        "salidas": 0.0,
        "saldo": 0.0,
    }

    for p in ppto_rows:
        pid = int(p["id"])
        vu_cobro = vu_cobro_by_ppto.get(pid)
        if vu_cobro is not None:
            vu_cobro = _f(vu_cobro) if _f(vu_cobro) > 0 else None

        # Composición base + insumos que solo aparecen en movimientos
        comp_list = list(composition.get(pid) or [])
        seen_insumos = {
            int(c["insumo_id"]) for c in comp_list if c.get("insumo_id") is not None
        }
        for (pp, iid), bucket in mov_insumo.items():
            if pp != pid or not iid or iid in seen_insumos:
                continue
            comp_list.append({
                "insumo_id": iid,
                "codigo": None,
                "descripcion": f"Insumo #{iid}",
                "unidad": None,
                "es_principal": False,
                "rendimiento": None,
                "vu_costo": None,
            })
            seen_insumos.add(iid)

        # VU costo ítem = sumatoria de costos por unidad de cobro (rentabilidad)
        sum_costo_unit = 0.0
        tiene_costo = False
        rend_item = None
        principal = next((c for c in comp_list if c.get("es_principal") is not False), None)
        if principal and principal.get("rendimiento") is not None:
            rend_item = _f(principal.get("rendimiento")) or None

        insumos_out: List[dict] = []
        for c in comp_list:
            iid = int(c["insumo_id"]) if c.get("insumo_id") is not None else None
            if iid is None:
                continue
            bucket = mov_insumo.get((pid, iid), {
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "valor_stock": 0.0,
                "proveedores": [],
            })
            rend = c.get("rendimiento")
            rend_f = _f(rend) if rend is not None else None
            vu_costo_i = c.get("vu_costo")
            vu_costo_i = _f(vu_costo_i) if vu_costo_i is not None and _f(vu_costo_i) > 0 else None
            # Contribución unitaria al costo del ítem
            if vu_costo_i is not None:
                factor = rend_f if rend_f is not None and rend_f > 0 else 1.0
                sum_costo_unit += vu_costo_i * factor
                tiene_costo = True

            es_principal = c.get("es_principal") is not False
            # Utilidad del insumo: cobro solo en principal; costo = vu×rendimiento
            costo_contrib = (
                _round2(vu_costo_i * (rend_f if rend_f and rend_f > 0 else 1.0))
                if vu_costo_i is not None
                else None
            )
            if es_principal and vu_cobro is not None and costo_contrib is not None:
                utilidad_i = _round2(vu_cobro - costo_contrib)
            elif costo_contrib is not None:
                utilidad_i = _round2(-costo_contrib)
            else:
                utilidad_i = None

            proveedores = sorted(
                bucket.get("proveedores") or [],
                key=lambda x: (str(x.get("proveedor_nombre") or "").lower(), x.get("proveedor_id") or 0),
            )
            insumos_out.append({
                "insumo_id": iid,
                "codigo": c.get("codigo"),
                "descripcion": c.get("descripcion") or "—",
                "unidad": c.get("unidad"),
                "es_principal": es_principal,
                "rendimiento": rend_f,
                "vu_costo": vu_costo_i,
                "utilidad": utilidad_i,
                "entradas": bucket["entradas"],
                "salidas": bucket["salidas"],
                "saldo": bucket["saldo"],
                "valor_entradas": bucket["valor_entradas"],
                "valor_salidas": bucket["valor_salidas"],
                "valor_stock": bucket["valor_stock"],
                "proveedores": proveedores,
            })

        # Orden: principal primero, luego descripción
        insumos_out.sort(
            key=lambda r: (0 if r.get("es_principal") else 1, str(r.get("descripcion") or "").lower()),
        )

        vu_costo = _round2(sum_costo_unit) if tiene_costo else None
        utilidad = (
            _round2(_f(vu_cobro) - vu_costo)
            if vu_cobro is not None and vu_costo is not None
            else None
        )

        # Totales de cantidad del ítem = suma de insumos (pueden ser distintas unidades;
        # se reportan como suma de movimientos del ítem).
        ent = _round4(sum(_f(i["entradas"]) for i in insumos_out))
        sal = _round4(sum(_f(i["salidas"]) for i in insumos_out))
        saldo = _round4(sum(_f(i["saldo"]) for i in insumos_out))
        v_ent = _round2(sum(_f(i["valor_entradas"]) for i in insumos_out))
        v_sal = _round2(sum(_f(i["valor_salidas"]) for i in insumos_out))
        v_stk = _round2(sum(_f(i["valor_stock"]) for i in insumos_out))

        resumen["valor_entradas"] = _round2(resumen["valor_entradas"] + v_ent)
        resumen["valor_salidas"] = _round2(resumen["valor_salidas"] + v_sal)
        resumen["valor_stock"] = _round2(resumen["valor_stock"] + v_stk)
        resumen["entradas"] = _round4(resumen["entradas"] + ent)
        resumen["salidas"] = _round4(resumen["salidas"] + sal)
        resumen["saldo"] = _round4(resumen["saldo"] + saldo)

        items_out.append({
            "presupuesto_id": pid,
            "capitulo": p.get("capitulo"),
            "item": p.get("item"),
            "descripcion": p.get("descripcion"),
            "unidad": p.get("und") or p.get("unidad"),
            "cant_presupuestada": _f(p.get("cant_total")),
            "pk_id": p.get("pk_id"),
            "vu_cobro": vu_cobro,
            "vu_costo": vu_costo,
            "rendimiento": rend_item,
            "utilidad": utilidad,
            "entradas": ent,
            "salidas": sal,
            "saldo": saldo,
            "valor_entradas": v_ent,
            "valor_salidas": v_sal,
            "valor_stock": v_stk,
            "insumos": insumos_out,
        })

    # Orden natural por capítulo / ítem
    def _sort_key(it: dict):
        return (
            str(it.get("capitulo") or ""),
            str(it.get("item") or ""),
            str(it.get("descripcion") or ""),
            int(it.get("presupuesto_id") or 0),
        )

    items_out.sort(key=_sort_key)
    return {"items": items_out, "resumen": resumen}


def list_inventario_arbol(contrato_id: int) -> dict:
    """Árbol completo del inventario del contrato (con caché corta)."""
    cached = _cache_get(contrato_id)
    if cached is not None:
        return cached

    from almacen_insumos_service import (
        get_listado_precio_lookup,
        _norm_capitulo_key,
        _norm_item_key,
    )
    from almacen_service import (
        _despacho_neto_por_entrada_item,
        _sb,
        list_presupuesto_items,
    )

    sb = _sb()
    ppto_rows = list_presupuesto_items(contrato_id)
    if not ppto_rows:
        out = {
            "items": [],
            "resumen": {
                "valor_stock": 0.0,
                "valor_entradas": 0.0,
                "valor_salidas": 0.0,
                "entradas": 0.0,
                "salidas": 0.0,
                "saldo": 0.0,
            },
            "generado_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        _cache_set(contrato_id, out)
        return out

    price_lookup = get_listado_precio_lookup(contrato_id)
    vu_cobro_by_ppto: Dict[int, Optional[float]] = {}
    for p in ppto_rows:
        pid = int(p["id"])
        cap = _norm_capitulo_key(p.get("capitulo"))
        itm = _norm_item_key(p.get("item"))
        price = price_lookup.get((cap, itm))
        if price is None:
            # Variantes ya están en el lookup; intentar raw
            price = price_lookup.get(((p.get("capitulo") or "").strip().lower(), itm))
        vu_cobro_by_ppto[pid] = float(price) if price is not None and float(price) > 0 else None

    ppto_ids = [int(p["id"]) for p in ppto_rows]

    # Entradas del contrato
    ent_rows = (
        sb.table("almacen_entrada")
        .select("id, proveedor_id, insumo_id")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
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
    for chunk in _chunks(oci_ids):
        for o in (
            sb.table("almacen_orden_compra_item")
            .select(
                "id, orden_compra_id, solicitud_item_id, presupuesto_id, "
                "material_descripcion, unidad, valor_unitario"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            oci_map[int(o["id"])] = o

    oc_ids = sorted({
        int(o["orden_compra_id"]) for o in oci_map.values() if o.get("orden_compra_id")
    })
    oc_map: Dict[int, dict] = {}
    for chunk in _chunks(oc_ids):
        for o in (
            sb.table("almacen_orden_compra")
            .select("id, proveedor_id, proveedor_nombre")
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            oc_map[int(o["id"])] = o

    si_ids = sorted({
        int(o["solicitud_item_id"]) for o in oci_map.values() if o.get("solicitud_item_id")
    })
    si_map: Dict[int, dict] = {}
    for chunk in _chunks(si_ids):
        for s in (
            sb.table("almacen_solicitud_item")
            .select(
                "id, insumo_id, presupuesto_id, es_principal, cantidad, "
                "valor_compra_unitario, material_descripcion, unidad"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            si_map[int(s["id"])] = s

    # Composición adicional desde solicitudes del contrato (ítems sin entradas aún)
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
    ppto_set = set(ppto_ids)
    si_comp_rows: List[dict] = []
    for chunk in _chunks(sol_ids):
        batch = (
            sb.table("almacen_solicitud_item")
            .select(
                "id, insumo_id, presupuesto_id, es_principal, cantidad, "
                "valor_compra_unitario, material_descripcion, unidad"
            )
            .in_("solicitud_id", chunk)
            .execute()
            .data
            or []
        )
        si_comp_rows.extend(
            r for r in batch if int(r.get("presupuesto_id") or 0) in ppto_set
        )

    # Meta de insumos
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
        for m in (
            sb.table("almacen_insumo")
            .select(
                "id, codigo, descripcion, unidad, rendimiento, "
                "valor_compra_referencia, costo_base, proveedor_id"
            )
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            insumo_map[int(m["id"])] = m

    # Proveedores
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
    prov_map: Dict[int, str] = {}
    for chunk in _chunks(sorted(prov_ids)):
        for p in (
            sb.table("almacen_proveedor")
            .select("id, nombre")
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            prov_map[int(p["id"])] = (p.get("nombre") or "").strip() or f"Proveedor #{p['id']}"

    # Despacho neto por entrada_item
    ei_ids = [int(ei["id"]) for ei in ei_rows if ei.get("id") is not None]
    despacho_map = _despacho_neto_por_entrada_item(sb, ei_ids) if ei_ids else {}

    movement_lines: List[dict] = []
    for ei in ei_rows:
        pid = ei.get("presupuesto_id")
        if not pid or int(pid) not in ppto_set:
            # Intentar desde OCI
            oci = oci_map.get(int(ei["orden_compra_item_id"])) if ei.get("orden_compra_item_id") else None
            pid = oci.get("presupuesto_id") if oci else None
        if not pid or int(pid) not in ppto_set:
            continue
        pid = int(pid)
        oci = oci_map.get(int(ei["orden_compra_item_id"])) if ei.get("orden_compra_item_id") else {}
        si = si_map.get(int(oci["solicitud_item_id"])) if oci and oci.get("solicitud_item_id") else {}
        ent = ent_map.get(int(ei["entrada_id"]), {})

        insumo_id = None
        if si and si.get("insumo_id"):
            insumo_id = int(si["insumo_id"])
        elif ent.get("insumo_id"):
            insumo_id = int(ent["insumo_id"])
        if insumo_id is None:
            # Sin insumo resoluble: agrupar como 0 (se mostrará solo si hay movimiento)
            insumo_id = 0

        proveedor_id = None
        proveedor_nombre = None
        if ent.get("proveedor_id"):
            proveedor_id = int(ent["proveedor_id"])
        elif oci and oci.get("orden_compra_id"):
            oc = oc_map.get(int(oci["orden_compra_id"]), {})
            if oc.get("proveedor_id"):
                proveedor_id = int(oc["proveedor_id"])
            proveedor_nombre = (oc.get("proveedor_nombre") or "").strip() or None
        if proveedor_id and not proveedor_nombre:
            proveedor_nombre = prov_map.get(proveedor_id)
        if not proveedor_nombre:
            proveedor_nombre = "Sin proveedor"

        qty_in = _f(ei.get("cantidad_recibida"))
        qty_out = _f(despacho_map.get(int(ei["id"]), 0.0))
        saldo = max(0.0, _round4(qty_in - qty_out))
        vu = _unit_cost(qty_in, ei.get("valor_recibido"), (oci or {}).get("valor_unitario"))
        valor_in = _round2(_f(ei.get("valor_recibido")) if ei.get("valor_recibido") is not None else qty_in * vu)
        valor_out = _round2(qty_out * vu)
        valor_stk = _round2(saldo * vu)

        movement_lines.append({
            "presupuesto_id": pid,
            "insumo_id": insumo_id,
            "proveedor_id": proveedor_id,
            "proveedor_nombre": proveedor_nombre,
            "entradas": qty_in,
            "salidas": qty_out,
            "saldo": saldo,
            "valor_entradas": valor_in,
            "valor_salidas": valor_out,
            "valor_stock": valor_stk,
        })

    # Composición por presupuesto
    composition: Dict[int, List[dict]] = defaultdict(list)
    seen_comp: Dict[int, set] = defaultdict(set)

    def _add_comp(pid: int, row: dict, *, es_principal_default: bool = True):
        iid = row.get("insumo_id")
        if not iid:
            return
        iid = int(iid)
        if iid in seen_comp[pid]:
            return
        seen_comp[pid].add(iid)
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
        # Si no hay rendimiento en catálogo, estimar con cantidad del principal vs asociados
        es_principal = row.get("es_principal")
        if es_principal is None:
            es_principal = es_principal_default
        else:
            es_principal = es_principal is not False
        composition[pid].append({
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
            "_cantidad": _f(row.get("cantidad")),
        })

    for s in si_comp_rows:
        _add_comp(int(s["presupuesto_id"]), s)

    # Completar rendimiento relativo cuando falta: ratio cant / cant_principal
    for pid, rows in composition.items():
        principal = next((r for r in rows if r.get("es_principal")), None)
        cant_p = _f(principal.get("_cantidad")) if principal else 0.0
        if cant_p <= 0:
            continue
        for r in rows:
            if r.get("rendimiento") is None and _f(r.get("_cantidad")) > 0:
                r["rendimiento"] = _round4(_f(r["_cantidad"]) / cant_p)

    # Limpiar helper
    for rows in composition.values():
        for r in rows:
            r.pop("_cantidad", None)

    built = build_inventario_arbol_from_lines(
        ppto_rows=ppto_rows,
        vu_cobro_by_ppto=vu_cobro_by_ppto,
        composition=dict(composition),
        movement_lines=movement_lines,
    )
    built["generado_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    _cache_set(contrato_id, built)
    return built
