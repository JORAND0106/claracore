"""
Exportación del cronograma de programación de obra a Microsoft Project XML.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from xml.dom import minidom

from prog_obra_compare import fetch_compare_nodes
from prog_obra_costos_presupuesto import (
    _fetch_agrupadores_meta,
    apply_ppto_cost_overlay,
    build_cost_overlay_maps,
    fetch_ppto_borrador_version_id,
)
from prog_obra_pk_filter import parse_pk_ids_param
from prog_obra_service import listar_dependencias

NS = "http://schemas.microsoft.com/project"
ET.register_namespace("", NS)


def _tag(name: str) -> str:
    return f"{{{NS}}}{name}"

# MS Project PredecessorLink Type: 0=FF, 1=FS, 2=SF, 3=SS
LINK_TYPE = {"FF": 0, "FS": 1, "SF": 2, "SS": 3}


def _parse_date(v: Any) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    try:
        y, m, d = str(v).strip()[:10].split("-")
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def _dt_start(d: date) -> str:
    return f"{d.isoformat()}T08:00:00"


def _dt_finish(d: date) -> str:
    return f"{d.isoformat()}T17:00:00"


def _duration_h(dias_habiles: int) -> str:
    h = max(1, int(dias_habiles or 1)) * 8
    return f"PT{h}H0M0S"


def _link_lag(lag_dias: int) -> int:
    """Lag en décimas de minuto (1 día hábil = 8h = 4800)."""
    return int(lag_dias or 0) * 4800


def _cap_sort_key(c: str) -> tuple:
    import re

    s = (c or "").strip()
    m = re.match(r"^(\d+)", s)
    if m:
        return (0, int(m.group(1)), s)
    return (1, 0, s)


def _node_uid_key(pk: str, cap: str, ag: Optional[int]) -> Tuple[str, str, str]:
    return (pk, cap, str(ag) if ag is not None else "")


def _collect_agrupadores(
    sb,
    version_id: str,
    contrato_id: int,
    version_ppto_id: Optional[str],
    pk_ids: Optional[Set[str]] = None,
) -> Tuple[List[dict], Dict[Tuple[str, str, str], dict]]:
    """Agrupadores programados con fechas, costos y metadatos WBS."""
    nodes = fetch_compare_nodes(sb, version_id, contrato_id)
    ppto_id = (version_ppto_id or "").strip() or fetch_ppto_borrador_version_id(sb, contrato_id)
    if ppto_id:
        ag_costs, item_costs = build_cost_overlay_maps(sb, contrato_id, ppto_id)
        nodes = apply_ppto_cost_overlay(nodes, ag_costs, item_costs)

    ag_meta = _fetch_agrupadores_meta(sb, contrato_id)
    cpm_rows = (
        sb.table("prog_cpm_resultados")
        .select("pk_id,capitulo,agrupador_id,es_ruta_critica")
        .eq("version_id", version_id)
        .execute()
        .data
        or []
    )
    critico = {
        _node_uid_key(
            str(r.get("pk_id") or "").strip(),
            str(r.get("capitulo") or "").strip(),
            int(r["agrupador_id"]) if r.get("agrupador_id") is not None else None,
        ): bool(r.get("es_ruta_critica"))
        for r in cpm_rows
    }

    by_key: Dict[Tuple[str, str, int], dict] = {}
    for n in nodes.values():
        ag_raw = n.get("agrupador_id")
        if ag_raw is None:
            continue
        pk = str(n.get("pk_id") or "").strip()
        if pk_ids and pk not in pk_ids:
            continue
        cap = str(n.get("capitulo") or "").strip()
        if not pk or not cap:
            continue
        fi = n.get("fecha_inicio")
        ff = n.get("fecha_fin")
        if not fi or not ff:
            continue
        ag_id = int(ag_raw)
        key = (pk, cap, ag_id)
        meta = ag_meta.get(ag_id) or {}
        wbs = str(n.get("codigo_wbs") or meta.get("codigo_wbs") or f"AG{ag_id}").strip()
        nombre = (meta.get("nombre") or wbs).strip()
        dur = n.get("duracion_dias_habiles")
        by_key[key] = {
            "pk_id": pk,
            "capitulo": cap,
            "agrupador_id": ag_id,
            "codigo_wbs": wbs,
            "nombre": nombre,
            "fecha_inicio": fi,
            "fecha_fin": ff,
            "duracion_dias_habiles": int(dur) if dur is not None else 1,
            "costo_directo": float(n.get("costo_programado") or 0),
            "es_ruta_critica": critico.get(_node_uid_key(pk, cap, ag_id), False),
        }

    rows = sorted(by_key.values(), key=lambda r: (r["pk_id"], _cap_sort_key(r["capitulo"]), r["codigo_wbs"]))
    lookup = {
        _node_uid_key(r["pk_id"], r["capitulo"], r["agrupador_id"]): r
        for r in rows
    }
    return rows, lookup


class _NodoExport:
    def __init__(self, uid: int, outline_level: int, name: str, summary: bool, **fields):
        self.uid = uid
        self.outline_level = outline_level
        self.name = name
        self.summary = summary
        self.fields = fields
        self.predecessors: List[dict] = []


def _build_task_tree(agrupadores: List[dict]) -> Tuple[List[_NodoExport], Dict[Tuple[str, str, str], int]]:
    """PK (L1) → Capítulo (L2) → Agrupador (L3)."""
    tasks: List[_NodoExport] = []
    uid = 1
    uid_map: Dict[Tuple[str, str, str], int] = {}

    tasks.append(_NodoExport(uid, 0, "Programación de obra", True))
    uid += 1

    pks = sorted({r["pk_id"] for r in agrupadores})
    for pk in pks:
        pk_rows = [r for r in agrupadores if r["pk_id"] == pk]
        pk_fi = min(r["fecha_inicio"] for r in pk_rows)
        pk_ff = max(r["fecha_fin"] for r in pk_rows)
        pk_uid = uid
        uid_map[_node_uid_key(pk, "", None)] = pk_uid
        tasks.append(
            _NodoExport(
                pk_uid,
                1,
                f"PK {pk}",
                True,
                start=pk_fi,
                finish=pk_ff,
            )
        )
        uid += 1

        caps = sorted({r["capitulo"] for r in pk_rows}, key=_cap_sort_key)
        for cap in caps:
            cap_rows = [r for r in pk_rows if r["capitulo"] == cap]
            cap_fi = min(r["fecha_inicio"] for r in cap_rows)
            cap_ff = max(r["fecha_fin"] for r in cap_rows)
            cap_uid = uid
            uid_map[_node_uid_key(pk, cap, None)] = cap_uid
            tasks.append(
                _NodoExport(
                    cap_uid,
                    2,
                    f"Capítulo {cap}",
                    True,
                    start=cap_fi,
                    finish=cap_ff,
                )
            )
            uid += 1

            for r in cap_rows:
                ag_uid = uid
                uid_map[_node_uid_key(pk, cap, r["agrupador_id"])] = ag_uid
                label = f"{pk} · {r['codigo_wbs']} · {r['nombre']}"
                tasks.append(
                    _NodoExport(
                        ag_uid,
                        3,
                        label,
                        False,
                        start=r["fecha_inicio"],
                        finish=r["fecha_fin"],
                        duration=r["duracion_dias_habiles"],
                        cost=r["costo_directo"],
                        critical=r["es_ruta_critica"],
                    )
                )
                uid += 1

    return tasks, uid_map


def _resolve_dep_uid(
    uid_map: Dict[Tuple[str, str, str], int],
    pk: str,
    cap: str,
    ag: Optional[str],
) -> Optional[int]:
    ag_norm = str(ag).strip() if ag not in (None, "") else ""
    if ag_norm:
        try:
            key = _node_uid_key(pk, cap, int(ag_norm))
            if key in uid_map:
                return uid_map[key]
        except (TypeError, ValueError):
            pass
    key_cap = _node_uid_key(pk, cap, None)
    if key_cap in uid_map:
        return uid_map[key_cap]
    key_pk = _node_uid_key(pk, "", None)
    return uid_map.get(key_pk)


def _attach_dependencies(
    sb,
    version_id: str,
    tasks: List[_NodoExport],
    uid_map: Dict[Tuple[str, str, str], int],
) -> None:
    """PredecessorLink en tareas destino (agrupadores hoja)."""
    deps = listar_dependencias(sb, version_id)
    task_by_uid = {t.uid: t for t in tasks}

    for d in deps:
        pk_d = str(d.get("pk_id_destino") or "").strip()
        cap_d = str(d.get("capitulo_destino") or "").strip()
        ag_d = d.get("agrupador_id_destino")
        dest_uid = _resolve_dep_uid(uid_map, pk_d, cap_d, ag_d)
        if not dest_uid or dest_uid not in task_by_uid:
            continue
        dest_task = task_by_uid[dest_uid]
        if dest_task.summary:
            continue

        pk_o = str(d.get("pk_id_origen") or "").strip()
        cap_o = str(d.get("capitulo_origen") or "").strip()
        ag_o = d.get("agrupador_id_origen")
        pred_uid = _resolve_dep_uid(uid_map, pk_o, cap_o, ag_o)
        if not pred_uid:
            continue

        tipo = (d.get("tipo") or "FS").strip().upper()
        dest_task.predecessors.append(
            {
                "predecessor_uid": pred_uid,
                "type": LINK_TYPE.get(tipo, 1),
                "lag": _link_lag(int(d.get("lag_dias") or 0)),
            }
        )


def _sub(parent: ET.Element, tag: str, text: Any = None) -> ET.Element:
    el = ET.SubElement(parent, _tag(tag))
    if text is not None:
        el.text = str(text)
    return el


def _task_to_xml(parent: ET.Element, task: _NodoExport) -> None:
    t = ET.SubElement(parent, _tag("Task"))
    _sub(t, "UID", task.uid)
    _sub(t, "ID", task.uid)
    _sub(t, "Name", task.name)
    _sub(t, "OutlineLevel", task.outline_level)
    _sub(t, "Summary", 1 if task.summary else 0)

    fi = task.fields.get("start")
    ff = task.fields.get("finish")
    if fi:
        d0 = fi if isinstance(fi, date) else _parse_date(fi)
        if d0:
            _sub(t, "Start", _dt_start(d0))
    if ff:
        d1 = ff if isinstance(ff, date) else _parse_date(ff)
        if d1:
            _sub(t, "Finish", _dt_finish(d1))

    if not task.summary:
        dur = task.fields.get("duration", 1)
        _sub(t, "Duration", _duration_h(dur))
        _sub(t, "DurationFormat", 39)
        cost = float(task.fields.get("cost") or 0)
        if cost > 0:
            _sub(t, "FixedCost", round(cost, 2))
            _sub(t, "FixedCostAccrual", 3)
        if task.fields.get("critical"):
            _sub(t, "Critical", 1)

    for pred in task.predecessors:
        pl = ET.SubElement(t, _tag("PredecessorLink"))
        _sub(pl, "PredecessorUID", pred["predecessor_uid"])
        _sub(pl, "Type", pred["type"])
        _sub(pl, "LinkLag", pred["lag"])
        _sub(pl, "LagFormat", 7)


def build_project_xml(
    sb,
    contrato_id: int,
    version_id: str,
    version_ppto_id: Optional[str] = None,
    project_name: Optional[str] = None,
    pk_ids: Optional[str] = None,
) -> bytes:
    pk_set = parse_pk_ids_param(pk_ids)
    agrupadores, _ = _collect_agrupadores(
        sb, version_id, contrato_id, version_ppto_id, pk_ids=pk_set
    )
    if not agrupadores:
        raise ValueError("No hay agrupadores programados para exportar")

    tasks, uid_map = _build_task_tree(agrupadores)
    _attach_dependencies(sb, version_id, tasks, uid_map)

    root = ET.Element(_tag("Project"))
    _sub(root, "Name", project_name or f"Programación contrato {contrato_id}")
    _sub(root, "ScheduleFromStart", 1)
    _sub(root, "StartDate", _dt_start(min(r["fecha_inicio"] for r in agrupadores)))
    _sub(
        root,
        "FinishDate",
        _dt_finish(max(r["fecha_fin"] for r in agrupadores)),
    )
    _sub(root, "CreationDate", datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"))

    tasks_el = ET.SubElement(root, _tag("Tasks"))
    for task in tasks:
        _task_to_xml(tasks_el, task)

    raw = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    parsed = minidom.parseString(raw)
    return parsed.toprettyxml(indent="  ", encoding="utf-8")


def export_filename(contrato_id: int) -> str:
    fecha = datetime.now().strftime("%Y%m%d")
    return f"programacion_{contrato_id}_{fecha}.xml"
