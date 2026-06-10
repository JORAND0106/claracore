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

from prog_obra_service import (
    _listado_agrupador_por_item,
    _resolve_listado_agrupador_id,
    _resolve_listado_descripcion,
)

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


def resolve_ppto_vigente_version_id(
    sb,
    contrato_id: int,
    version_ppto_id: Optional[str] = None,
    *,
    force_vigente: bool = False,
) -> Optional[str]:
    """
    Resuelve la versión de presupuesto a usar en programación.
    force_vigente=True: siempre la versión es_vigente (fuente del módulo Presupuesto).
    """
    vig = fetch_ppto_borrador_version_id(sb, contrato_id)
    if force_vigente:
        return vig or ((version_ppto_id or "").strip() or None)
    vid = (version_ppto_id or "").strip()
    if vid:
        return vid
    return vig


def fetch_ppto_rows_programacion(
    sb,
    contrato_id: int,
    *,
    pk_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    version_ppto_id: Optional[str] = None,
    force_vigente: bool = True,
) -> List[dict]:
    """Ítems de presupuesto para WBS/sync: por defecto la versión vigente (es_vigente)."""
    vid = resolve_ppto_vigente_version_id(
        sb, contrato_id, version_ppto_id, force_vigente=force_vigente,
    )
    if vid:
        pk_set = None
        pk_one = (pk_id or "").strip()
        if pk_one:
            pk_set = {pk_one}
        elif pk_ids:
            pk_set = {str(p).strip() for p in pk_ids if str(p).strip()}
        return fetch_ppto_items_version(
            sb,
            contrato_id,
            vid,
            pk_id=pk_one or None,
            tramo=tramo,
            tramos=tramos,
            pk_ids=pk_set,
        )
    return []


