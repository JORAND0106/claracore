"""
Membership N:N entre ítems del Listado de Precios y agrupadores WBS.

- Un ítem puede pertenecer a varios agrupadores (capítulo o transversales).
- `listado_precios.agrupador_id` se mantiene como denormalización: primer
  membership de capítulo (no transversal), o NULL. Los transversales viven
  solo en el bridge N:N para no romper el trigger de coherencia de capítulo.
"""
from __future__ import annotations

import logging
from typing import Dict, Iterable, List, Optional, Set, Tuple

from fastapi import HTTPException

_log = logging.getLogger("claracore.listado_agrupador_membership")

CAPITULO_TRANSVERSALES = "Transversales"

_MEMBERSHIP_CACHE: Optional[bool] = None


def _table_exists(sb, name: str) -> bool:
    try:
        sb.table(name).select("*").limit(1).execute()
        return True
    except Exception as exc:
        msg = str(exc).lower()
        if "pgrst205" in msg or "does not exist" in msg or "not find the table" in msg:
            return False
        # Otros errores (auth, red): no asumir que existe
        _log.warning("table_exists(%s) error: %s", name, exc)
        return False


def invalidate_membership_cache() -> None:
    global _MEMBERSHIP_CACHE
    _MEMBERSHIP_CACHE = None


def membership_disponible(sb) -> bool:
    global _MEMBERSHIP_CACHE
    if _MEMBERSHIP_CACHE is not None:
        return _MEMBERSHIP_CACHE
    _MEMBERSHIP_CACHE = _table_exists(sb, "listado_precios_agrupador_items")
    return _MEMBERSHIP_CACHE


def require_membership(sb) -> None:
    """Obliga la tabla N:N: sin ella multi-AG y transversales no pueden persistir ítems."""
    invalidate_membership_cache()
    if membership_disponible(sb):
        return
    raise HTTPException(
        status_code=503,
        detail=(
            "Falta la tabla listado_precios_agrupador_items (membership N:N). "
            "Ejecute la migración 20261122180000_listado_multi_agrupador_transversales.sql "
            "y reintente. Sin ella los agrupadores quedan vacíos."
        ),
    )


def fetch_membership_rows(sb, contrato_id: int) -> List[dict]:
    """Filas bridge + datos mínimos del ítem (capitulo, item_numero)."""
    if not membership_disponible(sb):
        return []
    bridge = (
        sb.table("listado_precios_agrupador_items")
        .select("agrupador_id,item_id")
        .execute()
        .data
        or []
    )
    if not bridge:
        return []
    item_ids = list({int(r["item_id"]) for r in bridge if r.get("item_id") is not None})
    items = (
        sb.table("listado_precios")
        .select("id,capitulo,item_numero,agrupador_id")
        .eq("contrato_id", int(contrato_id))
        .in_("id", item_ids)
        .execute()
        .data
        or []
    )
    by_id = {int(r["id"]): r for r in items if r.get("id") is not None}
    out = []
    for b in bridge:
        it = by_id.get(int(b["item_id"]))
        if not it:
            continue
        out.append({
            "agrupador_id": int(b["agrupador_id"]),
            "item_id": int(b["item_id"]),
            "capitulo": (it.get("capitulo") or "").strip(),
            "item_numero": (it.get("item_numero") or "").strip(),
        })
    return out


def agrupadores_por_item_map(
    sb, contrato_id: int,
) -> Dict[Tuple[str, str], List[int]]:
    """(capitulo, item_numero) → [agrupador_id, ...] ordenados."""
    rows = fetch_membership_rows(sb, contrato_id)
    out: Dict[Tuple[str, str], List[int]] = {}
    if rows:
        for r in rows:
            key = (r["capitulo"], r["item_numero"])
            out.setdefault(key, [])
            if r["agrupador_id"] not in out[key]:
                out[key].append(r["agrupador_id"])
        return out
    legacy = (
        sb.table("listado_precios")
        .select("capitulo,item_numero,agrupador_id")
        .eq("contrato_id", int(contrato_id))
        .not_.is_("agrupador_id", "null")
        .execute()
        .data
        or []
    )
    for r in legacy:
        cap = (r.get("capitulo") or "").strip()
        it = (r.get("item_numero") or "").strip()
        ag = r.get("agrupador_id")
        if not cap or not it or ag is None:
            continue
        out.setdefault((cap, it), []).append(int(ag))
    return out


