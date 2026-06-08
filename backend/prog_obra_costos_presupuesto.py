"""
Costos de programación según versión de presupuesto (capa de visualización).

Las fechas provienen de prog_actividades; los costos se recalculan en runtime
cruzando agrupadores programados con ítems de la versión de presupuesto seleccionada.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from presupuesto_constants import PRESUPUESTO_TIPO_POLIGONO
from prog_obra_service import _listado_agrupador_por_item

PAGE = 1000


def _round_money(v: float) -> float:
    return round(float(v), 2)


def _line_costo(row: dict) -> float:
    try:
        cd = float(row.get("costo_directo") or 0)
        if cd > 0:
            return cd
        cant = float(row.get("cant_total") or 0)
        vlr = float(row.get("vlr_unitario") or 0)
        return cant * vlr
    except (TypeError, ValueError):
        return 0.0


def fetch_ppto_borrador_version_id(sb, contrato_id: int) -> Optional[str]:
    """Versión con es_vigente=true (borrador activo en edición)."""
    rows = (
        sb.table("presupuesto_versiones")
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("es_vigente", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return str(rows[0]["id"]) if rows else None


def assert_ppto_version_contrato(sb, contrato_id: int, version_ppto_id: str) -> dict:
    rows = (
        sb.table("presupuesto_versiones")
        .select("*")
        .eq("id", str(version_ppto_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Versión de presupuesto no encontrada para este contrato")
    return rows[0]


def version_ppto_ui_estado(row: dict) -> str:
    """Etiqueta para selector: (vigente) | aprobado | borrador."""
    if bool(row.get("es_vigente_aprobada")):
        return "vigente"
    if bool(row.get("sellado")) or (row.get("estado") or "") == "aprobado_sellado":
        return "aprobado"
    return "borrador"


def version_ppto_es_aprobada(row: dict) -> bool:
    return bool(row.get("es_vigente_aprobada")) or bool(row.get("sellado"))


def fetch_ppto_items_version(
    sb,
    contrato_id: int,
    version_ppto_id: str,
    pk_id: Optional[str] = None,
) -> List[dict]:
    """Ítems poligonales de una versión de presupuesto (vivo si es_vigente, snapshot si no)."""
    vrow = assert_ppto_version_contrato(sb, contrato_id, version_ppto_id)
    es_vigente = bool(vrow.get("es_vigente"))
    tabla = "presupuesto" if es_vigente else "presupuesto_version_items"
    select = (
        "pk_id,capitulo,item,descripcion,und,cant_total,vlr_unitario,costo_directo"
    )
    rows: List[dict] = []
    offset = 0
    pk = (pk_id or "").strip() or None
    while True:
        q = (
            sb.table(tabla)
            .select(select)
            .eq("contrato_id", int(contrato_id))
            .eq("dado_de_baja", False)
        )
        if es_vigente:
            q = q.eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        else:
            q = q.eq("version_id", str(version_ppto_id))
        if pk:
            q = q.eq("pk_id", pk)
        batch = q.range(offset, offset + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def agrupadores_programados_set(
    sb,
    version_prog_id: str,
    contrato_id: int,
    pk_id: Optional[str] = None,
) -> Set[Tuple[str, str, int]]:
    """(pk_id, capitulo, agrupador_id) con fecha programada."""
    q = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,agrupador_id")
        .eq("version_id", str(version_prog_id))
        .eq("contrato_id", int(contrato_id))
        .not_.is_("fecha_inicio", "null")
        .not_.is_("agrupador_id", "null")
    )
    pk = (pk_id or "").strip()
    if pk:
        q = q.eq("pk_id", pk)
    rows = q.execute().data or []
    out: Set[Tuple[str, str, int]] = set()
    for r in rows:
        pk_v = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        if not pk_v or not cap or ag_raw is None:
            continue
        out.add((pk_v, cap, int(ag_raw)))
    return out


def _fetch_agrupadores_meta(sb, contrato_id: int) -> Dict[int, dict]:
    rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,codigo_wbs,nombre,orden")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    return {int(r["id"]): r for r in rows if r.get("id") is not None}


def _aggregate_items_por_agrupador(
    ppto_rows: List[dict],
    ag_by_item: Dict[Tuple[str, str], Optional[int]],
    desc_lp: Dict[Tuple[str, str], str],
) -> Tuple[
    Dict[Tuple[str, str, int], dict],
    Dict[Tuple[str, str, str], dict],
    List[dict],
]:
    """
    Agrupa ítems por (pk, cap, agrupador_id).
    Devuelve también mapa item suelto (pk, cap, item) y lista sin_agrupador.
    """
    ag_buckets: Dict[Tuple[str, str, int], dict] = {}
    item_map: Dict[Tuple[str, str, str], dict] = {}
    sin_ag: List[dict] = []

    for r in ppto_rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        cant = float(r.get("cant_total") or 0)
        vlr = float(r.get("vlr_unitario") or 0)
        subtotal = _line_costo(r)
        desc = (r.get("descripcion") or "").strip() or desc_lp.get((cap, it), "")
        item_obj = {
            "item": it,
            "descripcion": desc,
            "cantidad": round(cant, 4),
            "precio_unitario": round(vlr, 2),
            "subtotal": round(subtotal, 2),
        }
        item_key = (pk, cap, it)
        if item_key not in item_map:
            item_map[item_key] = {**item_obj, "cantidad": 0.0, "subtotal": 0.0}
        cur = item_map[item_key]
        cur["cantidad"] = round(cur["cantidad"] + cant, 4)
        cur["subtotal"] = round(cur["subtotal"] + subtotal, 2)

        ag_id = ag_by_item.get((cap, it))
        if ag_id is None:
            sin_ag.append({**item_obj, "capitulo": cap})
            continue
        ag_id_int = int(ag_id)
        ag_key = (pk, cap, ag_id_int)
        if ag_key not in ag_buckets:
            ag_buckets[ag_key] = {
                "agrupador_id": ag_id_int,
                "capitulo": cap,
                "pk_id": pk,
                "costo_directo": 0.0,
                "items": [],
            }
        bucket = ag_buckets[ag_key]
        bucket["items"].append(item_obj)
        bucket["costo_directo"] += subtotal

    for bucket in ag_buckets.values():
        bucket["costo_directo"] = _round_money(bucket["costo_directo"])
        bucket["items"].sort(key=lambda x: x["item"])

    sin_ag.sort(key=lambda x: (x.get("item") or ""))
    return ag_buckets, item_map, sin_ag


def compute_costos_por_version(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
    pk_id: Optional[str] = None,
    solo_programados: bool = False,
) -> dict:
    """Costos por agrupador WBS según versión de presupuesto."""
    vrow = assert_ppto_version_contrato(sb, contrato_id, version_ppto_id)
    ppto_rows = fetch_ppto_items_version(sb, contrato_id, version_ppto_id, pk_id=pk_id)
    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)
    ag_buckets, _, sin_ag = _aggregate_items_por_agrupador(ppto_rows, ag_by_item, desc_lp)
    programados = agrupadores_programados_set(sb, version_prog_id, contrato_id, pk_id=pk_id)

    agrupadores: List[dict] = []
    costo_total = 0.0
    for ag_key, bucket in sorted(ag_buckets.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        pk_v, cap, ag_id = ag_key
        programado = ag_key in programados
        if solo_programados and not programado:
            continue
        meta = ag_meta.get(ag_id) or {}
        costo = float(bucket["costo_directo"] or 0)
        costo_total += costo
        agrupadores.append(
            {
                "agrupador_id": ag_id,
                "codigo_wbs": (meta.get("codigo_wbs") or "").strip(),
                "nombre": (meta.get("nombre") or "").strip(),
                "capitulo": cap,
                "pk_id": pk_v,
                "programado": programado,
                "costo_directo": costo,
                "items": bucket["items"],
            }
        )

    sin_ag_costo = _round_money(sum(float(x.get("subtotal") or 0) for x in sin_ag))

    return {
        "version_prog_id": str(version_prog_id),
        "version_ppto_id": str(version_ppto_id),
        "version_ppto_numero": int(vrow.get("numero_version") or 0),
        "version_ppto_etiqueta": (vrow.get("etiqueta") or "").strip(),
        "es_vigente_aprobada": bool(vrow.get("es_vigente_aprobada")),
        "es_vigente": bool(vrow.get("es_vigente")),
        "estado_ui": version_ppto_ui_estado(vrow),
        "costo_directo_total": _round_money(costo_total),
        "agrupadores": agrupadores,
        "sin_agrupador": {
            "costo_directo": sin_ag_costo,
            "items": sin_ag,
        },
    }


def build_cost_overlay_maps(
    sb,
    contrato_id: int,
    version_ppto_id: str,
) -> Tuple[Dict[Tuple[str, str, int], float], Dict[Tuple[str, str, str], float]]:
    """Mapas de costo para overlay en nodos compare/curva S."""
    ppto_rows = fetch_ppto_items_version(sb, contrato_id, version_ppto_id, pk_id=None)
    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    ag_buckets, item_map, _ = _aggregate_items_por_agrupador(ppto_rows, ag_by_item, desc_lp)
    ag_costs = {k: float(v["costo_directo"] or 0) for k, v in ag_buckets.items()}
    item_costs = {k: float(v["subtotal"] or 0) for k, v in item_map.items()}
    return ag_costs, item_costs


def apply_ppto_cost_overlay(
    nodes: Dict[str, dict],
    ag_costs: Dict[Tuple[str, str, int], float],
    item_costs: Dict[Tuple[str, str, str], float],
) -> Dict[str, dict]:
    """Reemplaza costo_programado en nodos; fechas intactas."""
    out = dict(nodes)
    for nk, n in out.items():
        pk = str(n.get("pk_id") or "").strip()
        cap = str(n.get("capitulo") or "").strip()
        ag_raw = n.get("agrupador_id")
        if ag_raw is not None:
            key = (pk, cap, int(ag_raw))
            if key in ag_costs:
                n = {**n, "costo_programado": ag_costs[key]}
        else:
            label = str(n.get("label") or n.get("codigo_wbs") or "").strip()
            if label and not label.startswith("Capítulo"):
                item_key = (pk, cap, label)
                if item_key in item_costs:
                    n = {**n, "costo_programado": item_costs[item_key]}
        out[nk] = n
    return out


def costo_total_programado_version(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
) -> float:
    """Suma costos de agrupadores programados con precios de la versión indicada."""
    data = compute_costos_por_version(
        sb,
        contrato_id,
        version_prog_id,
        version_ppto_id,
        pk_id=None,
        solo_programados=True,
    )
    return float(data.get("costo_directo_total") or 0)