def fetch_ppto_baseline_version_id(sb, contrato_id: int) -> Optional[str]:
    """Primera versión de presupuesto del contrato (menor numero_version; baseline contractual)."""
    rows = (
        sb.table("presupuesto_versiones")
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .order("numero_version")
        .order("creada_en")
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
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> List[dict]:
    """Ítems de una versión de presupuesto (misma fuente que el módulo Presupuesto)."""
    from presupuesto_versiones_service import _fetch_version_items_rows

    rows = _fetch_version_items_rows(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        select="pk_id,capitulo,item,descripcion,und,cant_total,vlr_unitario,costo_directo,tramo",
    )
    pk = (pk_id or "").strip()
    if pk:
        rows = [r for r in rows if str(r.get("pk_id") or "").strip() == pk]
    elif pk_ids:
        rows = [r for r in rows if str(r.get("pk_id") or "").strip() in pk_ids]
    return rows


def agrupadores_programados_set(
    sb,
    version_prog_id: str,
    contrato_id: int,
    pk_id: Optional[str] = None,
    pk_ids: Optional[Set[str]] = None,
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
        if pk_ids and pk_v not in pk_ids:
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
        desc = (r.get("descripcion") or "").strip() or _resolve_listado_descripcion(desc_lp, cap, it)
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

        ag_id = _resolve_listado_agrupador_id(ag_by_item, cap, it)
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
    pk_ids: Optional[Set[str]] = None,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    solo_programados: bool = False,
    *,
    force_vigente: bool = True,
) -> dict:
    """Costos por agrupador WBS según versión de presupuesto (vigente por defecto)."""
    vid = resolve_ppto_vigente_version_id(
        sb, contrato_id, version_ppto_id, force_vigente=force_vigente,
    )
    if not vid:
        raise HTTPException(status_code=404, detail="No hay versión de presupuesto vigente")
    vrow = assert_ppto_version_contrato(sb, contrato_id, vid)
    scope_pks = pk_ids
    if (pk_id or "").strip() and not scope_pks:
        scope_pks = {(pk_id or "").strip()}
    ppto_rows = fetch_ppto_items_version(
        sb,
        contrato_id,
        vid,
        pk_id=pk_id if not scope_pks else None,
        tramo=tramo,
        tramos=tramos,
        pk_ids=scope_pks,
    )
    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)
    ag_buckets, _, sin_ag = _aggregate_items_por_agrupador(ppto_rows, ag_by_item, desc_lp)
    programados = agrupadores_programados_set(
        sb, version_prog_id, contrato_id, pk_id=pk_id, pk_ids=scope_pks
    )

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
        "version_ppto_id": str(vid),
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
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[Tuple[str, str, int], float], Dict[Tuple[str, str, str], float]]:
    """Mapas de costo para overlay en nodos compare/curva S."""
    ppto_rows = fetch_ppto_items_version(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    ag_buckets, item_map, _ = _aggregate_items_por_agrupador(ppto_rows, ag_by_item, desc_lp)
    ag_costs = {k: float(v["costo_directo"] or 0) for k, v in ag_buckets.items()}
    item_costs = {k: float(v["subtotal"] or 0) for k, v in item_map.items()}
    return ag_costs, item_costs


def ppto_scope_direct_total(
    sb,
    contrato_id: int,
    version_ppto_id: str,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> float:
    """Costo directo total del alcance (misma fuente que comparación de presupuesto)."""
    rows = fetch_ppto_items_version(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    return _round_money(sum(_line_costo(r) for r in rows))


def _lookup_item_cost(
    item_costs: Dict[Tuple[str, str, str], float],
    pk: str,
    cap: str,
    item: Any,
) -> float:
    it = str(item or "").strip()
    if not it:
        return 0.0
    candidates = [it]
    bare = it.rstrip(".")
    if bare:
        candidates.extend([bare, f"{bare}."])
    seen: Set[str] = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        val = item_costs.get((pk, cap, c))
        if val is not None:
            return float(val)
    return 0.0


def build_programmed_item_cost_overlay_maps(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[Tuple[str, str, int], float], Dict[Tuple[str, str, str], float]]:
    """
    Costos por agrupador = suma de ítems del presupuesto en actividades programadas.
    Evita depender del mapeo WBS global cuando hay ítems contractuales sin fecha.
    """
    _, item_costs = build_cost_overlay_maps(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    q = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,agrupador_id,item,fecha_inicio")
        .eq("version_id", str(version_prog_id))
        .eq("contrato_id", int(contrato_id))
        .not_.is_("fecha_inicio", "null")
    )
    rows = q.execute().data or []
    ag_costs: Dict[Tuple[str, str, int], float] = defaultdict(float)
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        if not pk or not cap:
            continue
        if pk_ids and pk not in pk_ids:
            continue
        cost = _lookup_item_cost(item_costs, pk, cap, r.get("item"))
        if cost <= 0:
            continue
        if ag_raw is not None:
            key = (pk, cap, int(ag_raw))
            ag_costs[key] = _round_money(ag_costs[key] + cost)
    return dict(ag_costs), item_costs


def build_programmed_cost_overlay_maps(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[Dict[Tuple[str, str, int], float], Dict[Tuple[str, str, str], float]]:
    """Costos de presupuesto para agrupadores programados (misma lógica que panel costos)."""
    data = compute_costos_por_version(
        sb,
        contrato_id,
        version_prog_id,
        version_ppto_id,
        pk_ids=pk_ids,
        tramo=tramo,
        tramos=tramos,
        solo_programados=True,
    )
    ag_costs = {
        (str(a["pk_id"]).strip(), str(a["capitulo"]).strip(), int(a["agrupador_id"])): float(a["costo_directo"])
        for a in data["agrupadores"]
    }
    _, item_costs = build_cost_overlay_maps(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    return ag_costs, item_costs


def apply_ppto_cost_overlay(
    nodes: Dict[str, dict],
    ag_costs: Dict[Tuple[str, str, int], float],
    item_costs: Dict[Tuple[str, str, str], float],
    *,
    strict: bool = False,
) -> Dict[str, dict]:
    """Reemplaza costo_programado en nodos; fechas intactas."""
    out = dict(nodes)
    for nk, n in out.items():
        pk = str(n.get("pk_id") or "").strip()
        cap = str(n.get("capitulo") or "").strip()
        ag_raw = n.get("agrupador_id")
        if ag_raw is not None:
            key = (pk, cap, int(ag_raw))
            if strict or key in ag_costs:
                n = {**n, "costo_programado": ag_costs.get(key, 0.0)}
        else:
            label = str(n.get("label") or n.get("codigo_wbs") or "").strip()
            if label and not label.startswith("Capítulo"):
                item_key = (pk, cap, label)
                if strict or item_key in item_costs:
                    n = {**n, "costo_programado": item_costs.get(item_key, 0.0)}
        out[nk] = n
    return out


def costo_total_programado_version(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
    tramo: Optional[str] = None,
    tramos: Optional[List[str]] = None,
    pk_ids: Optional[Set[str]] = None,
) -> float:
    """Suma costos de agrupadores programados con precios de la versión indicada."""
    data = compute_costos_por_version(
        sb,
        contrato_id,
        version_prog_id,
        version_ppto_id,
        pk_ids=pk_ids,
        tramo=tramo,
        tramos=tramos,
        solo_programados=True,
    )
    return float(data.get("costo_directo_total") or 0)


MAX_BRECHA_DETALLE = 100


def build_brecha_presupuesto_programacion(
    sb,
    contrato_id: int,
    version_prog_id: str,
    version_ppto_id: str,
    pk_ids: Optional[Set[str]] = None,
    tramos: Optional[List[str]] = None,
    *,
    schedule_mode: str = "cpm",
) -> dict:
    """
    Compara presupuesto vigente (alcance) vs lo que entra en Curva S / cronograma con fechas.
    La diferencia suele deberse a agrupadores o ítems sin programación o sin fechas CPM.
    """
    from prog_obra_compare import _node_key, fetch_compare_nodes
    from prog_obra_pk_filter import filter_nodes_by_pk

    tramo = tramos[0] if tramos and len(tramos) == 1 else None
    ppto_rows = fetch_ppto_items_version(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    presupuesto_total = _round_money(sum(_line_costo(r) for r in ppto_rows))

    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    ag_buckets, item_map, _sin_ag = _aggregate_items_por_agrupador(ppto_rows, ag_by_item, desc_lp)
    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)

    act_rows = (
        sb.table("prog_actividades")
        .select("pk_id,capitulo,item")
        .eq("version_id", str(version_prog_id))
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    existing_acts: Set[Tuple[str, str, str]] = set()
    for r in act_rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        it = str(r.get("item") or "").strip()
        if not pk or not cap or not it:
            continue
        if pk_ids and pk not in pk_ids:
            continue
        existing_acts.add((pk, cap, it))

    items_nuevos_sin_actividad: List[dict] = []
    for (pk, cap, it), rec in sorted(item_map.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        if (pk, cap, it) in existing_acts:
            continue
        costo = _round_money(float(rec.get("subtotal") or 0))
        if costo <= 0:
            continue
        ag_raw = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        wbs = ""
        if ag_raw is not None:
            meta = ag_meta.get(int(ag_raw)) or {}
            wbs = str(meta.get("codigo_wbs") or "").strip()
        items_nuevos_sin_actividad.append(
            {
                "pk_id": pk,
                "capitulo": cap,
                "item": it,
                "descripcion": str(rec.get("descripcion") or _resolve_listado_descripcion(desc_lp, cap, it)).strip(),
                "codigo_wbs": wbs,
                "costo_directo": costo,
                "motivo": "nuevo_en_presupuesto_sin_fila_programacion",
            }
        )

    nodes = fetch_compare_nodes(sb, version_prog_id, contrato_id, schedule_mode=schedule_mode)
    nodes = filter_nodes_by_pk(nodes, pk_ids)
    ag_costs, item_costs = build_cost_overlay_maps(
        sb,
        contrato_id,
        version_ppto_id,
        tramo=tramo,
        tramos=tramos,
        pk_ids=pk_ids,
    )
    nodes = apply_ppto_cost_overlay(nodes, ag_costs, item_costs)

    programado_total = 0.0
    agrupadores_sin_programar: List[dict] = []
    agrupadores_sin_fecha: List[dict] = []
    items_sin_programar: List[dict] = []

    for (pk, cap, ag_id), bucket in sorted(ag_buckets.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        costo = _round_money(float(bucket.get("costo_directo") or 0))
        if costo <= 0:
            continue
        meta = ag_meta.get(int(ag_id)) or {}
        wbs = str(meta.get("codigo_wbs") or f"AG{ag_id}").strip()
        nombre = str(meta.get("nombre") or wbs).strip()
        nk = _node_key(pk, cap, agrupador_id=int(ag_id))
        n = nodes.get(nk)
        entry = {
            "pk_id": pk,
            "capitulo": cap,
            "agrupador_id": int(ag_id),
            "codigo_wbs": wbs,
            "nombre": nombre,
            "costo_directo": costo,
        }
        if not n:
            agrupadores_sin_programar.append(entry)
            continue
        fi, ff = n.get("fecha_inicio"), n.get("fecha_fin")
        if not fi or not ff:
            agrupadores_sin_fecha.append({**entry, "motivo": "sin_fecha_cpm" if schedule_mode == "cpm" else "sin_fecha"})
            continue
        programado_total += costo

    for (pk, cap, it), rec in sorted(item_map.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        if _resolve_listado_agrupador_id(ag_by_item, cap, it) is not None:
            continue
        costo = _round_money(float(rec.get("subtotal") or 0))
        if costo <= 0:
            continue
        nk = _node_key(pk, cap, item=it)
        n = nodes.get(nk)
        if n and n.get("fecha_inicio") and n.get("fecha_fin"):
            programado_total += costo
            continue
        items_sin_programar.append(
            {
                "pk_id": pk,
                "capitulo": cap,
                "item": it,
                "descripcion": str(rec.get("descripcion") or desc_lp.get((cap, it), "")).strip(),
                "costo_directo": costo,
                "motivo": "sin_fecha" if n else "sin_actividad",
            }
        )

    programado_total = _round_money(programado_total)
    diferencia = _round_money(presupuesto_total - programado_total)

    def _cap(lst: List[dict]) -> Tuple[List[dict], bool]:
        if len(lst) <= MAX_BRECHA_DETALLE:
            return lst, False
        return lst[:MAX_BRECHA_DETALLE], True

    ag_sp, ag_sp_trunc = _cap(agrupadores_sin_programar)
    ag_sf, ag_sf_trunc = _cap(agrupadores_sin_fecha)
    it_sp, it_sp_trunc = _cap(items_sin_programar)
    nuevos_sp, nuevos_trunc = _cap(items_nuevos_sin_actividad)

    n_nuevos = len(items_nuevos_sin_actividad)
    return {
        "presupuesto_total": presupuesto_total,
        "programado_total": programado_total,
        "diferencia": diferencia,
        "tiene_brecha": abs(diferencia) > 0.01,
        "mensaje": (
            (
                f"Diferencia de ${_round_money(diferencia):,.0f} frente al presupuesto vigente. "
                f"{n_nuevos} ítem(s) del presupuesto sin fila en programación; "
                f"{len(agrupadores_sin_programar)} agrupador(es) sin actividad; "
                f"{len(agrupadores_sin_fecha)} sin fecha CPM. "
                "Programe ítems en el WBS; use «Sincronizar» solo para actualizar costos de lo ya programado."
            )
            if abs(diferencia) > 0.01
            else "El presupuesto vigente del alcance coincide con lo programado en el cronograma."
        ),
        "agrupadores_sin_programar": ag_sp,
        "agrupadores_sin_fecha": ag_sf,
        "items_sin_agrupador_sin_programar": it_sp,
        "items_nuevos_sin_actividad": nuevos_sp,
        "resumen": {
            "n_agrupadores_sin_programar": len(agrupadores_sin_programar),
            "n_agrupadores_sin_fecha": len(agrupadores_sin_fecha),
            "n_items_sin_programar": len(items_sin_programar),
            "n_items_nuevos_sin_actividad": n_nuevos,
            "detalle_truncado": ag_sp_trunc or ag_sf_trunc or it_sp_trunc or nuevos_trunc,
        },
    }
