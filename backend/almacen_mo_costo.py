"""
Costo de mano de obra de subcontratistas para rentabilidad Almacén.

Solo LECTURA de SICOE Obra / Subcontratistas (no modifica esos módulos).
Fuente: so_registros validados Nivel 2, objeto de cobro/pago al sub,
con precio pactado en subcontratista_precios (sin promediar precios).
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


def mapa_precios_pactados_sub(sb, contrato_id: int) -> Dict[Tuple[int, str], float]:
    """
    (subcontratista_id, item_key) → precio_unitario_sub.
    item_key = capitulo|item_numero normalizados vía listado_precios.
    """
    out: Dict[Tuple[int, str], float] = {}
    try:
        rows = (
            sb.table("subcontratista_precios")
            .select(
                "subcontratista_id, precio_unitario_sub, "
                "listado_precios(capitulo, item_numero)"
            )
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
    except Exception:
        _log.exception("MO: no se pudieron leer subcontratista_precios (contrato=%s)", contrato_id)
        return out

    for r in rows:
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
