"""
Costo de mano de obra de subcontratistas para rentabilidad Almacén.

Solo LECTURA de SICOE Obra / Subcontratistas (no modifica esos módulos).

Fuente primaria: so_registros validados Nivel 2 (objeto de pago al sub) ×
precio pactado en subcontratista_precios (sin promediar precios).

Fuente de respaldo (Inventario / ítems sin ejecución N2 aún): VU Costo M.O.
pactado en subcontratista_precios (con AIU/IVA del subcontratista), p. ej. Rocería.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger(__name__)

_IN_CHUNK = 120


def _norm_txt(s: Optional[str]) -> str:
    t = str(s or "").strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _norm_item(s: Optional[str]) -> str:
    t = _norm_txt(s)
    return re.sub(r"\.+$", "", t)


def _norm_cap(s: Optional[str]) -> str:
    t = _norm_txt(s)
    t = re.sub(r"^(\d+\.)\s+", r"\1", t)
    return t


def _f(v: Any) -> float:
    try:
        if v is None or v == "":
            return 0.0
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _item_key(capitulo: Optional[str], item: Optional[str]) -> str:
    from almacen_inventario_arbol import make_item_key
    return make_item_key(capitulo, item)


def _chunked(ids: List[int], size: int = _IN_CHUNK):
    for i in range(0, len(ids), size):
        yield ids[i:i + size]


def _sb():
    from almacen_service import _sb as _almacen_sb
    return _almacen_sb()


def _vu_mo_unitario_con_aiu(
    precio_base: Any,
    *,
    precio_con_aiu: Any = None,
    tributos: Any = None,
) -> Optional[float]:
    """VU unitario comparable a cobro: prioriza con AIU/IVA; si no, aplica tributos del sub."""
    stamped = _f(precio_con_aiu)
    if stamped > 0:
        return stamped
    base = _f(precio_base)
    if base <= 0:
        return None
    try:
        from almacen_insumos_service import compute_valor_despues_aiu_iva, tributos_tienen_datos

        if tributos_tienen_datos(tributos):
            return float(compute_valor_despues_aiu_iva(base, tributos))
    except Exception:
        _log.exception("MO: no se pudo aplicar AIU/IVA al VU pactado")
    return base


def _fetch_precios_rows(sb, contrato_id: int) -> List[dict]:
    """Lee subcontratista_precios con degradación si faltan columnas (AIU / manual)."""
    selects = [
        "subcontratista_id, listado_precio_id, precio_unitario_sub, precio_unitario_con_aiu, "
        "cantidad_manual, origen, tributos, listado_precios(capitulo, item_numero, unidad)",
        "subcontratista_id, listado_precio_id, precio_unitario_sub, precio_unitario_con_aiu, "
        "tributos, listado_precios(capitulo, item_numero, unidad)",
        "subcontratista_id, listado_precio_id, precio_unitario_sub, "
        "listado_precios(capitulo, item_numero, unidad)",
    ]
    last_exc = None
    for sel in selects:
        try:
            return (
                sb.table("subcontratista_precios")
                .select(sel)
                .eq("contrato_id", int(contrato_id))
                .execute()
                .data
                or []
            )
        except Exception as exc:
            last_exc = exc
            continue
    if last_exc:
        _log.exception(
            "MO: no se pudieron leer subcontratista_precios (contrato=%s): %s",
            contrato_id,
            last_exc,
        )
    return []


def _tributos_por_sub(sb, contrato_id: int, sub_ids: List[int]) -> Dict[int, dict]:
    out: Dict[int, dict] = {}
    if not sub_ids:
        return out
    try:
        for part in _chunked(sorted(set(int(x) for x in sub_ids))):
            rows = (
                sb.table("subcontratistas")
                .select("id, tributos")
                .eq("contrato_id", int(contrato_id))
                .in_("id", part)
                .execute()
                .data
                or []
            )
            for r in rows:
                try:
                    out[int(r["id"])] = r.get("tributos") or {}
                except (TypeError, ValueError, KeyError):
                    continue
    except Exception:
        _log.exception("MO: no se pudieron leer tributos de subcontratistas (contrato=%s)", contrato_id)
    return out


def _subs_asignados_por_item(sb, contrato_id: int) -> Dict[str, set]:
    """item_key → set(subcontratista_id) desde presupuesto (si la columna existe)."""
    out: Dict[str, set] = {}
    try:
        offset = 0
        while True:
            batch = (
                sb.table("presupuesto")
                .select("capitulo, item, subcontratista_id, cant_total")
                .eq("contrato_id", int(contrato_id))
                .eq("tipo_ejecucion", "Presupuesto de Obra")
                .eq("dado_de_baja", False)
                .not_.is_("subcontratista_id", "null")
                .order("id")
                .range(offset, offset + 999)
                .execute()
                .data
                or []
            )
            for r in batch:
                try:
                    sub_id = int(r["subcontratista_id"])
                except (TypeError, ValueError, KeyError):
                    continue
                if _f(r.get("cant_total")) <= 0:
                    continue
                ikey = _item_key(r.get("capitulo"), r.get("item"))
                _cap, _, itm = ikey.partition("|")
                if not itm:
                    continue
                out.setdefault(ikey, set()).add(sub_id)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception:
        _log.info(
            "MO: presupuesto.subcontratista_id no disponible para asignaciones (contrato=%s)",
            contrato_id,
        )
    return out


def mapa_precios_pactados_sub(sb, contrato_id: int) -> Dict[Tuple[int, str], float]:
    """
    (subcontratista_id, item_key) → precio_unitario_sub (base, antes de AIU).
    Usado al valorizar ejecución N2 (cantidad × precio pactado de esa fila).
    """
    out: Dict[Tuple[int, str], float] = {}
    for r in _fetch_precios_rows(sb, contrato_id):
        try:
            sub_id = int(r["subcontratista_id"])
        except (TypeError, ValueError, KeyError):
            continue
        precio = _f(r.get("precio_unitario_sub"))
        if precio <= 0:
            continue
        lp = r.get("listado_precios") or {}
        if isinstance(lp, list):
            lp = lp[0] if lp else {}
        ikey = _item_key(lp.get("capitulo"), lp.get("item_numero"))
        _cap, _, _itm = ikey.partition("|")
        if not _itm:
            continue
        out[(sub_id, ikey)] = precio
    return out


def costos_mo_desde_precios_pactados(sb, contrato_id: int) -> Dict[str, dict]:
    """
    Fallback sin N2: VU Costo M.O. unitario desde precios pactados (con AIU/IVA).

    No promedia entre subcontratistas: prioriza el sub asignado en presupuesto;
    si hay varios precios distintos sin asignación única, omite el ítem.
    """
    rows = _fetch_precios_rows(sb, contrato_id)
    if not rows:
        return {}

    sub_ids = []
    for r in rows:
        try:
            sub_ids.append(int(r["subcontratista_id"]))
        except (TypeError, ValueError, KeyError):
            continue
    trib_by_sub = _tributos_por_sub(sb, contrato_id, sub_ids)
    assigned = _subs_asignados_por_item(sb, contrato_id)

    # item_key → list of candidate dicts
    cand: Dict[str, List[dict]] = {}
    for r in rows:
        try:
            sub_id = int(r["subcontratista_id"])
        except (TypeError, ValueError, KeyError):
            continue
        lp = r.get("listado_precios") or {}
        if isinstance(lp, list):
            lp = lp[0] if lp else {}
        ikey = _item_key(lp.get("capitulo"), lp.get("item_numero"))
        _cap, _, itm = ikey.partition("|")
        if not itm:
            continue
        from subcontratistas_items_cobro import resolve_tributos_subcontratista

        trib = resolve_tributos_subcontratista(trib_by_sub.get(sub_id) or {}, [r])
        vu = _vu_mo_unitario_con_aiu(
            r.get("precio_unitario_sub"),
            precio_con_aiu=r.get("precio_unitario_con_aiu"),
            tributos=trib,
        )
        if vu is None or vu <= 0:
            continue
        cant = _f(r.get("cantidad_manual")) if r.get("cantidad_manual") not in (None, "") else 0.0
        cand.setdefault(ikey, []).append({
            "subcontratista_id": sub_id,
            "vu": float(vu),
            "cantidad": cant if cant > 0 else None,
            "precio_unitario_sub": _f(r.get("precio_unitario_sub")),
        })

    out: Dict[str, dict] = {}
    for ikey, opts in cand.items():
        preferidos = [o for o in opts if o["subcontratista_id"] in (assigned.get(ikey) or set())]
        pool = preferidos if preferidos else opts
        precios_u = {round(o["vu"], 2) for o in pool}
        chosen = None
        if len(pool) == 1:
            chosen = pool[0]
        elif len(precios_u) == 1:
            chosen = pool[0]
        elif len(preferidos) == 1:
            chosen = preferidos[0]
        else:
            # Ambiguo: no inventar promedio entre subcontratistas distintos.
            continue
        vu = chosen["vu"]
        cant = chosen.get("cantidad")
        costo_linea = round(vu * cant, 2) if cant and cant > 0 else None
        out[ikey] = {
            "es_mo": True,
            "etiqueta_fila": "Mano de obra (subcontratistas)",
            "cantidad": cant,
            "costo_insumo_unitario": round(vu, 4),
            "costo_insumo_linea": costo_linea if costo_linea and costo_linea > 0 else (
                round(vu, 2)  # al menos el unitario como contribución visible
                if vu > 0 else None
            ),
            "fuente": "precios_pactados",
            "desglose": [{
                "subcontratista_id": chosen["subcontratista_id"],
                "precio_unitario_sub": chosen.get("precio_unitario_sub"),
                "precio_unitario_con_aiu": vu,
                "cantidad_total": cant,
                "costo_linea": costo_linea,
            }],
        }
        # Si no hay cantidad, costo_insumo_linea = vu (1 und) para que Inventario
        # detecte costo_mo > 0; _mo_unit_costo usará costo_insumo_unitario.
        if out[ikey]["costo_insumo_linea"] is None and vu > 0:
            out[ikey]["costo_insumo_linea"] = round(vu, 2)
    return out


def _precio_fila(
    precios: Dict[Tuple[int, str], float],
    sub_id: int,
    ikey: str,
    registro: dict,
) -> Optional[float]:
    pactado = precios.get((sub_id, ikey))
    if pactado is not None and pactado > 0:
        return pactado
    # Misma sub + mismo nº de ítem aunque el texto de capítulo difiera del listado.
    _cap, _, itm = str(ikey).partition("|")
    itm_n = _norm_item(itm)
    if itm_n:
        matches = [
            float(p)
            for (sid, k), p in (precios or {}).items()
            if int(sid) == int(sub_id)
            and _norm_item(str(k).partition("|")[2]) == itm_n
            and _f(p) > 0
        ]
        if len(matches) == 1:
            return matches[0]
    # Fallback histórico en el registro (sin inventar promedio).
    stamped = _f(registro.get("vlr_unitario_subcontratista"))
    if stamped > 0:
        return stamped
    return None


def _fetch_registros_mo_n2(
    sb,
    contrato_id: int,
    *,
    capitulo: Optional[str] = None,
    item: Optional[str] = None,
    pk_id_id: Optional[int] = None,
    pk_id: Optional[str] = None,
) -> List[dict]:
    """
    Ejecución validada N2, objeto de pago al sub, con subcontratista asignado.
    """
    select_cols = (
        "id, contrato_id, subcontratista_id, capitulo, item_numero, "
        "cantidad_total, pk_id_id, nivel2_estado, nivel2_objeto_pago_sub, "
        "vlr_unitario_subcontratista"
    )
    try:
        q = (
            sb.table("so_registros")
            .select(select_cols)
            .eq("contrato_id", int(contrato_id))
            .eq("nivel2_estado", "Aprobado")
            .eq("nivel2_objeto_pago_sub", True)
            .not_.is_("subcontratista_id", "null")
        )
        if pk_id_id is not None:
            q = q.eq("pk_id_id", int(pk_id_id))
        rows = q.execute().data or []
    except Exception:
        _log.exception("MO: fallo leyendo so_registros (contrato=%s)", contrato_id)
        return []

    # Filtro PK por código textual si no hay pk_id_id en la solicitud.
    if pk_id_id is None and pk_id:
        from almacen_service import _pk_id_coincide, _norm_pk_id

        pk_norm = _norm_pk_id(pk_id)
        if pk_norm:
            pk_ids_needed = sorted({
                int(r["pk_id_id"]) for r in rows if r.get("pk_id_id") is not None
            })
            pk_map: Dict[int, str] = {}
            for part in _chunked(pk_ids_needed):
                try:
                    batch = (
                        sb.table("pk_ids")
                        .select("id, pk_id")
                        .in_("id", part)
                        .execute()
                        .data
                        or []
                    )
                except Exception:
                    batch = []
                for p in batch:
                    try:
                        pk_map[int(p["id"])] = str(p.get("pk_id") or "")
                    except (TypeError, ValueError, KeyError):
                        continue
            rows = [
                r for r in rows
                if r.get("pk_id_id") is not None
                and _pk_id_coincide(pk_map.get(int(r["pk_id_id"])), pk_norm)
            ]

    if capitulo is not None or item is not None:
        want = _item_key(capitulo, item)
        rows = [
            r for r in rows
            if _item_key(r.get("capitulo"), r.get("item_numero")) == want
        ]
    return rows


def calcular_costo_mo(
    contrato_id: int,
    *,
    capitulo: str,
    item: str,
    pk_id_id: Optional[int] = None,
    pk_id: Optional[str] = None,
    sb=None,
    precios: Optional[Dict[Tuple[int, str], float]] = None,
) -> dict:
    """
    Costo MO para un ítem (opcionalmente acotado a un PK-ID).

    Retorna resumen con costo_insumo_linea = Σ (cantidad_total × precio_pactado_de_esa_fila).
    """
    client = sb or _sb()
    cap = _norm_cap(capitulo)
    itm = _norm_item(item)
    empty = {
        "es_mo": True,
        "etiqueta_fila": "Mano de obra (subcontratistas)",
        "cantidad": None,
        "costo_insumo_unitario": None,
        "costo_insumo_linea": None,
        "desglose": [],
    }
    if not itm:
        return empty

    price_map = precios if precios is not None else mapa_precios_pactados_sub(client, contrato_id)
    regs = _fetch_registros_mo_n2(
        client,
        contrato_id,
        capitulo=cap or capitulo,
        item=itm,
        pk_id_id=pk_id_id,
        pk_id=pk_id,
    )
    if not regs:
        # Sin N2: usar VU pactado del tab Precios (p. ej. Rocería solo-MO).
        ikey_fb = _item_key(cap or capitulo, itm)
        try:
            fb_map = costos_mo_desde_precios_pactados(client, contrato_id) or {}
            fb = fb_map.get(ikey_fb)
            if fb and _f(fb.get("costo_insumo_unitario") or fb.get("costo_insumo_linea")) > 0:
                return fb
            for k, v in fb_map.items():
                if _norm_item(str(k).partition("|")[2]) == itm and _f(
                    v.get("costo_insumo_unitario") or v.get("costo_insumo_linea")
                ) > 0:
                    return v
        except Exception:
            _log.exception("MO: fallback precios falló (contrato=%s item=%s)", contrato_id, itm)
        return empty

    ikey = _item_key(cap or capitulo, itm)
    desglose: List[dict] = []
    sum_costo = 0.0
    sum_cant = 0.0
    tiene = False

    for r in regs:
        try:
            sub_id = int(r["subcontratista_id"])
        except (TypeError, ValueError, KeyError):
            continue
        cant = _f(r.get("cantidad_total"))
        if cant <= 0:
            continue
        precio = _precio_fila(price_map, sub_id, ikey, r)
        if precio is None or precio <= 0:
            continue
        costo = round(cant * precio, 2)
        sum_costo += costo
        sum_cant += cant
        tiene = True
        desglose.append({
            "so_registro_id": r.get("id"),
            "subcontratista_id": sub_id,
            "pk_id_id": r.get("pk_id_id"),
            "capitulo": cap,
            "item_numero": itm,
            "cantidad_total": cant,
            "precio_unitario_sub": precio,
            "costo_linea": costo,
        })

    if not tiene:
        return empty

    return {
        "es_mo": True,
        "etiqueta_fila": "Mano de obra (subcontratistas)",
        "cantidad": round(sum_cant, 4) if sum_cant > 0 else None,
        "costo_insumo_unitario": round(sum_costo / sum_cant, 4) if sum_cant > 0 else None,
        "costo_insumo_linea": round(sum_costo, 2),
        "desglose": desglose,
    }


def calcular_costo_mo_por_items_contrato(
    contrato_id: int,
    *,
    sb=None,
) -> Dict[str, dict]:
    """
    Batch contrato: item_key → resumen MO consolidado (todos los PK-ID).
    """
    client = sb or _sb()
    precios = mapa_precios_pactados_sub(client, contrato_id)
    regs = _fetch_registros_mo_n2(client, contrato_id)
    by_item: Dict[str, dict] = {}

    for r in regs:
        try:
            sub_id = int(r["subcontratista_id"])
        except (TypeError, ValueError, KeyError):
            continue
        ikey = _item_key(r.get("capitulo"), r.get("item_numero"))
        _cap, _, _itm = ikey.partition("|")
        if not _itm:
            continue
        cant = _f(r.get("cantidad_total"))
        if cant <= 0:
            continue
        precio = _precio_fila(precios, sub_id, ikey, r)
        if precio is None or precio <= 0:
            continue
        costo = round(cant * precio, 2)
        bucket = by_item.get(ikey)
        if not bucket:
            bucket = {
                "es_mo": True,
                "etiqueta_fila": "Mano de obra (subcontratistas)",
                "cantidad": 0.0,
                "costo_insumo_unitario": None,
                "costo_insumo_linea": 0.0,
                "desglose": [],
            }
            by_item[ikey] = bucket
        bucket["cantidad"] = round(_f(bucket["cantidad"]) + cant, 4)
        bucket["costo_insumo_linea"] = round(_f(bucket["costo_insumo_linea"]) + costo, 2)
        bucket["desglose"].append({
            "so_registro_id": r.get("id"),
            "subcontratista_id": sub_id,
            "pk_id_id": r.get("pk_id_id"),
            "capitulo": _norm_cap(r.get("capitulo")),
            "item_numero": _norm_item(r.get("item_numero")),
            "cantidad_total": cant,
            "precio_unitario_sub": precio,
            "costo_linea": costo,
        })

    for bucket in by_item.values():
        if not bucket["cantidad"]:
            bucket["cantidad"] = None
        if not bucket["costo_insumo_linea"]:
            bucket["costo_insumo_linea"] = None
        cant = _f(bucket.get("cantidad"))
        costo = _f(bucket.get("costo_insumo_linea"))
        if cant > 0 and costo > 0:
            bucket["costo_insumo_unitario"] = round(costo / cant, 4)
        else:
            bucket["costo_insumo_unitario"] = None

    # Completar ítems sin ejecución N2 con VU pactado (Inventario / solo-MO).
    try:
        for ikey, mo in (costos_mo_desde_precios_pactados(client, contrato_id) or {}).items():
            existing = by_item.get(ikey)
            if existing and _f(existing.get("costo_insumo_linea")) > 0:
                continue
            by_item[ikey] = mo
    except Exception:
        _log.exception(
            "MO: no se pudo completar desde precios pactados (contrato=%s)",
            contrato_id,
        )

    return by_item


def fila_rentabilidad_mo(mo: dict, *, numero_oc=None, solicitud_id=None, solicitud_consecutivo=None) -> Optional[dict]:
    """Fila para TablaRentabilidadAcumulada (sin VU cobro/costo)."""
    if not mo or not mo.get("es_mo"):
        return None
    costo = mo.get("costo_insumo_linea")
    if costo is None or _f(costo) <= 0:
        return None
    return {
        "etiqueta_fila": mo.get("etiqueta_fila") or "Mano de obra (subcontratistas)",
        "numero_oc": numero_oc,
        "solicitud_id": solicitud_id,
        "solicitud_consecutivo": solicitud_consecutivo,
        "solicitud_item_id": None,
        "insumo_id": None,
        "es_principal": False,
        "es_mo": True,
        "es_actual": True,
        "es_total": False,
        "cantidad": mo.get("cantidad"),
        "valor_cobro_unitario": None,
        "valor_cobro_linea": None,
        "cobro_motivo": "mano_obra",
        "costo_insumo_unitario": None,
        "costo_insumo_linea": round(_f(costo), 2),
        "utilidad_estimada_linea": None,
        "rentabilidad_pct": None,
    }