def items_ids_de_agrupador(sb, agrupador_id: int) -> Set[int]:
    if membership_disponible(sb):
        rows = (
            sb.table("listado_precios_agrupador_items")
            .select("item_id")
            .eq("agrupador_id", int(agrupador_id))
            .execute()
            .data
            or []
        )
        return {int(r["item_id"]) for r in rows if r.get("item_id") is not None}
    rows = (
        sb.table("listado_precios")
        .select("id")
        .eq("agrupador_id", int(agrupador_id))
        .execute()
        .data
        or []
    )
    return {int(r["id"]) for r in rows if r.get("id") is not None}


def agrupadores_ids_de_item(sb, item_id: int) -> Set[int]:
    """Agrupadores a los que pertenece el ítem (bridge N:N o legado)."""
    if membership_disponible(sb):
        rows = (
            sb.table("listado_precios_agrupador_items")
            .select("agrupador_id")
            .eq("item_id", int(item_id))
            .execute()
            .data
            or []
        )
        return {int(r["agrupador_id"]) for r in rows if r.get("agrupador_id") is not None}
    row = (
        sb.table("listado_precios")
        .select("agrupador_id")
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if row and row[0].get("agrupador_id") is not None:
        return {int(row[0]["agrupador_id"])}
    return set()


def _agrupadores_transversales_ids(sb, ag_ids: Iterable[int]) -> Set[int]:
    ids = [int(x) for x in ag_ids]
    if not ids:
        return set()
    rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,es_transversal,capitulo")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    out: Set[int] = set()
    for r in rows:
        if r.get("es_transversal") or (r.get("capitulo") or "").strip() == CAPITULO_TRANSVERSALES:
            out.add(int(r["id"]))
    return out


def sync_legacy_agrupador_id(sb, item_ids: Iterable[int]) -> None:
    """Actualiza listado_precios.agrupador_id = primer AG de capítulo (no transversal)."""
    ids = [int(x) for x in item_ids]
    if not ids:
        return
    if not membership_disponible(sb):
        return
    bridge = (
        sb.table("listado_precios_agrupador_items")
        .select("agrupador_id,item_id")
        .in_("item_id", ids)
        .execute()
        .data
        or []
    )
    by_item: Dict[int, List[int]] = {i: [] for i in ids}
    all_ags: Set[int] = set()
    for b in bridge:
        iid = int(b["item_id"])
        aid = int(b["agrupador_id"])
        by_item.setdefault(iid, []).append(aid)
        all_ags.add(aid)
    tx_ids = _agrupadores_transversales_ids(sb, all_ags)
    for iid, ags in by_item.items():
        chapter_ags = sorted(a for a in ags if a not in tx_ids)
        primary = chapter_ags[0] if chapter_ags else None
        try:
            sb.table("listado_precios").update({"agrupador_id": primary}).eq("id", iid).execute()
        except Exception as exc:
            # No tumbar la asignación N:N si el legacy falla
            _log.warning("sync_legacy_agrupador_id item=%s falló: %s", iid, exc)


def asignar_items_a_agrupador(
    sb,
    contrato_id: int,
    agrupador_id: int,
    capitulo: str,
    item_ids: List[int],
    *,
    reemplazar: bool = False,
    permitir_multi_capitulo: bool = False,
    exigir_membership: bool = True,
) -> int:
    """
    Añade item_ids al agrupador (sin quitarlos de otros).
    Si reemplazar=True, el set del agrupador queda exactamente item_ids.
    Si permitir_multi_capitulo=True (agrupador transversal), no exige mismo capítulo.
    """
    if exigir_membership:
        require_membership(sb)

    if not item_ids and not reemplazar:
        return 0
    cap = capitulo.strip()
    ids = list(dict.fromkeys(int(x) for x in item_ids))
    rows = (
        sb.table("listado_precios")
        .select("id, capitulo")
        .eq("contrato_id", int(contrato_id))
        .in_("id", ids or [-1])
        .execute()
        .data
        or []
    ) if ids else []
    if ids and len(rows) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Uno o más ítems no existen en este contrato.")
    if not permitir_multi_capitulo:
        for row in rows:
            if (row.get("capitulo") or "").strip() != cap:
                raise HTTPException(
                    status_code=400,
                    detail="Todos los ítems deben pertenecer al mismo capítulo.",
                )

    if membership_disponible(sb):
        actuales = items_ids_de_agrupador(sb, agrupador_id)
        nuevos = set(ids)
        if reemplazar:
            quitar = actuales - nuevos
            if quitar:
                for iid in quitar:
                    sb.table("listado_precios_agrupador_items").delete().eq(
                        "agrupador_id", int(agrupador_id),
                    ).eq("item_id", int(iid)).execute()
            afectados = quitar | nuevos
        else:
            afectados = nuevos - actuales
        to_insert = [
            {"agrupador_id": int(agrupador_id), "item_id": int(iid)}
            for iid in (nuevos - actuales)
        ]
        if to_insert:
            try:
                sb.table("listado_precios_agrupador_items").upsert(
                    to_insert, on_conflict="agrupador_id,item_id",
                ).execute()
            except Exception as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"No se pudieron guardar los ítems del agrupador: {exc}",
                ) from exc
        sync_legacy_agrupador_id(sb, afectados if reemplazar else nuevos)
        # Verificar persistencia
        guardados = items_ids_de_agrupador(sb, agrupador_id)
        if nuevos - guardados:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Los ítems no quedaron asociados al agrupador. "
                    "Verifique que exista listado_precios_agrupador_items."
                ),
            )
        return len(nuevos)

    # Legacy exclusivo (solo si no se exigió membership)
    if reemplazar:
        actuales = (
            sb.table("listado_precios")
            .select("id")
            .eq("agrupador_id", int(agrupador_id))
            .execute()
            .data
            or []
        )
        actuales_ids = {int(r["id"]) for r in actuales}
        quitar = actuales_ids - set(ids)
        if quitar:
            sb.table("listado_precios").update({"agrupador_id": None}).in_(
                "id", list(quitar),
            ).execute()
    if ids:
        try:
            sb.table("listado_precios").update(
                {"agrupador_id": int(agrupador_id)},
            ).in_("id", ids).execute()
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"No se pudieron asignar ítems (legado): {exc}",
            ) from exc
    return len(ids)


