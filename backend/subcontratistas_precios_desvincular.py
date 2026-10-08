"""
Desvincular ítems de la hoja de Precios de un subcontratista.

- Presupuesto: elimina solo sus filas en presupuesto_sub_asignacion (libera saldo;
  no redistribuye entre otros).
- Manual: elimina subcontratista_precios de origen manual.
- Bloquea si el ítem tiene cantidades en cortes con conciliación 'enviado'.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Sequence, Tuple

from presupuesto_sub_redistribucion import (
    _f,
    _table_exists,
    ejecutado_enviado_por_item,
    sync_presupuesto_subcontratista_id,
)
from subcontratistas_items_cobro import norm_capitulo_key, norm_item_key

_log = logging.getLogger(__name__)


def _item_match(ppto_row: dict, lp: dict) -> bool:
    it_p = norm_item_key(ppto_row.get("item"))
    it_l = norm_item_key(lp.get("item_numero"))
    if not it_p or not it_l or it_p != it_l:
        return False
    cap_p = norm_capitulo_key(ppto_row.get("capitulo") or "")
    cap_l = norm_capitulo_key(lp.get("capitulo") or "")
    if cap_l and cap_p != cap_l:
        return False
    comp_l = (lp.get("competencia") or "").strip()
    if comp_l:
        comp_p = (ppto_row.get("competencia") or "").strip()
        if comp_p != comp_l:
            return False
    return True


def _fetch_listado_map(sb, contrato_id: int, lp_ids: Sequence[int]) -> Dict[int, dict]:
    out: Dict[int, dict] = {}
    ids = [int(x) for x in lp_ids if int(x) > 0]
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        rows = (
            sb.table("listado_precios")
            .select("id, capitulo, competencia, item_numero, descripcion, unidad")
            .eq("contrato_id", int(contrato_id))
            .in_("id", chunk)
            .execute()
            .data
        ) or []
        for r in rows:
            try:
                out[int(r["id"])] = r
            except (TypeError, ValueError, KeyError):
                continue
    return out


def _asignaciones_sub(sb, *, contrato_id: int, subcontratista_id: int) -> List[dict]:
    if not _table_exists(sb, "presupuesto_sub_asignacion"):
        return []
    out: List[dict] = []
    offset = 0
    while True:
        batch = (
            sb.table("presupuesto_sub_asignacion")
            .select("id, presupuesto_id, subcontratista_id, cantidad, contrato_id")
            .eq("contrato_id", int(contrato_id))
            .eq("subcontratista_id", int(subcontratista_id))
            .order("id")
            .range(offset, offset + 999)
            .execute()
            .data
        ) or []
        out.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return out


def _ppto_meta(sb, presupuesto_ids: Sequence[int]) -> Dict[int, dict]:
    ids = [int(x) for x in presupuesto_ids if int(x) > 0]
    out: Dict[int, dict] = {}
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        rows = (
            sb.table("presupuesto")
            .select(
                "id, item, capitulo, competencia, cant_total, subcontratista_id, "
                "tipo_ejecucion, dado_de_baja"
            )
            .in_("id", chunk)
            .execute()
            .data
        ) or []
        for r in rows:
            try:
                out[int(r["id"])] = r
            except (TypeError, ValueError, KeyError):
                continue
    return out


def _remaining_subs_on_ppto(sb, presupuesto_id: int) -> List[int]:
    if not _table_exists(sb, "presupuesto_sub_asignacion"):
        return []
    rows = (
        sb.table("presupuesto_sub_asignacion")
        .select("subcontratista_id")
        .eq("presupuesto_id", int(presupuesto_id))
        .execute()
        .data
    ) or []
    out: List[int] = []
    for r in rows:
        try:
            out.append(int(r["subcontratista_id"]))
        except (TypeError, ValueError, KeyError):
            continue
    return out


def registrar_desvinculacion(
    sb,
    *,
    contrato_id: int,
    subcontratista_id: int,
    usuario_id: Optional[int],
    detalle: List[dict],
) -> None:
    if not detalle:
        return
    if _table_exists(sb, "presupuesto_sub_desvinculacion"):
        try:
            sb.table("presupuesto_sub_desvinculacion").insert({
                "contrato_id": int(contrato_id),
                "subcontratista_id": int(subcontratista_id),
                "usuario_id": int(usuario_id) if usuario_id else None,
                "detalle": detalle,
            }).execute()
            return
        except Exception as exc:
            _log.warning("registrar_desvinculacion table: %s", exc)
    # Fallback: reutilizar tabla de redistribución como auditoría
    if _table_exists(sb, "presupuesto_sub_redistribucion"):
        try:
            sb.table("presupuesto_sub_redistribucion").insert({
                "contrato_id": int(contrato_id),
                "usuario_id": int(usuario_id) if usuario_id else None,
                "nuevo_subcontratista_id": int(subcontratista_id),
                "proporciones": {"tipo": "desvincular"},
                "detalle": detalle,
            }).execute()
        except Exception as exc:
            _log.warning("registrar_desvinculacion fallback: %s", exc)


def desvincular_items_cobro(
    sb,
    *,
    contrato_id: int,
    subcontratista_id: int,
    listado_precio_ids: Sequence[int],
    usuario_id: Optional[int] = None,
) -> dict:
    """
    Desvincula ítems del sub. Retorna eliminados / bloqueados (parcial OK).
    """
    from corte_sub_conciliacion import item_key as csc_item_key

    sid = int(subcontratista_id)
    cid = int(contrato_id)
    lp_ids = sorted({int(x) for x in listado_precio_ids if int(x) > 0})
    if not lp_ids:
        return {
            "ok": True,
            "eliminados": [],
            "bloqueados": [],
            "message": "No hay ítems para desvincular.",
        }

    lp_map = _fetch_listado_map(sb, cid, lp_ids)
    ejec = ejecutado_enviado_por_item(sb, contrato_id=cid, subcontratista_id=sid)

    eliminados: List[dict] = []
    bloqueados: List[dict] = []
    hist: List[dict] = []

    asig = _asignaciones_sub(sb, contrato_id=cid, subcontratista_id=sid)
    ppto_ids = [int(a["presupuesto_id"]) for a in asig if a.get("presupuesto_id")]
    ppto_meta = _ppto_meta(sb, ppto_ids) if ppto_ids else {}

    # Precios del sub indexados por lp
    precios_by_lp: Dict[int, dict] = {}
    try:
        pr = (
            sb.table("subcontratista_precios")
            .select("id, listado_precio_id, origen, cantidad_manual, precio_unitario_sub")
            .eq("subcontratista_id", sid)
            .in_("listado_precio_id", lp_ids)
            .execute()
            .data
        ) or []
        for r in pr:
            try:
                precios_by_lp[int(r["listado_precio_id"])] = r
            except (TypeError, ValueError, KeyError):
                continue
    except Exception as exc:
        _log.warning("desvincular precios lookup: %s", exc)

    # Legado: filas presupuesto con FK = sub (si no hay asignacion)
    legado_rows: List[dict] = []
    if not asig:
        try:
            offset = 0
            while True:
                batch = (
                    sb.table("presupuesto")
                    .select(
                        "id, item, capitulo, competencia, cant_total, subcontratista_id, "
                        "tipo_ejecucion, dado_de_baja"
                    )
                    .eq("contrato_id", cid)
                    .eq("subcontratista_id", sid)
                    .eq("tipo_ejecucion", "Presupuesto de Obra")
                    .eq("dado_de_baja", False)
                    .order("id")
                    .range(offset, offset + 999)
                    .execute()
                    .data
                ) or []
                legado_rows.extend(batch)
                if len(batch) < 1000:
                    break
                offset += 1000
        except Exception as exc:
            _log.warning("desvincular legado: %s", exc)

    for lp_id in lp_ids:
        lp = lp_map.get(lp_id)
        if not lp:
            bloqueados.append({
                "listado_precio_id": lp_id,
                "motivo": "Ítem no encontrado en el listado de precios del contrato.",
            })
            continue

        ik = csc_item_key(lp.get("item_numero"))
        cant_ejec = _f(ejec.get(ik, 0))
        if cant_ejec > 0:
            bloqueados.append({
                "listado_precio_id": lp_id,
                "item_numero": lp.get("item_numero"),
                "descripcion": lp.get("descripcion"),
                "motivo": (
                    f"Tiene {cant_ejec:g} en cortes enviados y conciliados. "
                    "No se puede eliminar porque alteraría información ya conciliada."
                ),
                "ejecutado_conciliado": cant_ejec,
            })
            continue

        # Asignaciones de presupuesto que corresponden a este ítem
        matched_asig: List[Tuple[int, float]] = []
        for a in asig:
            pid = int(a["presupuesto_id"])
            meta = ppto_meta.get(pid) or {}
            if meta.get("dado_de_baja") is True:
                continue
            if str(meta.get("tipo_ejecucion") or "") != "Presupuesto de Obra":
                continue
            if _item_match(meta, lp):
                matched_asig.append((pid, _f(a.get("cantidad"))))

        matched_legado: List[Tuple[int, float]] = []
        if not matched_asig and legado_rows:
            for r in legado_rows:
                if _item_match(r, lp):
                    matched_legado.append((int(r["id"]), _f(r.get("cant_total"))))

        precio = precios_by_lp.get(lp_id)
        origen_precio = str((precio or {}).get("origen") or "").strip().lower()
        es_manual = origen_precio == "manual" or (
            not matched_asig and not matched_legado and precio is not None
        )

        if not matched_asig and not matched_legado and not precio:
            bloqueados.append({
                "listado_precio_id": lp_id,
                "item_numero": lp.get("item_numero"),
                "descripcion": lp.get("descripcion"),
                "motivo": "El subcontratista no tiene este ítem asignado.",
            })
            continue

        cant_liberada = 0.0
        ppto_afectados: List[int] = []

        # Borrar asignaciones compartidas
        for pid, cant in matched_asig:
            try:
                sb.table("presupuesto_sub_asignacion").delete().eq(
                    "presupuesto_id", pid,
                ).eq("subcontratista_id", sid).execute()
            except Exception as exc:
                _log.warning("delete asignacion ppto=%s: %s", pid, exc)
                continue
            cant_liberada += cant
            ppto_afectados.append(pid)
            remaining = _remaining_subs_on_ppto(sb, pid)
            sync_presupuesto_subcontratista_id(sb, pid, remaining)

        # Legado exclusivo: liberar FK
        for pid, cant in matched_legado:
            try:
                sb.table("presupuesto").update({
                    "subcontratista_id": None,
                    "updated_at": "now()",
                }).eq("id", pid).eq("subcontratista_id", sid).execute()
            except Exception as exc:
                _log.warning("clear legado ppto=%s: %s", pid, exc)
                continue
            cant_liberada += cant
            ppto_afectados.append(pid)

        # Precio pactado del sub (manual o huérfano presupuesto)
        precio_id_del = None
        cant_manual = None
        if precio and precio.get("id"):
            try:
                precio_id_del = int(precio["id"])
                cant_manual = precio.get("cantidad_manual")
                sb.table("subcontratista_precios").delete().eq("id", precio_id_del).execute()
            except Exception as exc:
                _log.warning("delete precio_sub %s: %s", precio.get("id"), exc)

        entry = {
            "listado_precio_id": lp_id,
            "item_numero": lp.get("item_numero"),
            "descripcion": lp.get("descripcion"),
            "origen": "manual" if es_manual and not (matched_asig or matched_legado) else "presupuesto",
            "cantidad_liberada": cant_liberada,
            "cantidad_manual": _f(cant_manual) if cant_manual is not None else None,
            "presupuesto_ids": ppto_afectados,
            "precio_id": precio_id_del,
        }
        eliminados.append(entry)
        hist.append({
            "tipo": "desvincular",
            **entry,
            "subcontratista_id": sid,
        })

    registrar_desvinculacion(
        sb,
        contrato_id=cid,
        subcontratista_id=sid,
        usuario_id=usuario_id,
        detalle=hist,
    )

    parts = []
    if eliminados:
        parts.append(f"{len(eliminados)} ítem(s) desvinculado(s)")
    if bloqueados:
        parts.append(f"{len(bloqueados)} bloqueado(s) por cortes conciliados u otro motivo")
    return {
        "ok": True,
        "eliminados": eliminados,
        "bloqueados": bloqueados,
        "message": ". ".join(parts) + "." if parts else "Sin cambios.",
    }
