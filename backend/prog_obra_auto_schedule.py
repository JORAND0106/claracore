"""
Fase 5A — Programación automática con estrategias equitativa, costo y personalizada.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles, count_dias_habiles_entre, es_dia_habil
from prog_obra_service import (
    BusinessRuleError,
    PRESUPUESTO_TIPO_POLIGONO,
    assert_version_borrador,
    ensure_prog_pk_estado_all,
    make_prog_calendar_loader,
    upsert_prog_pk_estado,
)


def check_auto_schedule_prereqs(sb, contrato_id: int, version_id: str) -> dict:
    from prog_obra_service import fetch_sin_agrupador_count_by_pk

    sin_by_pk = fetch_sin_agrupador_count_by_pk(sb, contrato_id)
    pks_sin = [{"pk_id": pk, "count": n} for pk, n in sin_by_pk.items() if n > 0]

    deps = (
        sb.table("prog_dependencias_globales")
        .select("id")
        .eq("version_id", version_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    deps_ok = len(deps) > 0

    return {
        "ok": len(pks_sin) == 0 and deps_ok,
        "pks_sin_agrupador": pks_sin,
        "dependencias_globales_ok": deps_ok,
        "mensajes": [
            *( [f"PK {x['pk_id']}: {x['count']} ítems sin agrupador WBS"] for x in pks_sin ),
            *([] if deps_ok else ["Defina dependencias globales antes de programar automáticamente"]),
        ],
    }


def _pk_costos(sb, contrato_id: int) -> Dict[str, float]:
    rows = (
        sb.table("presupuesto")
        .select("pk_id,cant_total,vlr_unitario")
        .eq("contrato_id", contrato_id)
        .eq("tipo_ejecucion", PRESUPUESTO_TIPO_POLIGONO)
        .eq("dado_de_baja", False)
        .execute()
        .data
        or []
    )
    out: Dict[str, float] = defaultdict(float)
    for r in rows:
        pk = str(r.get("pk_id") or "").strip()
        if not pk:
            continue
        cant = float(r.get("cant_total") or 0)
        vlr = float(r.get("vlr_unitario") or 0)
        out[pk] += cant * vlr
    return dict(out)


def _agrupadores_por_pk(sb, contrato_id: int, pk_id: str) -> List[dict]:
    """Agrupadores WBS del PK desde presupuesto + listado."""
    from prog_obra_service import fetch_estructura_programacion_pk

    est = fetch_estructura_programacion_pk(sb, contrato_id, pk_id)
    ags: List[dict] = []
    for cap in est.get("capitulos") or []:
        cap_name = cap.get("capitulo") or ""
        for ag in cap.get("agrupadores") or []:
            ags.append(
                {
                    "pk_id": pk_id,
                    "capitulo": cap_name,
                    "agrupador_id": ag.get("agrupador_id"),
                    "codigo_wbs": ag.get("codigo_wbs"),
                    "nombre": ag.get("agrupador_nombre"),
                    "costo": float(ag.get("costo_directo") or 0),
                    "cantidad": float(ag.get("cant_total") or 0),
                    "unidad": (ag.get("items") or [{}])[0].get("und") or "?",
                }
            )
    return ags


def _next_habil(contrato_id: int, d: date, cache: CalendarioNoHabilesCache) -> date:
    cur = d
    while not es_dia_habil(contrato_id, cur, cache):
        cur += timedelta(days=1)
    return cur


def preview_auto_schedule(
    sb,
    contrato_id: int,
    version_id: str,
    fecha_inicio: date,
    fecha_fin: date,
    estrategia: str,
    pk_order: Optional[List[str]] = None,
    pk_parallel_groups: Optional[List[List[str]]] = None,
) -> dict:
    cache = CalendarioNoHabilesCache(make_prog_calendar_loader(sb))
    dias_disp = count_dias_habiles_entre(contrato_id, fecha_inicio, fecha_fin, cache)
    if dias_disp < 1:
        raise BusinessRuleError("No hay días hábiles en el rango del contrato")

    pk_costs = _pk_costos(sb, contrato_id)
    pks = sorted(pk_costs.keys()) if pk_costs else []
    if pk_order:
        pks = [p for p in pk_order if p in pk_costs] + [p for p in pks if p not in pk_order]

    estrategia = (estrategia or "equitativa").strip().lower()
    propuesta: List[dict] = []
    cursor = _next_habil(contrato_id, fecha_inicio, cache)
    fin_proyecto = fecha_inicio

    if estrategia == "personalizado" and pk_parallel_groups:
        groups = pk_parallel_groups
    else:
        groups = [[pk] for pk in pks]

    total_cost = sum(pk_costs.values()) or 1.0
    n_groups = max(len(groups), 1)
    dias_por_grupo = max(1, dias_disp // n_groups) if estrategia == "equitativa" else None

    for gi, group in enumerate(groups):
        if estrategia == "equitativa":
            group_dias = dias_por_grupo or 1
        elif estrategia == "costo":
            group_cost = sum(pk_costs.get(p, 0) for p in group)
            group_dias = max(1, int(round(dias_disp * (group_cost / total_cost))))
        else:
            group_dias = max(1, dias_disp // n_groups)

        group_start = cursor
        for pk in group:
            ags = _agrupadores_por_pk(sb, contrato_id, pk)
            if not ags:
                continue
            ag_cost_total = sum(a["costo"] for a in ags) or 1.0
            ag_dias_total = max(1, group_dias // max(len(ags), 1))
            ag_cursor = group_start
            for ag in ags:
                if estrategia == "costo":
                    dur = max(1, int(round(group_dias * (ag["costo"] / ag_cost_total))))
                else:
                    dur = max(1, ag_dias_total)
                ag_ini = _next_habil(contrato_id, ag_cursor, cache)
                ag_fin = add_dias_habiles(contrato_id, ag_ini, dur, cache)
                if ag_fin and ag_fin > fin_proyecto:
                    fin_proyecto = ag_fin
                propuesta.append(
                    {
                        "pk_id": pk,
                        "capitulo": ag["capitulo"],
                        "agrupador_id": ag["agrupador_id"],
                        "codigo_wbs": ag["codigo_wbs"],
                        "label": ag["nombre"],
                        "fecha_inicio": ag_ini.isoformat(),
                        "fecha_fin": ag_fin.isoformat() if ag_fin else None,
                        "duracion_dias_habiles": dur,
                        "costo": ag["costo"],
                        "cantidad": ag["cantidad"],
                        "unidad": ag["unidad"],
                        "costo_unitario": ag["costo"] / max(ag["cantidad"], 1),
                    }
                )
                ag_cursor = (ag_fin + timedelta(days=1)) if ag_fin else ag_cursor + timedelta(days=dur)
        cursor = (fin_proyecto + timedelta(days=1)) if fin_proyecto > group_start else cursor + timedelta(days=group_dias)

    dentro_plazo = fin_proyecto <= fecha_fin if fin_proyecto else True
    return {
        "estrategia": estrategia,
        "dias_habiles_disponibles": dias_disp,
        "fecha_inicio": fecha_inicio.isoformat(),
        "fecha_fin_contrato": fecha_fin.isoformat(),
        "fecha_fin_calculada": fin_proyecto.isoformat() if fin_proyecto else None,
        "dentro_plazo": dentro_plazo,
        "propuesta": propuesta,
        "pk_resumen": [
            {
                "pk_id": pk,
                "costo": pk_costs.get(pk, 0),
                "actividades": len([p for p in propuesta if p["pk_id"] == pk]),
            }
            for pk in pks
        ],
    }


def apply_auto_schedule(
    sb,
    contrato_id: int,
    version_id: str,
    usuario_id: int,
    propuesta: List[dict],
) -> dict:
    assert_version_borrador(sb, version_id)
    cache = CalendarioNoHabilesCache(make_prog_calendar_loader(sb))
    applied = 0
    by_pk: Dict[str, List[dict]] = defaultdict(list)

    for row in propuesta or []:
        pk = str(row.get("pk_id") or "").strip()
        cap = str(row.get("capitulo") or "").strip()
        ag_id = row.get("agrupador_id")
        wbs = str(row.get("codigo_wbs") or "").strip()
        if not pk or not cap or ag_id is None:
            continue
        fi = row.get("fecha_inicio")
        dur = int(row.get("duracion_dias_habiles") or 1)
        fin = add_dias_habiles(contrato_id, date.fromisoformat(str(fi)[:10]), dur, cache) if fi else None
        item_key = wbs or f"AG{ag_id}"
        act_row = {
            "capitulo": cap,
            "item": item_key,
            "segmento": 1,
            "fecha_inicio": str(fi)[:10] if fi else None,
            "duracion_dias_habiles": dur,
            "fecha_fin_calculada": fin.isoformat() if fin else None,
            "cantidad_programada": float(row.get("cantidad") or 1),
            "unidad": row.get("unidad") or "?",
            "costo_unitario": float(row.get("costo_unitario") or 0) or (
                float(row.get("costo") or 0) / max(float(row.get("cantidad") or 1), 1)
            ),
            "tipo_distribucion": "lineal",
            "override_manual": True,
            "heredado_de_capitulo": False,
            "agrupador_id": int(ag_id),
            "codigo_wbs": wbs[:50] if wbs else None,
        }
        by_pk[pk].append(act_row)
        applied += 1

    for pk, acts in by_pk.items():
        sb.rpc(
            "prog_batch_upsert_actividades",
            {
                "p_version_id": version_id,
                "p_contrato_id": contrato_id,
                "p_pk_id": pk,
                "p_usuario_id": usuario_id,
                "p_actividades": acts,
            },
        ).execute()
        upsert_prog_pk_estado(sb, version_id, contrato_id, pk)

    ensure_prog_pk_estado_all(sb, version_id, contrato_id)
    return {"ok": True, "actividades_aplicadas": applied, "pks": list(by_pk.keys())}
