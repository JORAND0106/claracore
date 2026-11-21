"""
Segregación de agrupadores WBS dentro de un PK.

Un agrupador con varias líneas de presupuesto puede dividirse en partes
nombradas; cada línea pertenece a una sola parte. «Pendiente» recoge lo no marcado.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from prog_obra_costos_presupuesto import (
    _load_listado_vu_map,
    _vu_for_row,
    fetch_ppto_items_version,
    resolve_ppto_vigente_version_id,
)
from prog_obra_service import (
    BusinessRuleError,
    assert_version_borrador,
    _listado_agrupador_por_item,
    _resolve_listado_agrupador_id,
    _resolve_listado_descripcion,
    mark_cpm_dirty,
)
from sicoe_valor_canonico import round_cant, valor_cant_vu


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm_item(s: Any) -> str:
    t = str(s or "").strip()
    return t.rstrip(".")


def listar_partes_agrupador(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
) -> List[dict]:
    rows = (
        sb.table("prog_partes")
        .select("*")
        .eq("version_id", version_id)
        .eq("pk_id", pk_id)
        .eq("capitulo", capitulo)
        .eq("agrupador_id", int(agrupador_id))
        .order("orden")
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    parte_ids = [str(r["id"]) for r in rows]
    items = (
        sb.table("prog_parte_items")
        .select("*")
        .in_("parte_id", parte_ids)
        .execute()
        .data
        or []
    )
    by_parte: Dict[str, List[dict]] = {pid: [] for pid in parte_ids}
    for it in items:
        by_parte.setdefault(str(it["parte_id"]), []).append(it)
    out = []
    for r in rows:
        pid = str(r["id"])
        out.append({**r, "items": by_parte.get(pid) or []})
    return out


def _lineas_presupuesto_agrupador(
    sb,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    version_ppto_id: Optional[str] = None,
) -> List[dict]:
    vid = resolve_ppto_vigente_version_id(
        sb, contrato_id, version_ppto_id, force_vigente=False,
    )
    if not vid:
        return []
    rows = fetch_ppto_items_version(sb, contrato_id, vid, pk_id=pk_id)
    ag_by_item, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
    vu_map = _load_listado_vu_map(sb, contrato_id)
    out = []
    for r in rows:
        cap = str(r.get("capitulo") or "").strip()
        if cap != capitulo:
            continue
        it = str(r.get("item") or "").strip()
        ag = _resolve_listado_agrupador_id(ag_by_item, cap, it)
        if ag is None or int(ag) != int(agrupador_id):
            continue
        try:
            cant = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        vu = _vu_for_row({"capitulo": cap, "item": it}, vu_map) or float(r.get("vlr_unitario") or 0)
        out.append({
            "item": it,
            "descripcion": (r.get("descripcion") or "").strip()
            or _resolve_listado_descripcion(desc_lp, cap, it),
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
            "cantidad": round_cant(cant),
            "unidad": (r.get("und") or r.get("unidad") or "").strip(),
            "vlr_unitario": float(vu or 0),
            "valor": float(valor_cant_vu(cant, vu)),
        })
    out.sort(key=lambda x: x["item"])
    return out


def preview_lineas_segregar(
    sb,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    version_ppto_id: Optional[str] = None,
) -> dict:
    lineas = _lineas_presupuesto_agrupador(
        sb, contrato_id, pk_id, capitulo, agrupador_id, version_ppto_id,
    )
    return {
        "pk_id": pk_id,
        "capitulo": capitulo,
        "agrupador_id": int(agrupador_id),
        "lineas": lineas,
        "puede_segregar": len(lineas) > 1,
        "total_valor": float(sum(float(x["valor"]) for x in lineas)),
    }


def crear_segregacion(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    nombre_parte: str,
    items_seleccionados: List[str],
    fecha_inicio: Optional[str],
    duracion_dias_habiles: Optional[int],
    version_ppto_id: Optional[str] = None,
) -> dict:
    assert_version_borrador(sb, version_id)
    nombre = (nombre_parte or "").strip()
    if not nombre or nombre.lower() == "pendiente":
        raise BusinessRuleError("Indique un nombre corto distinto de Pendiente")
    sel = {_norm_item(x) for x in (items_seleccionados or []) if str(x or "").strip()}
    if not sel:
        raise BusinessRuleError("Seleccione al menos una línea")

    lineas = _lineas_presupuesto_agrupador(
        sb, contrato_id, pk_id, capitulo, agrupador_id, version_ppto_id,
    )
    if len(lineas) < 2:
        raise BusinessRuleError("Solo se segrega un agrupador con más de una línea")

    all_items = {_norm_item(x["item"]) for x in lineas}
    if not sel.issubset(all_items):
        raise BusinessRuleError("Hay ítems que no pertenecen a este agrupador/PK")

    # Limpiar segregación previa del mismo agrupador+PK
    existing = listar_partes_agrupador(sb, version_id, contrato_id, pk_id, capitulo, agrupador_id)
    if existing:
        ids = [str(p["id"]) for p in existing]
        sb.table("prog_parte_items").delete().in_("parte_id", ids).execute()
        sb.table("prog_partes").delete().in_("id", ids).execute()

    resto = all_items - sel
    now = _now()
    partes_payload = [
        {
            "version_id": version_id,
            "contrato_id": int(contrato_id),
            "pk_id": pk_id,
            "capitulo": capitulo,
            "agrupador_id": int(agrupador_id),
            "nombre": nombre,
            "es_pendiente": False,
            "fecha_inicio": fecha_inicio,
            "duracion_dias_habiles": duracion_dias_habiles,
            "override_manual": bool(fecha_inicio),
            "orden": 0,
            "alerta_lineas_nuevas": False,
            "actualizado_en": now,
        },
        {
            "version_id": version_id,
            "contrato_id": int(contrato_id),
            "pk_id": pk_id,
            "capitulo": capitulo,
            "agrupador_id": int(agrupador_id),
            "nombre": "Pendiente",
            "es_pendiente": True,
            "fecha_inicio": None,
            "duracion_dias_habiles": None,
            "override_manual": False,
            "orden": 1,
            "alerta_lineas_nuevas": False,
            "actualizado_en": now,
        },
    ]
    ins = sb.table("prog_partes").insert(partes_payload).execute().data or []
    if len(ins) < 2:
        raise BusinessRuleError("No se pudieron crear las partes")
    parte_sel = next(p for p in ins if not p.get("es_pendiente"))
    parte_pend = next(p for p in ins if p.get("es_pendiente"))

    item_rows = []
    for it in sel:
        item_rows.append({
            "parte_id": parte_sel["id"],
            "version_id": version_id,
            "pk_id": pk_id,
            "capitulo": capitulo,
            "item": next(x["item"] for x in lineas if _norm_item(x["item"]) == it),
        })
    for it in resto:
        item_rows.append({
            "parte_id": parte_pend["id"],
            "version_id": version_id,
            "pk_id": pk_id,
            "capitulo": capitulo,
            "item": next(x["item"] for x in lineas if _norm_item(x["item"]) == it),
        })
    if item_rows:
        sb.table("prog_parte_items").insert(item_rows).execute()

    mark_cpm_dirty(sb, version_id)
    return {
        "ok": True,
        "parte": parte_sel,
        "pendiente": parte_pend,
        "items_parte": len(sel),
        "items_pendiente": len(resto),
    }


def deshacer_segregacion(
    sb,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
) -> dict:
    assert_version_borrador(sb, version_id)
    existing = listar_partes_agrupador(sb, version_id, contrato_id, pk_id, capitulo, agrupador_id)
    if not existing:
        return {"ok": True, "eliminadas": 0}
    ids = [str(p["id"]) for p in existing]
    sb.table("prog_parte_items").delete().in_("parte_id", ids).execute()
    sb.table("prog_partes").delete().in_("id", ids).execute()
    # Quitar parte_id de actividades
    sb.table("prog_actividades").update({"parte_id": None}).eq("version_id", version_id).in_(
        "parte_id", ids
    ).execute()
    mark_cpm_dirty(sb, version_id)
    return {"ok": True, "eliminadas": len(ids)}


def clonar_partes_version(
    sb,
    version_origen_id: str,
    version_destino_id: str,
    contrato_id: int,
) -> int:
    """Clona segregaciones al crear reprogramación."""
    partes = (
        sb.table("prog_partes")
        .select("*")
        .eq("version_id", version_origen_id)
        .execute()
        .data
        or []
    )
    if not partes:
        return 0
    items = (
        sb.table("prog_parte_items")
        .select("*")
        .eq("version_id", version_origen_id)
        .execute()
        .data
        or []
    )
    by_parte: Dict[str, List[dict]] = {}
    for it in items:
        by_parte.setdefault(str(it["parte_id"]), []).append(it)

    id_map: Dict[str, str] = {}
    now = _now()
    for p in partes:
        old_id = str(p["id"])
        payload = {k: v for k, v in p.items() if k not in ("id", "creado_en")}
        payload["version_id"] = version_destino_id
        payload["contrato_id"] = int(contrato_id)
        payload["actualizado_en"] = now
        ins = sb.table("prog_partes").insert(payload).execute().data or []
        if not ins:
            continue
        id_map[old_id] = str(ins[0]["id"])

    item_rows = []
    for old_pid, its in by_parte.items():
        new_pid = id_map.get(old_pid)
        if not new_pid:
            continue
        for it in its:
            item_rows.append({
                "parte_id": new_pid,
                "version_id": version_destino_id,
                "pk_id": it["pk_id"],
                "capitulo": it["capitulo"],
                "item": it["item"],
            })
    if item_rows:
        sb.table("prog_parte_items").insert(item_rows).execute()
    return len(id_map)


def sync_lineas_nuevas_presupuesto(
    sb,
    version_id: str,
    contrato_id: int,
    version_ppto_id: Optional[str] = None,
) -> int:
    """
    Líneas nuevas del presupuesto en un PK ya segregado caen en Pendiente
    y marcan alerta_lineas_nuevas.
    """
    partes = (
        sb.table("prog_partes")
        .select("*")
        .eq("version_id", version_id)
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    if not partes:
        return 0
    assigned = (
        sb.table("prog_parte_items")
        .select("pk_id,capitulo,item,parte_id")
        .eq("version_id", version_id)
        .execute()
        .data
        or []
    )
    assigned_keys = {
        (str(r["pk_id"]), str(r["capitulo"]), _norm_item(r["item"]))
        for r in assigned
    }
    pend_by_ag: Dict[Tuple[str, str, int], str] = {}
    for p in partes:
        if p.get("es_pendiente"):
            pend_by_ag[(
                str(p["pk_id"]),
                str(p["capitulo"]),
                int(p["agrupador_id"]),
            )] = str(p["id"])

    added = 0
    groups = {(str(p["pk_id"]), str(p["capitulo"]), int(p["agrupador_id"])) for p in partes}
    for pk, cap, ag_id in groups:
        lineas = _lineas_presupuesto_agrupador(
            sb, contrato_id, pk, cap, ag_id, version_ppto_id,
        )
        pend_id = pend_by_ag.get((pk, cap, ag_id))
        if not pend_id:
            continue
        new_items = []
        for ln in lineas:
            key = (pk, cap, _norm_item(ln["item"]))
            if key in assigned_keys:
                continue
            new_items.append({
                "parte_id": pend_id,
                "version_id": version_id,
                "pk_id": pk,
                "capitulo": cap,
                "item": ln["item"],
            })
            assigned_keys.add(key)
        if new_items:
            sb.table("prog_parte_items").insert(new_items).execute()
            sb.table("prog_partes").update({
                "alerta_lineas_nuevas": True,
                "actualizado_en": _now(),
            }).eq("id", pend_id).execute()
            added += len(new_items)
    return added
