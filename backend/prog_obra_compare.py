"""
Fase 3B — Comparación baseline vs target y desviaciones de programación de obra.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from prog_obra_service import BusinessRuleError, fetch_baseline_version_id, fetch_borrador_activo, fetch_pks_con_ruta_critica, fetch_vigente_meta

TIPOS_CAMBIO = frozenset({"adelantado", "atrasado", "duracion", "nuevo", "eliminado", "sin_cambio"})
PRIORIDAD_TIPO = {
    "atrasado": 5,
    "adelantado": 4,
    "duracion": 3,
    "nuevo": 2,
    "eliminado": 2,
    "sin_cambio": 0,
}


def _parse_date(val: Any) -> Optional[date]:
    if val is None:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()[:10]
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def _node_key(pk: str, cap: str, agrupador_id: Optional[int] = None, item: Optional[str] = None) -> str:
    pk_s = str(pk or "").strip()
    cap_s = str(cap or "").strip()
    if agrupador_id is not None:
        return f"{pk_s}\u0000{cap_s}\u0000ag:{int(agrupador_id)}"
    it = str(item or "").strip()
    if it:
        return f"{pk_s}\u0000{cap_s}\u0000item:{it}"
    return f"{pk_s}\u0000{cap_s}\u0000cap"


def _side_payload(
    fecha_inicio: Optional[date],
    fecha_fin: Optional[date],
    duracion: Optional[int],
    costo: float,
) -> Optional[dict]:
    if fecha_inicio is None and fecha_fin is None and duracion is None and costo <= 0:
        return None
    return {
        "fecha_inicio": fecha_inicio.isoformat() if fecha_inicio else None,
        "fecha_fin": fecha_fin.isoformat() if fecha_fin else None,
        "duracion_dias_habiles": duracion,
        "costo_programado": round(costo, 2),
    }


def _costo_actividad(row: dict) -> float:
    try:
        cant = float(row.get("cantidad_programada") or 0)
        cu = float(row.get("costo_unitario") or 0)
        return cant * cu
    except (TypeError, ValueError):
        return 0.0


def _fetch_version_row(sb, version_id: str, contrato_id: int) -> dict:
    rows = (
        sb.table("prog_versiones")
        .select("id,contrato_id,numero_version,tipo,estado,sellado_en")
        .eq("id", version_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows or int(rows[0].get("contrato_id") or 0) != int(contrato_id):
        raise HTTPException(status_code=404, detail="Version no encontrada")
    return rows[0]


def resolve_compare_versions(
    sb,
    contrato_id: int,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
) -> Tuple[str, str, dict, dict]:
    """Resuelve baseline y target; devuelve (baseline_id, target_id, meta_baseline, meta_target)."""
    bid = (baseline_id or fetch_baseline_version_id(sb, contrato_id) or "").strip()
    if not bid:
        raise HTTPException(status_code=404, detail="No hay baseline sellada para comparar")

    tid = (target_id or "").strip()
    if not tid:
        borrador = fetch_borrador_activo(sb, contrato_id)
        if borrador and borrador.get("id"):
            tid = str(borrador["id"])
        else:
            vid, _ = fetch_vigente_meta(sb, contrato_id)
            tid = str(vid) if vid else ""

    if not tid:
        raise HTTPException(status_code=404, detail="No hay version target (borrador o vigente) para comparar")

    if bid == tid:
        raise HTTPException(status_code=400, detail="baseline_id y target_id deben ser distintos")

    meta_b = _fetch_version_row(sb, bid, contrato_id)
    meta_t = _fetch_version_row(sb, tid, contrato_id)

    if (meta_b.get("estado") or "") not in ("sellada", "archivada"):
        raise BusinessRuleError("La version baseline debe estar sellada o archivada")

    if (meta_t.get("estado") or "") not in ("borrador", "sellada", "archivada", "en_validacion"):
        raise BusinessRuleError("Estado de version target no valido para comparacion")

    return bid, tid, meta_b, meta_t


def _effective_schedule_programada(row: dict) -> Tuple[Optional[date], Optional[date]]:
    """Plan original (sin CPM): solo fecha_inicio / fecha_fin_calculada."""
    fi = _parse_date(row.get("fecha_inicio"))
    ff = _parse_date(row.get("fecha_fin_calculada"))
    return fi, ff


def _effective_schedule_cpm(row: dict) -> Tuple[Optional[date], Optional[date]]:
    """
    Programación vigente post-CPM (como el Gantt con CPM aplicado).
    Si hay par temprano completo, gana sobre fechas programadas antiguas.
    """
    fi_t = _parse_date(row.get("fecha_inicio_temprana"))
    ff_t = _parse_date(row.get("fecha_fin_temprana"))
    if fi_t and ff_t:
        return fi_t, ff_t
    fi = _parse_date(row.get("fecha_inicio"))
    ff = _parse_date(row.get("fecha_fin_calculada"))
    if fi and ff:
        return fi, ff
    return fi or fi_t, ff or ff_t


def _effective_schedule(row: dict, *, schedule_mode: str = "cpm") -> Tuple[Optional[date], Optional[date]]:
    if schedule_mode == "programada":
        return _effective_schedule_programada(row)
    return _effective_schedule_cpm(row)


def _effective_fecha_inicio(row: dict, *, schedule_mode: str = "cpm") -> Optional[date]:
    return _effective_schedule(row, schedule_mode=schedule_mode)[0]


def _effective_fecha_fin(row: dict, *, schedule_mode: str = "cpm") -> Optional[date]:
    return _effective_schedule(row, schedule_mode=schedule_mode)[1]


def _capitulo_date_envelope(nodes: Dict[str, dict]) -> Dict[str, Tuple[date, date]]:
    """Envolvente min/max por capítulo a partir de nodos con fechas."""
    cap_env: Dict[str, Tuple[date, date]] = {}
    for n in nodes.values():
        cap = str(n.get("capitulo") or "").strip()
        fi = n.get("fecha_inicio")
        ff = n.get("fecha_fin")
        if not cap or not fi or not ff:
            continue
        if not isinstance(fi, date):
            fi = _parse_date(fi)
        if not isinstance(ff, date):
            ff = _parse_date(ff)
        if not fi or not ff:
            continue
        prev = cap_env.get(cap)
        if prev is None:
            cap_env[cap] = (fi, ff)
        else:
            cap_env[cap] = (min(prev[0], fi), max(prev[1], ff))
    return cap_env


def supplement_nodes_missing_presupuesto(
    nodes: Dict[str, dict],
    ag_costs: Dict[Tuple[str, str, int], float],
    ag_meta: Optional[Dict[int, dict]] = None,
) -> Dict[str, dict]:
    """
    Agrupadores del presupuesto baseline (p. ej. 2.E en V0) sin fila en prog_actividades.
    Usa la envolvente de fechas del capítulo para distribuir costo en la Curva S.
    """
    if not ag_costs:
        return nodes

    existing = {
        (str(n.get("pk_id") or "").strip(), str(n.get("capitulo") or "").strip(), int(n["agrupador_id"]))
        for n in nodes.values()
        if n.get("agrupador_id") is not None
    }
    cap_env = _capitulo_date_envelope(nodes)
    meta = ag_meta or {}
    out = dict(nodes)

    for (pk, cap, ag_id), cost in ag_costs.items():
        if float(cost or 0) <= 0:
            continue
        sig = (str(pk).strip(), str(cap).strip(), int(ag_id))
        if sig in existing:
            continue
        env = cap_env.get(sig[1])
        if not env:
            continue
        fi, ff = env
        m = meta.get(int(ag_id)) or {}
        wbs = str(m.get("codigo_wbs") or f"AG{ag_id}").strip()
        nk = _node_key(sig[0], sig[1], agrupador_id=int(ag_id))
        if nk in out:
            continue
        out[nk] = {
            "pk_id": sig[0],
            "capitulo": sig[1],
            "agrupador_id": int(ag_id),
            "codigo_wbs": wbs,
            "label": wbs,
            "fecha_inicio": fi,
            "fecha_fin": ff,
            "duracion_dias_habiles": None,
            "costo_programado": round(float(cost), 2),
        }
    return out


def fetch_compare_nodes(
    sb,
    version_id: str,
    contrato_id: int,
    *,
    schedule_mode: str = "cpm",
) -> Dict[str, dict]:
    """
    Nodos comparables indexados por node_key.
    Prioridad WBS: agrupadores; fallback ítems sueltos y capítulo.
    """
    nodes: Dict[str, dict] = {}

    act_rows = (
        sb.table("prog_actividades")
        .select(
            "pk_id,capitulo,item,fecha_inicio,fecha_fin_calculada,duracion_dias_habiles,"
            "fecha_inicio_temprana,fecha_fin_temprana,"
            "cantidad_programada,costo_unitario,agrupador_id,codigo_wbs,override_manual"
        )
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )

    ag_candidates: Dict[Tuple[str, str, int], dict] = {}
    for r in act_rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        ag_raw = r.get("agrupador_id")
        if not pk or not cap or ag_raw is None:
            continue
        ag_id = int(ag_raw)
        key_tuple = (pk, cap, ag_id)
        fi = _effective_fecha_inicio(r, schedule_mode=schedule_mode)
        if not fi:
            continue
        item = str(r.get("item") or "").strip()
        wbs = str(r.get("codigo_wbs") or item or "").strip()
        prev = ag_candidates.get(key_tuple)
        if prev is None:
            ag_candidates[key_tuple] = r
            continue
        prev_wbs = str(prev.get("codigo_wbs") or prev.get("item") or "").strip()
        if item == wbs and prev_wbs != wbs:
            ag_candidates[key_tuple] = r
        elif bool(r.get("override_manual")) and not bool(prev.get("override_manual")):
            ag_candidates[key_tuple] = r

    for (pk, cap, ag_id), r in ag_candidates.items():
        fi = _effective_fecha_inicio(r, schedule_mode=schedule_mode)
        ff = _effective_fecha_fin(r, schedule_mode=schedule_mode)
        dur = r.get("duracion_dias_habiles")
        dur_i = int(dur) if dur is not None else None
        wbs = str(r.get("codigo_wbs") or r.get("item") or f"AG{ag_id}").strip()
        nk = _node_key(pk, cap, agrupador_id=ag_id)
        nodes[nk] = {
            "pk_id": pk,
            "capitulo": cap,
            "agrupador_id": ag_id,
            "codigo_wbs": wbs,
            "label": wbs,
            "fecha_inicio": fi,
            "fecha_fin": ff,
            "duracion_dias_habiles": dur_i,
            "costo_programado": _costo_actividad(r),
        }

    caps_con_ag: Set[Tuple[str, str]] = {(pk, cap) for pk, cap, _ in ag_candidates}

    for r in act_rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        if not pk or not cap or r.get("agrupador_id") is not None:
            continue
        if (pk, cap) in caps_con_ag:
            continue
        fi = _effective_fecha_inicio(r, schedule_mode=schedule_mode)
        if not fi:
            continue
        item = str(r.get("item") or "").strip()
        if not item:
            continue
        nk = _node_key(pk, cap, item=item)
        if nk in nodes:
            continue
        ff = _effective_fecha_fin(r, schedule_mode=schedule_mode)
        dur = r.get("duracion_dias_habiles")
        nodes[nk] = {
            "pk_id": pk,
            "capitulo": cap,
            "agrupador_id": None,
            "codigo_wbs": item,
            "label": item,
            "fecha_inicio": fi,
            "fecha_fin": ff,
            "duracion_dias_habiles": int(dur) if dur is not None else None,
            "costo_programado": _costo_actividad(r),
        }

    cap_rows = (
        sb.table("prog_actividades_capitulo")
        .select("pk_id,capitulo,fecha_inicio_sugerida,duracion_dias_habiles")
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    for r in cap_rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        if not pk or not cap or (pk, cap) in caps_con_ag:
            continue
        fi = _parse_date(r.get("fecha_inicio_sugerida"))
        if not fi:
            continue
        nk = _node_key(pk, cap)
        if nk in nodes:
            continue
        dur = r.get("duracion_dias_habiles")
        dur_i = int(dur) if dur is not None else None
        ff = None
        nodes[nk] = {
            "pk_id": pk,
            "capitulo": cap,
            "agrupador_id": None,
            "codigo_wbs": None,
            "label": f"Capítulo {cap}",
            "fecha_inicio": fi,
            "fecha_fin": None,
            "duracion_dias_habiles": dur_i,
            "costo_programado": 0.0,
        }

    return nodes


def _fetch_cpm_critico_map(sb, version_id: str) -> Dict[str, bool]:
    rows = (
        sb.table("prog_cpm_resultados")
        .select("pk_id,capitulo,agrupador_id,es_ruta_critica")
        .eq("version_id", version_id)
        .eq("es_ruta_critica", True)
        .execute()
        .data
        or []
    )
    out: Dict[str, bool] = {}
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        cap = str(r.get("capitulo") or "").strip()
        ag = r.get("agrupador_id")
        if ag is not None:
            nk = _node_key(pk, cap, agrupador_id=int(ag))
        else:
            nk = _node_key(pk, cap)
        out[nk] = True
    return out


def _delta_days(a: Optional[date], b: Optional[date]) -> Optional[int]:
    if a is None or b is None:
        return None
    return (b - a).days


def classify_tipo_cambio(
    baseline: Optional[dict],
    target: Optional[dict],
    delta_fin: Optional[int],
    delta_duracion: Optional[int],
) -> str:
    if baseline is None and target is not None:
        return "nuevo"
    if baseline is not None and target is None:
        return "eliminado"
    if delta_fin is not None:
        if delta_fin > 0:
            return "atrasado"
        if delta_fin < 0:
            return "adelantado"
    if delta_duracion is not None and delta_duracion != 0:
        return "duracion"
    return "sin_cambio"


def _project_span(nodes: Dict[str, dict]) -> Tuple[Optional[date], Optional[date], int]:
    min_fi: Optional[date] = None
    max_ff: Optional[date] = None
    for n in nodes.values():
        fi = n.get("fecha_inicio")
        ff = n.get("fecha_fin")
        if fi and (min_fi is None or fi < min_fi):
            min_fi = fi
        if ff and (max_ff is None or ff > max_ff):
            max_ff = ff
    dur = 0
    if min_fi and max_ff and max_ff >= min_fi:
        dur = (max_ff - min_fi).days
    return min_fi, max_ff, dur


def _pct_desviacion(abs_delta: float, base: float) -> float:
    if base <= 0:
        return 0.0 if abs_delta == 0 else 100.0
    return round(abs(abs_delta) / base * 100, 1)


def _alerta_fechas(delta_fin_dias: int, pct_fechas: float, umbral_pct: float, duracion_baseline: int) -> bool:
    umbral_dias = max(1, round(umbral_pct / 100 * duracion_baseline)) if duracion_baseline > 0 else 1
    return pct_fechas >= umbral_pct or abs(delta_fin_dias) >= umbral_dias


def _label_fechas(delta_fin_dias: int, pct_fechas: float) -> str:
    sign = "+" if delta_fin_dias > 0 else ""
    return f"{sign}{delta_fin_dias} días · {pct_fechas:.1f}% de desviación"


def _version_meta_out(row: dict) -> dict:
    return {
        "id": str(row.get("id")),
        "numero_version": row.get("numero_version"),
        "tipo": row.get("tipo"),
        "estado": row.get("estado"),
        "sellado_en": row.get("sellado_en"),
    }


def _fetch_all_pk_ids(sb, contrato_id: int) -> List[str]:
    rows = (
        sb.table("pk_ids")
        .select("pk_id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    out = sorted({str(r.get("pk_id") or "").strip() for r in rows if r.get("pk_id")})
    if out:
        return out
    rows2 = (
        sb.table("presupuesto")
        .select("pk_id")
        .eq("contrato_id", contrato_id)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    return sorted({str(r.get("pk_id") or "").strip() for r in rows2 if r.get("pk_id")})


def _estado_pk_resumen(tipos: List[str], tiene_target: bool) -> str:
    if not tiene_target:
        return "sin_programar"
    if not tipos:
        return "sin_programar"
    if all(t == "sin_cambio" for t in tipos):
        return "sin_cambio"
    peor = _peor_tipo([t for t in tipos if t != "sin_cambio"])
    if peor == "adelantado":
        return "adelantado"
    if peor == "atrasado":
        return "atrasado"
    if peor == "nuevo":
        return "nuevo"
    if peor == "eliminado":
        return "eliminado"
    return peor or "sin_cambio"


def compute_resumen_global_pks(
    nodos: List[dict],
    all_pk_ids: List[str],
    base_nodes: Dict[str, dict],
    tgt_nodes: Dict[str, dict],
) -> dict:
    """Resumen por PK para vista comparación global (Fase 3C-1)."""
    by_pk: Dict[str, List[dict]] = defaultdict(list)
    for n in nodos or []:
        pk = str(n.get("pk_id") or "").strip()
        if pk:
            by_pk[pk].append(n)

    pks_con_target = {str(v.get("pk_id") or "").strip() for v in tgt_nodes.values() if v.get("pk_id")}

    grupos: List[dict] = []
    counts = {"adelantado": 0, "atrasado": 0, "sin_cambio": 0, "sin_programar": 0, "nuevo": 0, "eliminado": 0}

    pk_list = sorted(set(all_pk_ids) | set(by_pk.keys()) | pks_con_target)
    for pk in pk_list:
        if not pk:
            continue
        nodos_pk = by_pk.get(pk, [])
        tipos = [n.get("tipo_cambio") or "sin_cambio" for n in nodos_pk]
        tiene_target = pk in pks_con_target or any(n.get("target") for n in nodos_pk)
        estado = _estado_pk_resumen(tipos, tiene_target)
        counts[estado] = counts.get(estado, 0) + 1

        deltas_fin = [abs(int(n.get("delta", {}).get("dias_fin") or 0)) for n in nodos_pk if n.get("delta", {}).get("dias_fin") is not None]
        delta_max = max(deltas_fin) if deltas_fin else 0
        delta_fin_vals = [int(n.get("delta", {}).get("dias_fin") or 0) for n in nodos_pk if n.get("delta", {}).get("dias_fin") is not None]
        delta_fin_pk = max(delta_fin_vals, key=abs) if delta_fin_vals else 0
        delta_costo = sum(float(n.get("delta", {}).get("costo") or 0) for n in nodos_pk)

        b_min, b_max, _ = _span_for_pk(base_nodes, pk)
        t_min, t_max, _ = _span_for_pk(tgt_nodes, pk)

        grupos.append(
            {
                "pk_id": pk,
                "estado_pk": estado,
                "delta_fin_max_abs": delta_max,
                "delta_fin_pk": delta_fin_pk,
                "delta_costo_total": round(delta_costo, 2),
                "fin_baseline": b_max.isoformat() if b_max else None,
                "fin_actual": t_max.isoformat() if t_max else None,
                "inicio_baseline": b_min.isoformat() if b_min else None,
                "inicio_actual": t_min.isoformat() if t_min else None,
                "nodos_count": len(nodos_pk),
            }
        )

    grupos.sort(key=lambda g: (-abs(int(g.get("delta_fin_pk") or 0)), str(g.get("pk_id") or "")))

    return {
        "pks_adelantados": counts.get("adelantado", 0),
        "pks_atrasados": counts.get("atrasado", 0),
        "pks_sin_cambio": counts.get("sin_cambio", 0),
        "pks_sin_programar": counts.get("sin_programar", 0),
        "pks_nuevos": counts.get("nuevo", 0),
        "pks_eliminados": counts.get("eliminado", 0),
        "grupos_pk": grupos,
    }


def compare_versions(
    sb,
    contrato_id: int,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
    pk_id: Optional[str] = None,
    solo_cambios: bool = False,
) -> dict:
    bid, tid, meta_b, meta_t = resolve_compare_versions(sb, contrato_id, baseline_id, target_id)
    base_nodes = fetch_compare_nodes(sb, bid, contrato_id)
    tgt_nodes = fetch_compare_nodes(sb, tid, contrato_id)
    critico_map = _fetch_cpm_critico_map(sb, tid)

    all_keys = set(base_nodes.keys()) | set(tgt_nodes.keys())
    if pk_id:
        pk_f = str(pk_id).strip()
        all_keys = {k for k in all_keys if k.split("\u0000", 1)[0] == pk_f}

    nodos_out: List[dict] = []
    counts = {t: 0 for t in TIPOS_CAMBIO}

    for nk in sorted(all_keys):
        b = base_nodes.get(nk)
        t = tgt_nodes.get(nk)
        ref = t or b or {}
        b_fi, b_ff = (b or {}).get("fecha_inicio"), (b or {}).get("fecha_fin")
        t_fi, t_ff = (t or {}).get("fecha_inicio"), (t or {}).get("fecha_fin")
        b_dur = (b or {}).get("duracion_dias_habiles")
        t_dur = (t or {}).get("duracion_dias_habiles")
        b_cost = float((b or {}).get("costo_programado") or 0)
        t_cost = float((t or {}).get("costo_programado") or 0)

        delta_ini = _delta_days(b_fi, t_fi)
        delta_fin = _delta_days(b_ff, t_ff)
        delta_dur = None
        if b_dur is not None and t_dur is not None:
            delta_dur = int(t_dur) - int(b_dur)

        tipo = classify_tipo_cambio(b, t, delta_fin, delta_dur)
        counts[tipo] = counts.get(tipo, 0) + 1

        if solo_cambios and tipo == "sin_cambio":
            continue

        nodos_out.append(
            {
                "pk_id": ref.get("pk_id"),
                "capitulo": ref.get("capitulo"),
                "agrupador_id": ref.get("agrupador_id"),
                "codigo_wbs": ref.get("codigo_wbs"),
                "label": ref.get("label"),
                "es_ruta_critica_target": bool(critico_map.get(nk)),
                "baseline": _side_payload(b_fi, b_ff, b_dur, b_cost),
                "target": _side_payload(t_fi, t_ff, t_dur, t_cost),
                "delta": {
                    "dias_inicio": delta_ini,
                    "dias_fin": delta_fin,
                    "duracion": delta_dur,
                    "costo": round(t_cost - b_cost, 2),
                },
                "tipo_cambio": tipo,
            }
        )

    b_min, b_max, b_dur_span = _project_span(base_nodes)
    t_min, t_max, _t_span = _project_span(tgt_nodes)
    delta_fin_proj = _delta_days(b_max, t_max) or 0
    pct_fechas = _pct_desviacion(float(delta_fin_proj), float(b_dur_span) if b_dur_span else 0.0)

    b_cost_total = sum(float(n.get("costo_programado") or 0) for n in base_nodes.values())
    t_cost_total = sum(float(n.get("costo_programado") or 0) for n in tgt_nodes.values())
    delta_costo = t_cost_total - b_cost_total
    pct_costo = _pct_desviacion(delta_costo, b_cost_total)

    resumen_out = {
        "nodos_total": len(all_keys),
        "nodos_adelantados": counts.get("adelantado", 0),
        "nodos_atrasados": counts.get("atrasado", 0),
        "nodos_duracion": counts.get("duracion", 0),
        "nodos_nuevos": counts.get("nuevo", 0),
        "nodos_eliminados": counts.get("eliminado", 0),
        "fin_proyecto_baseline": b_max.isoformat() if b_max else None,
        "fin_proyecto_target": t_max.isoformat() if t_max else None,
        "inicio_proyecto_baseline": b_min.isoformat() if b_min else None,
        "inicio_proyecto_target": t_min.isoformat() if t_min else None,
        "delta_fin_proyecto_dias": delta_fin_proj,
        "duracion_baseline_dias": b_dur_span,
        "pct_desviacion_fechas": pct_fechas,
        "costo_total_baseline": round(b_cost_total, 2),
        "costo_total_target": round(t_cost_total, 2),
        "delta_costo_total": round(delta_costo, 2),
        "pct_desviacion_costo": pct_costo,
    }

    out = {
        "baseline": _version_meta_out(meta_b),
        "target": _version_meta_out(meta_t),
        "resumen": resumen_out,
        "nodos": nodos_out,
    }
    if not pk_id:
        all_pks = _fetch_all_pk_ids(sb, contrato_id)
        out["resumen_global"] = compute_resumen_global_pks(nodos_out, all_pks, base_nodes, tgt_nodes)
    return out


def _span_for_pk(nodes: Dict[str, dict], pk: str) -> Tuple[Optional[date], Optional[date], int]:
    filtered = {k: v for k, v in nodes.items() if v.get("pk_id") == pk}
    return _project_span(filtered)


def _peor_tipo(tipos: List[str]) -> Optional[str]:
    if not tipos:
        return None
    return max(tipos, key=lambda t: PRIORIDAD_TIPO.get(t, 0))


def compute_desviaciones(
    sb,
    contrato_id: int,
    baseline_id: Optional[str] = None,
    target_id: Optional[str] = None,
) -> dict:
    cmp_data = compare_versions(sb, contrato_id, baseline_id, target_id)
    bid = cmp_data["baseline"]["id"]
    tid = cmp_data["target"]["id"]
    resumen = cmp_data["resumen"]

    crows = (
        sb.table("contratos")
        .select("prog_umbral_desviacion_fechas_pct,prog_umbral_desviacion_costo_pct")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    umb_f = float(crows[0].get("prog_umbral_desviacion_fechas_pct") or 10) if crows else 10.0
    umb_c = float(crows[0].get("prog_umbral_desviacion_costo_pct") or 10) if crows else 10.0

    delta_fin = int(resumen.get("delta_fin_proyecto_dias") or 0)
    dur_b = int(resumen.get("duracion_baseline_dias") or 0)
    pct_f = float(resumen.get("pct_desviacion_fechas") or 0)
    pct_c = float(resumen.get("pct_desviacion_costo") or 0)

    alerta_f = _alerta_fechas(delta_fin, pct_f, umb_f, dur_b)
    alerta_c = pct_c >= umb_c

    contrato_out = {
        "delta_fin_dias": delta_fin,
        "pct_desviacion_fechas": pct_f,
        "pct_desviacion_costo": pct_c,
        "alerta_fechas": alerta_f,
        "alerta_costo": alerta_c,
        "alerta": alerta_f or alerta_c,
        "label_fechas": _label_fechas(delta_fin, pct_f),
    }

    base_nodes = fetch_compare_nodes(sb, bid, contrato_id)
    tgt_nodes = fetch_compare_nodes(sb, tid, contrato_id)
    critico_pks = fetch_pks_con_ruta_critica(sb, tid)

    pk_ids = sorted({n.get("pk_id") for n in cmp_data["nodos"] if n.get("pk_id")})
    if not pk_ids:
        pk_ids = sorted(
            {str(r.get("pk_id") or "").strip() for r in (sb.table("pk_ids").select("pk_id").eq("contrato_id", contrato_id).execute().data or []) if r.get("pk_id")}
        )

    pks_out: List[dict] = []
    for pk in pk_ids:
        if not pk:
            continue
        b_min, b_max, b_dur = _span_for_pk(base_nodes, pk)
        t_min, t_max, _ = _span_for_pk(tgt_nodes, pk)
        d_fin = _delta_days(b_max, t_max) or 0
        pct_pk = _pct_desviacion(float(d_fin), float(b_dur) if b_dur else 0.0)

        b_cost = sum(float(n.get("costo_programado") or 0) for n in base_nodes.values() if n.get("pk_id") == pk)
        t_cost = sum(float(n.get("costo_programado") or 0) for n in tgt_nodes.values() if n.get("pk_id") == pk)
        pct_c_pk = _pct_desviacion(t_cost - b_cost, b_cost)

        tipos_pk = [n["tipo_cambio"] for n in cmp_data["nodos"] if n.get("pk_id") == pk and n.get("tipo_cambio") != "sin_cambio"]
        nodos_atrasados = sum(1 for n in cmp_data["nodos"] if n.get("pk_id") == pk and n.get("tipo_cambio") == "atrasado")

        alerta_f_pk = _alerta_fechas(d_fin, pct_pk, umb_f, b_dur)
        alerta_c_pk = pct_c_pk >= umb_c

        pks_out.append(
            {
                "pk_id": pk,
                "delta_fin_dias": d_fin,
                "pct_desviacion_fechas": pct_pk,
                "pct_desviacion_costo": pct_c_pk,
                "alerta_fechas": alerta_f_pk,
                "alerta_costo": alerta_c_pk,
                "alerta": alerta_f_pk or alerta_c_pk,
                "desviacion_tipo": _peor_tipo(tipos_pk),
                "tiene_ruta_critica": pk in critico_pks,
                "nodos_atrasados": nodos_atrasados,
            }
        )

    return {
        "baseline_id": bid,
        "target_id": tid,
        "umbrales": {"fechas_pct": umb_f, "costo_pct": umb_c},
        "contrato": contrato_out,
        "pks": pks_out,
    }


def enrich_mapa_rows_with_desviacion(rows: List[dict], desviacion_pks: List[dict]) -> List[dict]:
    by_pk = {str(r.get("pk_id") or "").strip(): r for r in desviacion_pks or []}
    out: List[dict] = []
    for r in rows or []:
        pk = str(r.get("pk_id") or "").strip()
        d = by_pk.get(pk) or {}
        out.append(
            {
                **r,
                "tiene_desviacion": bool(d.get("alerta_fechas")),
                "desviacion_tipo": d.get("desviacion_tipo"),
                "desviacion_fechas_pct": d.get("pct_desviacion_fechas"),
                "delta_fin_dias": d.get("delta_fin_dias"),
            }
        )
    return out
