"""
Membership N:N entre ítems del Listado de Precios y agrupadores WBS.

- Un ítem puede pertenecer a varios agrupadores del mismo capítulo.
- `listado_precios.agrupador_id` se mantiene como denormalización: primer
  membership (o NULL si no tiene ninguno) para compatibilidad con lecturas legacy.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Set, Tuple

from fastapi import HTTPException


def _table_exists(sb, name: str) -> bool:
    try:
        sb.table(name).select("*").limit(1).execute()
        return True
    except Exception:
        return False


def membership_disponible(sb) -> bool:
    return _table_exists(sb, "listado_precios_agrupador_items")


def fetch_membership_rows(sb, contrato_id: int) -> List[dict]:
    """Filas bridge + datos mínimos del ítem (capitulo, item_numero)."""
    if not membership_disponible(sb):
        return []
    # Traer bridge y enriquecer desde listado.
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
    # Filtrar por contrato vía listado
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
    # Fallback legacy: listado_precios.agrupador_id
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


def sync_legacy_agrupador_id(sb, item_ids: Iterable[int]) -> None:
    """Actualiza listado_precios.agrupador_id = min(membership) o NULL."""
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
    for b in bridge:
        by_item.setdefault(int(b["item_id"]), []).append(int(b["agrupador_id"]))
    for iid, ags in by_item.items():
        primary = min(ags) if ags else None
        sb.table("listado_precios").update({"agrupador_id": primary}).eq("id", iid).execute()


def asignar_items_a_agrupador(
    sb,
    contrato_id: int,
    agrupador_id: int,
    capitulo: str,
    item_ids: List[int],
    *,
    reemplazar: bool = False,
) -> int:
    """
    Añade item_ids al agrupador (sin quitarlos de otros).
    Si reemplazar=True, el set del agrupador queda exactamente item_ids
    (quita del bridge los que salen de este agrupador, sin tocar otros AGs).
    """
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
    for row in rows:
        if (row.get("capitulo") or "").strip() != cap:
            raise HTTPException(status_code=400, detail="Todos los ítems deben pertenecer al mismo capítulo.")

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
            sb.table("listado_precios_agrupador_items").upsert(
                to_insert, on_conflict="agrupador_id,item_id",
            ).execute()
        sync_legacy_agrupador_id(sb, afectados if reemplazar else nuevos)
        return len(nuevos)

    # Legacy: asignación exclusiva
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
        sb.table("listado_precios").update(
            {"agrupador_id": int(agrupador_id)},
        ).in_("id", ids).execute()
    return len(ids)


def quitar_item_de_agrupador(sb, agrupador_id: int, item_id: int) -> None:
    if membership_disponible(sb):
        sb.table("listado_precios_agrupador_items").delete().eq(
            "agrupador_id", int(agrupador_id),
        ).eq("item_id", int(item_id)).execute()
        sync_legacy_agrupador_id(sb, [int(item_id)])
        return
    # Legacy: solo limpia si coincide
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
        # También mapa inverso para tooltip multi
        item_ids = list({int(b["item_id"]) for b in bridge})
        otros: Dict[int, List[dict]] = {}
        if item_ids:
            # nombres de todos los AGs del contrato
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

    # Legacy
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
