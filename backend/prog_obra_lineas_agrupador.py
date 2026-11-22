"""
Asignación de líneas físicas de presupuesto a agrupadores WBS por versión.

Sustituye la segregación por partes (prog_partes):
- Un ítem con un solo agrupador: todas sus líneas se consideran de ese agrupador
  (compatibilidad; no exige filas en prog_linea_agrupador).
- Un ítem con varios agrupadores: cada línea se asigna explícitamente a uno solo.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import HTTPException

from listado_agrupador_membership import agrupadores_por_item_map, membership_disponible
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
    _resolve_listado_descripcion,
    mark_cpm_dirty,
)
from sicoe_valor_canonico import round_cant, valor_cant_vu


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(s: Any) -> str:
    return str(s or "").strip()


def linea_key_from_row(r: dict) -> str:
    """Clave estable de una fila física de presupuesto."""
    origen = r.get("presupuesto_item_id_origen")
    if origen is not None and str(origen).strip() != "":
        try:
            return f"ppto:{int(origen)}"
        except (TypeError, ValueError):
            pass
    rid = r.get("id")
    if rid is not None and str(rid).strip() != "":
        try:
            return f"snap:{int(rid)}"
        except (TypeError, ValueError):
            pass
    # Fallback determinístico si faltan ids
    parts = [
        _norm(r.get("pk_id")),
        _norm(r.get("capitulo")),
        _norm(r.get("item")),
        _norm(r.get("abs_inicio")),
        _norm(r.get("abs_final")),
        _norm(r.get("descripcion"))[:80],
        _norm(r.get("cant_total")),
    ]
    return "hash:" + "|".join(parts)


def _table_ok(sb) -> bool:
    try:
        sb.table("prog_linea_agrupador").select("id").limit(1).execute()
        return True
    except Exception:
        return False


def fetch_ppto_lineas_pk(
    sb,
    contrato_id: int,
    pk_id: str,
    version_ppto_id: Optional[str] = None,
) -> List[dict]:
    """Líneas físicas del presupuesto en un PK (con abscisas e id)."""
    vid = resolve_ppto_vigente_version_id(
        sb, contrato_id, version_ppto_id, force_vigente=False,
    )
    if not vid:
        return []
    from presupuesto_versiones_service import _fetch_version_items_rows

    rows = _fetch_version_items_rows(
        sb,
        contrato_id,
        vid,
        select=(
            "id,presupuesto_item_id_origen,pk_id,capitulo,item,descripcion,und,"
            "cant_total,vlr_unitario,costo_directo,tramo,abs_inicio,abs_final"
        ),
    )
    pk = _norm(pk_id)
    out = []
    for r in rows:
        if _norm(r.get("pk_id")) != pk:
            continue
        out.append(r)
    return out


def _asignaciones_version_pk(
    sb, version_id: str, pk_id: str, capitulo: Optional[str] = None,
) -> List[dict]:
    if not _table_ok(sb):
        return []
    q = (
        sb.table("prog_linea_agrupador")
        .select("*")
        .eq("version_id", str(version_id))
        .eq("pk_id", _norm(pk_id))
    )
    if capitulo:
        q = q.eq("capitulo", _norm(capitulo))
    return q.execute().data or []


def preview_lineas_agrupador(
    sb,
    *,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    version_ppto_id: Optional[str] = None,
    incluir_asignadas_otros: bool = False,
) -> dict:
    """
    Líneas del PK relevantes para el agrupador:
    - disponibles (sin asignar o ya de este AG) de ítems membership del AG
    - opcionalmente las asignadas a otros AG (para mover en borrador)
    """
    cap = _norm(capitulo)
    ag_id = int(agrupador_id)
    multi_map = agrupadores_por_item_map(sb, contrato_id)
    # Detectar transversal (capítulo sentinel o flag)
    es_tx = cap == "Transversales"
    try:
        ag_row = (
            sb.table("listado_precios_agrupadores")
            .select("es_transversal,capitulo")
            .eq("id", ag_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if ag_row:
            es_tx = bool(ag_row[0].get("es_transversal")) or (
                _norm(ag_row[0].get("capitulo")) == "Transversales"
            )
    except Exception:
        pass

    # Ítems membership de este AG (vía multi o legacy).
    # Transversal: no filtrar por capítulo del AG (ítems de varios caps).
    item_keys: Set[Tuple[str, str]] = set()
    for (c, it), ags in multi_map.items():
        if ag_id in ags and (es_tx or c == cap):
            item_keys.add((c, it))
    if not item_keys:
        # Fallback: items with legacy agrupador_id
        legacy_ag, desc_lp = _listado_agrupador_por_item(sb, contrato_id)
        for (c, it), ag in legacy_ag.items():
            if ag is not None and int(ag) == ag_id and (es_tx or c == cap):
                item_keys.add((c, it))
    else:
        _, desc_lp = _listado_agrupador_por_item(sb, contrato_id)

    vu_map = _load_listado_vu_map(sb, contrato_id)
    lineas_ppto = fetch_ppto_lineas_pk(sb, contrato_id, pk_id, version_ppto_id)
    # Transversal: asignaciones de cualquier capítulo del PK
    asign = _asignaciones_version_pk(
        sb, version_id, pk_id, None if es_tx else cap,
    )
    by_key = {_norm(a.get("linea_key")): a for a in asign}

    # Meta de agrupadores para tooltips (todo el contrato: multi + transversales)
    ag_meta_rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,nombre,codigo_wbs,capitulo")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    ag_meta = {int(r["id"]): r for r in ag_meta_rows if r.get("id") is not None}

    disponibles: List[dict] = []
    propias: List[dict] = []
    de_otros: List[dict] = []

    for r in lineas_ppto:
        c = _norm(r.get("capitulo"))
        it = _norm(r.get("item"))
        if (c, it) not in item_keys:
            continue
        ags_item = multi_map.get((c, it)) or []
        es_multi = len(ags_item) > 1
        # Ítem mono-agrupador: implícitamente del único AG (no necesita asignación)
        if not es_multi and ags_item and ags_item[0] != ag_id:
            continue
        if not es_multi and (not ags_item or ags_item[0] == ag_id):
            # Todas las líneas son "propias" implícitas
            try:
                cant = float(r.get("cant_total") or 0)
            except (TypeError, ValueError):
                cant = 0.0
            vu = _vu_for_row({"capitulo": c, "item": it}, vu_map) or float(r.get("vlr_unitario") or 0)
            row_out = _linea_payload(r, c, it, desc_lp, cant, vu, asignado_a=ag_id, implicit=True)
            propias.append(row_out)
            continue

        # Multi: mirar asignación explícita
        lk = linea_key_from_row(r)
        asg = by_key.get(lk)
        try:
            cant = float(r.get("cant_total") or 0)
        except (TypeError, ValueError):
            cant = 0.0
        vu = _vu_for_row({"capitulo": c, "item": it}, vu_map) or float(r.get("vlr_unitario") or 0)
        if asg is None:
            disponibles.append(
                _linea_payload(r, c, it, desc_lp, cant, vu, asignado_a=None, implicit=False),
            )
        else:
            aid = int(asg["agrupador_id"])
            meta = ag_meta.get(aid) or {}
            payload = _linea_payload(
                r, c, it, desc_lp, cant, vu, asignado_a=aid, implicit=False,
                agrupador_nombre=meta.get("nombre"),
                agrupador_codigo=meta.get("codigo_wbs"),
            )
            if aid == ag_id:
                propias.append(payload)
            elif incluir_asignadas_otros:
                de_otros.append(payload)

    return {
        "pk_id": _norm(pk_id),
        "capitulo": cap,
        "agrupador_id": ag_id,
        "disponibles": disponibles,
        "asignadas": propias,
        "asignadas_otros": de_otros,
        "es_multi": any(
            len(multi_map.get(k) or []) > 1 for k in item_keys
        ),
        "sin_lineas_disponibles": len(disponibles) == 0 and len(propias) == 0,
        "total_disponible_valor": float(sum(float(x["valor"]) for x in disponibles)),
        "total_asignado_valor": float(sum(float(x["valor"]) for x in propias)),
    }


def _linea_payload(
    r, cap, item, desc_lp, cant, vu, *, asignado_a, implicit,
    agrupador_nombre=None, agrupador_codigo=None,
):
    return {
        "linea_key": linea_key_from_row(r),
        "presupuesto_item_id": r.get("presupuesto_item_id_origen") or r.get("id"),
        "item": item,
        "capitulo": cap,
        "descripcion": (_norm(r.get("descripcion"))
                        or _resolve_listado_descripcion(desc_lp, cap, item)),
        "abs_inicio": r.get("abs_inicio"),
        "abs_final": r.get("abs_final"),
        "cantidad": round_cant(cant),
        "unidad": _norm(r.get("und") or r.get("unidad")),
        "vlr_unitario": float(vu or 0),
        "valor": float(valor_cant_vu(cant, vu)),
        "asignado_agrupador_id": asignado_a,
        "agrupador_nombre": agrupador_nombre,
        "agrupador_codigo_wbs": agrupador_codigo,
        "implicito": bool(implicit),
    }


def asignar_lineas(
    sb,
    *,
    version_id: str,
    contrato_id: int,
    pk_id: str,
    capitulo: str,
    agrupador_id: int,
    linea_keys: List[str],
    version_ppto_id: Optional[str] = None,
    mover_desde_otros: bool = False,
) -> dict:
    """Asigna (o mueve) líneas al agrupador. Solo en borrador."""
    assert_version_borrador(sb, version_id)
    if not _table_ok(sb):
        raise BusinessRuleError(
            "Ejecute la migración multi-agrupador (prog_linea_agrupador) antes de asignar líneas.",
        )
    keys = [_norm(k) for k in (linea_keys or []) if _norm(k)]
    if not keys:
        raise BusinessRuleError("Seleccione al menos una línea")

    preview = preview_lineas_agrupador(
        sb,
        version_id=version_id,
        contrato_id=contrato_id,
        pk_id=pk_id,
        capitulo=capitulo,
        agrupador_id=agrupador_id,
        version_ppto_id=version_ppto_id,
        incluir_asignadas_otros=mover_desde_otros,
    )
    permitidas = {x["linea_key"]: x for x in preview["disponibles"]}
    for x in preview["asignadas"]:
        permitidas[x["linea_key"]] = x
    if mover_desde_otros:
        for x in preview["asignadas_otros"]:
            permitidas[x["linea_key"]] = x

    missing = [k for k in keys if k not in permitidas]
    if missing:
        raise BusinessRuleError(
            "Hay líneas que no están disponibles para este agrupador (ya asignadas u otro ítem).",
        )

    now = _now()
    upserts = []
    for k in keys:
        src = permitidas[k]
        upserts.append({
            "version_id": str(version_id),
            "contrato_id": int(contrato_id),
            "pk_id": _norm(pk_id),
            # Capítulo del ítem (presupuesto), no el sentinel «Transversales»
            "capitulo": _norm(src.get("capitulo") or capitulo),
            "item": src["item"],
            "linea_key": k,
            "presupuesto_item_id": src.get("presupuesto_item_id"),
            "agrupador_id": int(agrupador_id),
            "abs_inicio": src.get("abs_inicio"),
            "abs_final": src.get("abs_final"),
            "descripcion": src.get("descripcion"),
            "unidad": src.get("unidad"),
            "cantidad": src.get("cantidad") or 0,
            "vlr_unitario": src.get("vlr_unitario") or 0,
            "alerta_linea_nueva": False,
            "actualizado_en": now,
        })
    sb.table("prog_linea_agrupador").upsert(
        upserts, on_conflict="version_id,linea_key",
    ).execute()
    try:
        mark_cpm_dirty(sb, version_id)
    except Exception:
        pass
    return {"ok": True, "asignadas": len(upserts)}


def liberar_lineas(
    sb,
    *,
    version_id: str,
    linea_keys: List[str],
) -> dict:
    assert_version_borrador(sb, version_id)
    if not _table_ok(sb):
        return {"ok": True, "liberadas": 0}
    keys = [_norm(k) for k in (linea_keys or []) if _norm(k)]
    if not keys:
        return {"ok": True, "liberadas": 0}
    sb.table("prog_linea_agrupador").delete().eq(
        "version_id", str(version_id),
    ).in_("linea_key", keys).execute()
    try:
        mark_cpm_dirty(sb, version_id)
    except Exception:
        pass
    return {"ok": True, "liberadas": len(keys)}


def preview_lineas_a_liberar_por_items(
    sb,
    *,
    contrato_id: int,
    agrupador_id: int,
    item_ids_quitar: List[int],
) -> dict:
    """
    Cuenta líneas en prog_linea_agrupador de versiones en borrador
    que quedarían libres al quitar esos ítems del agrupador.
    No toca validación/selladas/archivadas.
    """
    ids = [int(x) for x in (item_ids_quitar or []) if x is not None]
    if not ids or not _table_ok(sb):
        return {"lineas": 0, "versiones_borrador": 0, "por_version": []}

    # Resolver (capitulo, item_numero) de los ítems a quitar
    items = (
        sb.table("listado_precios")
        .select("id,capitulo,item_numero")
        .eq("contrato_id", int(contrato_id))
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    keys = {
        (_norm(r.get("capitulo")), _norm(r.get("item_numero")))
        for r in items
        if _norm(r.get("capitulo")) and _norm(r.get("item_numero"))
    }
    if not keys:
        return {"lineas": 0, "versiones_borrador": 0, "por_version": []}

    versiones = (
        sb.table("prog_versiones")
        .select("id,numero_version,estado")
        .eq("contrato_id", int(contrato_id))
        .eq("estado", "borrador")
        .execute()
        .data
        or []
    )
    por_version: List[dict] = []
    total = 0
    for v in versiones:
        vid = str(v.get("id") or "")
        if not vid:
            continue
        rows = (
            sb.table("prog_linea_agrupador")
            .select("id,capitulo,item,linea_key")
            .eq("version_id", vid)
            .eq("agrupador_id", int(agrupador_id))
            .execute()
            .data
            or []
        )
        match = [
            r for r in rows
            if (_norm(r.get("capitulo")), _norm(r.get("item"))) in keys
        ]
        n = len(match)
        if n:
            total += n
            por_version.append({
                "version_id": vid,
                "numero_version": v.get("numero_version"),
                "lineas": n,
                "linea_keys": [_norm(r.get("linea_key")) for r in match if _norm(r.get("linea_key"))],
            })
    return {
        "lineas": total,
        "versiones_borrador": len(por_version),
        "por_version": por_version,
    }


def liberar_lineas_items_quitados_borrador(
    sb,
    *,
    contrato_id: int,
    agrupador_id: int,
    item_ids_quitar: List[int],
) -> dict:
    """Libera líneas de versiones en borrador al quitar ítems del agrupador."""
    prev = preview_lineas_a_liberar_por_items(
        sb,
        contrato_id=contrato_id,
        agrupador_id=agrupador_id,
        item_ids_quitar=item_ids_quitar,
    )
    liberadas = 0
    for block in prev.get("por_version") or []:
        keys = block.get("linea_keys") or []
        if not keys:
            continue
        r = liberar_lineas(sb, version_id=block["version_id"], linea_keys=keys)
        liberadas += int(r.get("liberadas") or 0)
    return {
        "ok": True,
        "liberadas": liberadas,
        "versiones_borrador": int(prev.get("versiones_borrador") or 0),
    }


def clonar_lineas_version(sb, version_origen: str, version_destino: str, contrato_id: int) -> int:
    if not _table_ok(sb):
        return 0
    rows = (
        sb.table("prog_linea_agrupador")
        .select("*")
        .eq("version_id", str(version_origen))
        .execute()
        .data
        or []
    )
    if not rows:
        return 0
    now = _now()
    payload = []
    for r in rows:
        payload.append({
            "version_id": str(version_destino),
            "contrato_id": int(contrato_id),
            "pk_id": r["pk_id"],
            "capitulo": r["capitulo"],
            "item": r["item"],
            "linea_key": r["linea_key"],
            "presupuesto_item_id": r.get("presupuesto_item_id"),
            "agrupador_id": r["agrupador_id"],
            "abs_inicio": r.get("abs_inicio"),
            "abs_final": r.get("abs_final"),
            "descripcion": r.get("descripcion"),
            "unidad": r.get("unidad"),
            "cantidad": r.get("cantidad") or 0,
            "vlr_unitario": r.get("vlr_unitario") or 0,
            "alerta_linea_nueva": False,
            "actualizado_en": now,
        })
    # upsert por lotes
    chunk = 200
    for i in range(0, len(payload), chunk):
        sb.table("prog_linea_agrupador").upsert(
            payload[i:i + chunk], on_conflict="version_id,linea_key",
        ).execute()
    return len(payload)


def map_linea_a_agrupador(
    sb, version_id: str, pk_id: Optional[str] = None,
) -> Dict[str, int]:
    """linea_key → agrupador_id."""
    if not _table_ok(sb):
        return {}
    q = sb.table("prog_linea_agrupador").select("linea_key,agrupador_id").eq(
        "version_id", str(version_id),
    )
    if pk_id:
        q = q.eq("pk_id", _norm(pk_id))
    rows = q.execute().data or []
    return {_norm(r["linea_key"]): int(r["agrupador_id"]) for r in rows if r.get("linea_key")}


def resolve_agrupador_para_linea(
    multi_map: Dict[Tuple[str, str], List[int]],
    linea_asig: Dict[str, int],
    row: dict,
) -> Optional[int]:
    """
    Agrupador efectivo de una fila de presupuesto.
    - Mono-membership: ese AG.
    - Multi: el de prog_linea_agrupador o None si falta.
    """
    cap = _norm(row.get("capitulo"))
    it = _norm(row.get("item"))
    ags = multi_map.get((cap, it)) or []
    if len(ags) == 1:
        return ags[0]
    if len(ags) == 0:
        return None
    lk = linea_key_from_row(row)
    return linea_asig.get(lk)