def quitar_item_de_agrupador(sb, agrupador_id: int, item_id: int) -> None:
    if membership_disponible(sb):
        sb.table("listado_precios_agrupador_items").delete().eq(
            "agrupador_id", int(agrupador_id),
        ).eq("item_id", int(item_id)).execute()
        sync_legacy_agrupador_id(sb, [int(item_id)])
        return
    row = (
        sb.table("listado_precios")
        .select("agrupador_id")
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if row and row[0].get("agrupador_id") == int(agrupador_id):
        sb.table("listado_precios").update({"agrupador_id": None}).eq(
            "id", int(item_id),
        ).execute()


def count_sin_agrupar(sb, contrato_id: int) -> int:
    if membership_disponible(sb):
        todos = (
            sb.table("listado_precios")
            .select("id")
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
        if not todos:
            return 0
        ids = [int(r["id"]) for r in todos]
        bridge = (
            sb.table("listado_precios_agrupador_items")
            .select("item_id")
            .in_("item_id", ids)
            .execute()
            .data
            or []
        )
        con = {int(r["item_id"]) for r in bridge}
        return len([i for i in ids if i not in con])
    rows = (
        sb.table("listado_precios")
        .select("id", count="exact")
        .eq("contrato_id", int(contrato_id))
        .is_("agrupador_id", "null")
        .execute()
    )
    return int(rows.count or 0)


def enrich_agrupadores_con_items(sb, contrato_id: int, agrupadores: List[dict]) -> List[dict]:
    """Añade item_ids y items_count a cada agrupador desde membership N:N."""
    if not agrupadores:
        return agrupadores
    ag_ids = [int(a["id"]) for a in agrupadores if a.get("id") is not None]
    if membership_disponible(sb):
        bridge = (
            sb.table("listado_precios_agrupador_items")
            .select("agrupador_id,item_id")
            .in_("agrupador_id", ag_ids)
            .execute()
            .data
            or []
        )
        by_ag: Dict[int, List[int]] = {aid: [] for aid in ag_ids}
        for b in bridge:
            by_ag.setdefault(int(b["agrupador_id"]), []).append(int(b["item_id"]))
        item_ids = list({int(b["item_id"]) for b in bridge})
        otros: Dict[int, List[dict]] = {}
        if item_ids:
            ag_meta = {int(a["id"]): a for a in agrupadores}
            for b in bridge:
                iid = int(b["item_id"])
                aid = int(b["agrupador_id"])
                otros.setdefault(iid, [])
                meta = ag_meta.get(aid) or {}
                otros[iid].append({
                    "id": aid,
                    "nombre": meta.get("nombre"),
                    "codigo_wbs": meta.get("codigo_wbs"),
                })
        for a in agrupadores:
            aid = int(a["id"])
            ids = by_ag.get(aid) or []
            a["item_ids"] = ids
            a["items_count"] = len(ids)
            a["items_otros_agrupadores"] = {
                str(iid): [x for x in (otros.get(iid) or []) if x["id"] != aid]
                for iid in ids
            }
        return agrupadores

    for a in agrupadores:
        aid = int(a["id"])
        rows = (
            sb.table("listado_precios")
            .select("id")
            .eq("agrupador_id", aid)
            .execute()
            .data
            or []
        )
        ids = [int(r["id"]) for r in rows]
        a["item_ids"] = ids
        a["items_count"] = len(ids)
        a["items_otros_agrupadores"] = {}
    return agrupadores


def listar_agrupadores_vacios(sb, contrato_id: int) -> List[dict]:
    """Agrupadores del contrato sin ningún ítem en membership/legado."""
    rows = (
        sb.table("listado_precios_agrupadores")
        .select("id,capitulo,nombre,codigo_wbs,es_transversal,creado_en")
        .eq("contrato_id", int(contrato_id))
        .order("id")
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    enriched = enrich_agrupadores_con_items(sb, contrato_id, list(rows))
    return [
        {
            "id": a["id"],
            "capitulo": a.get("capitulo"),
            "nombre": a.get("nombre"),
            "codigo_wbs": a.get("codigo_wbs"),
            "es_transversal": bool(a.get("es_transversal")),
            "creado_en": a.get("creado_en"),
            "items_count": int(a.get("items_count") or 0),
        }
        for a in enriched
        if int(a.get("items_count") or 0) == 0
    ]


def intentar_restaurar_desde_logs(sb, contrato_id: int, vacios: List[dict]) -> dict:
    """
    Busca en logs CREAR/EDITAR de agrupadores el payload con item_ids / items
    y reasigna si es recuperable.
    """
    restaurados = []
    no_recuperables = []
    for ag in vacios:
        ag_id = int(ag["id"])
        detalle = None
        try:
            logs = (
                sb.table("logs")
                .select("*")
                .eq("tabla", "listado_precios_agrupadores")
                .eq("entidad_id", str(ag_id))
                .order("id", desc=True)
                .limit(10)
                .execute()
                .data
                or []
            )
        except Exception:
            try:
                logs = (
                    sb.table("logs")
                    .select("*")
                    .eq("entidad_id", str(ag_id))
                    .order("id", desc=True)
                    .limit(20)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                logs = []
        for row in logs:
            d = row.get("detalle") or row.get("datos") or row.get("payload") or row.get("cambio")
            if isinstance(d, str):
                import json
                try:
                    d = json.loads(d)
                except Exception:
                    d = None
            if not isinstance(d, dict):
                continue
            ids = d.get("item_ids")
            if not ids and isinstance(d.get("items"), list) and d["items"] and isinstance(d["items"][0], (int, float)):
                ids = d["items"]
            if ids:
                detalle = [int(x) for x in ids]
                break
        if not detalle:
            no_recuperables.append(ag)
            continue
        try:
            n = asignar_items_a_agrupador(
                sb,
                contrato_id,
                ag_id,
                (ag.get("capitulo") or "").strip() or CAPITULO_TRANSVERSALES,
                detalle,
                reemplazar=True,
                permitir_multi_capitulo=bool(ag.get("es_transversal"))
                or (ag.get("capitulo") or "").strip() == CAPITULO_TRANSVERSALES,
            )
            restaurados.append({**ag, "items_restaurados": n, "item_ids": detalle})
        except Exception as exc:
            no_recuperables.append({**ag, "error": str(exc)[:200]})
    return {"restaurados": restaurados, "no_recuperables": no_recuperables}
