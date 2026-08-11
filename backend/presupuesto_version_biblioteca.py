"""
Bibliotecas paralelas editables — lectura/escritura en presupuesto_version_items por version_id.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

logger = logging.getLogger(__name__)

from presupuesto_versiones_service import PPTO_TIPO_OBRA, assert_version_del_contrato

# Columnas válidas en presupuesto_version_items (sin backup_1/backup_2 ni
# item_backup_1/descripcion_backup_1/und_backup_1 del vivo).
PRESUPUESTO_VERSION_ITEM_INSERT_KEYS = (
    "presupuesto_item_id_origen",
    "contrato_id",
    "pk_id",
    "capitulo",
    "competencia",
    "item",
    "descripcion",
    "und",
    "calzada",
    "tramo",
    "abs_inicio",
    "abs_final",
    "vlr_unitario",
    "no_inicio",
    "no_final",
    "area_long_nod",
    "ancho",
    "espesor",
    "cant_total",
    "costo_directo",
    "tipo_ejecucion",
    "tipo_entidad",
    "id_pol",
    "observacion",
    "revisado",
    "observacion_externa",
    "ent_handle",
    "txt_handle",
    "layer_ent",
    "layer_txt",
    "color_hex",
    "guid",
    "x_label",
    "y_label",
    "created_at",
    "updated_at",
    "rev_block_handle",
    "dado_de_baja",
    "sellado",
    "validado_por",
    "validado_en",
    "pre_interv_estado",
    "pre_interv_por",
    "pre_interv_en",
    "calculo_por",
    "calculo_en",
)

# Coincidencia exacta para propagar validación entre versiones (solo presupuesto_version_items).
_SYNC_IDENTITY_COLS = (
    "item",
    "descripcion",
    "und",
    "vlr_unitario",
    "cant_total",
    "costo_directo",
    "id_pol",
)
_SYNC_SELECT = (
    "id, version_id, presupuesto_item_id_origen, item, descripcion, und, vlr_unitario, "
    "cant_total, costo_directo, id_pol, revisado, pre_interv_estado"
)
_SYNC_VALIDACION_KEYS = frozenset(
    {
        "revisado",
        "validado_por",
        "validado_en",
        "pre_interv_estado",
        "pre_interv_por",
        "pre_interv_en",
    }
)


def _sync_norm_str(val: Any) -> str:
    return str(val or "").strip()


def _sync_norm_id_pol(val: Any) -> Optional[str]:
    s = _sync_norm_str(val)
    return s if s else None


def _sync_val_eq(a: Any, b: Any) -> bool:
    if a is None and b is None:
        return True
    try:
        fa, fb = float(a), float(b)
        if math.isfinite(fa) and math.isfinite(fb):
            tol = 1e-6 + 1e-9 * max(abs(fa), abs(fb), 1.0)
            return abs(fa - fb) < tol
    except (TypeError, ValueError):
        pass
    return _sync_norm_str(a) == _sync_norm_str(b)


def _sync_rows_identity_match(a: dict, b: dict) -> bool:
    """Coincidencia exacta en columnas de identidad entre dos filas."""
    for col in _SYNC_IDENTITY_COLS:
        va = a.get(col)
        vb = b.get(col)
        if col == "id_pol":
            if _sync_norm_id_pol(va) != _sync_norm_id_pol(vb):
                return False
        elif not _sync_val_eq(va, vb):
            return False
    return True


def _sync_origen_id(row: dict) -> Optional[int]:
    """ID en presupuesto vivo: presupuesto_item_id_origen o id (fila viva)."""
    for key in ("presupuesto_item_id_origen", "id"):
        val = row.get(key)
        if val is None:
            continue
        try:
            return int(val)
        except (TypeError, ValueError):
            continue
    return None


def _sync_rows_match(src: dict, row: dict) -> bool:
    """Coincidencia por columnas de identidad o por presupuesto_item_id_origen."""
    if _sync_rows_identity_match(src, row):
        return True
    orig_src = _sync_origen_id(src)
    orig_row = _sync_origen_id(row)
    return orig_src is not None and orig_src == orig_row


def _patch_validacion_destino(row: dict, estado_patch: dict) -> Dict[str, Any]:
    """Patch de validación solo si el destino aún no fue validado manualmente."""
    patch: Dict[str, Any] = {}
    if "revisado" in estado_patch and _estado_revisado_sin_validar(row.get("revisado")):
        patch["revisado"] = estado_patch["revisado"]
        for k in ("validado_por", "validado_en"):
            if k in estado_patch:
                patch[k] = estado_patch[k]
    if "pre_interv_estado" in estado_patch and _estado_pre_interv_sin_validar(row.get("pre_interv_estado")):
        patch["pre_interv_estado"] = estado_patch["pre_interv_estado"]
        for k in ("pre_interv_por", "pre_interv_en"):
            if k in estado_patch:
                patch[k] = estado_patch[k]
    return patch


def _aplicar_patches_version_items(sb, targets: List[tuple]) -> int:
    if not targets:
        return 0
    seen: set = set()
    synced = 0
    for item_id, patch in targets:
        if item_id in seen:
            continue
        seen.add(item_id)
        sb.table("presupuesto_version_items").update(patch).eq("id", item_id).execute()
        synced += 1
    return synced


def _estado_revisado_sin_validar(revisado: Any) -> bool:
    """True si Interventoría aún no validó manualmente en esa versión."""
    s = _sync_norm_str(revisado) or "No Revisado"
    return s == "No Revisado"


def _estado_pre_interv_sin_validar(pre_interv: Any) -> bool:
    """True si depuración aún no validó manualmente (NULL legado cuenta como pendiente)."""
    if pre_interv is None:
        return True
    s = _sync_norm_str(pre_interv)
    return not s or s == "No Revisado"


def _extraer_patch_validacion(patch: dict) -> dict:
    return {k: patch[k] for k in _SYNC_VALIDACION_KEYS if k in patch}


def _fetch_biblioteca_items_by_ids(
    sb,
    contrato_id: int,
    version_id: str,
    ids: List[int],
) -> List[dict]:
    if not ids:
        return []
    rows: List[dict] = []
    for i in range(0, len(ids), 200):
        batch_ids = ids[i : i + 200]
        batch = (
            sb.table("presupuesto_version_items")
            .select(_SYNC_SELECT)
            .eq("contrato_id", contrato_id)
            .eq("version_id", version_id)
            .in_("id", batch_ids)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
    return rows


def _sincronizar_validacion_a_version_items(
    sb,
    contrato_id: int,
    source_rows: List[dict],
    estado_patch: dict,
    *,
    exclude_version_id: Optional[str] = None,
) -> int:
    """Propaga revisado / pre_interv_estado a presupuesto_version_items con identidad coincidente."""
    if not source_rows or not estado_patch:
        return 0

    sync_revisado = "revisado" in estado_patch
    sync_pre = "pre_interv_estado" in estado_patch
    if not sync_revisado and not sync_pre:
        return 0

    q = sb.table("presupuesto_versiones").select("id").eq("contrato_id", contrato_id)
    if exclude_version_id:
        q = q.neq("id", exclude_version_id)
    versiones = q.execute().data or []
    if not versiones:
        return 0
    target_vids = [str(v["id"]) for v in versiones]

    targets: List[tuple] = []
    offset = 0
    PAGE = 1000
    now_iso = datetime.now(timezone.utc).isoformat()
    while True:
        batch = (
            sb.table("presupuesto_version_items")
            .select(_SYNC_SELECT)
            .eq("contrato_id", contrato_id)
            .in_("version_id", target_vids)
            .eq("dado_de_baja", False)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for row in batch:
            for src in source_rows:
                if not _sync_rows_match(src, row):
                    continue
                patch = _patch_validacion_destino(row, estado_patch)
                if patch:
                    patch["updated_at"] = now_iso
                    targets.append((int(row["id"]), patch))
                break
        if len(batch) < PAGE:
            break
        offset += PAGE

    return _aplicar_patches_version_items(sb, targets)


def _sincronizar_validacion_vivo_por_origen(
    sb,
    contrato_id: int,
    presupuesto_ids: List[int],
    estado_patch: dict,
) -> int:
    """Propaga validación del presupuesto vivo a version_items por presupuesto_item_id_origen."""
    if not presupuesto_ids or not estado_patch:
        return 0
    ids_norm = []
    for pid in presupuesto_ids:
        try:
            ids_norm.append(int(pid))
        except (TypeError, ValueError):
            continue
    if not ids_norm:
        return 0

    targets: List[tuple] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for i in range(0, len(ids_norm), 200):
        batch_ids = ids_norm[i : i + 200]
        batch = (
            sb.table("presupuesto_version_items")
            .select(_SYNC_SELECT)
            .eq("contrato_id", contrato_id)
            .in_("presupuesto_item_id_origen", batch_ids)
            .eq("dado_de_baja", False)
            .execute()
            .data
            or []
        )
        for row in batch:
            patch = _patch_validacion_destino(row, estado_patch)
            if patch:
                patch["updated_at"] = now_iso
                targets.append((int(row["id"]), patch))
    return _aplicar_patches_version_items(sb, targets)


def _sincronizar_validacion_entre_versiones(
    sb,
    contrato_id: int,
    source_version_id: str,
    source_rows: List[dict],
    estado_patch: dict,
) -> int:
    """Propaga validación desde una versión hacia las demás bibliotecas del contrato."""
    return _sincronizar_validacion_a_version_items(
        sb,
        contrato_id,
        source_rows,
        estado_patch,
        exclude_version_id=source_version_id,
    )


_VIVO_SYNC_SELECT = (
    "id, item, descripcion, und, vlr_unitario, cant_total, costo_directo, id_pol"
)


def _fetch_presupuesto_vivo_sync_rows(sb, ids: List[int]) -> List[dict]:
    if not ids:
        return []
    rows: List[dict] = []
    for i in range(0, len(ids), 200):
        batch_ids = ids[i : i + 200]
        batch = (
            sb.table("presupuesto")
            .select(_VIVO_SYNC_SELECT)
            .in_("id", batch_ids)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
    return rows


def sincronizar_validacion_desde_presupuesto_vivo(
    sb,
    contrato_id: int,
    presupuesto_ids: List[int],
    estado_patch: dict,
) -> int:
    """Tras validar en presupuesto vivo, propaga a presupuesto_version_items en todas las versiones."""
    val_patch = _extraer_patch_validacion(estado_patch)
    if not presupuesto_ids or not val_patch:
        return 0
    synced = _sincronizar_validacion_vivo_por_origen(sb, contrato_id, presupuesto_ids, val_patch)
    if synced:
        return synced
    source_rows = _fetch_presupuesto_vivo_sync_rows(sb, presupuesto_ids)
    if not source_rows:
        logger.info(
            "sync validación vivo→versiones: sin filas origen contrato=%s ids=%s",
            contrato_id,
            presupuesto_ids,
        )
        return 0
    return _sincronizar_validacion_a_version_items(
        sb,
        contrato_id,
        source_rows,
        val_patch,
        exclude_version_id=None,
    )


def _sanitize_version_item_row(
    raw: dict,
    version_id: str,
    contrato_id: int,
    *,
    origen_id: Optional[int] = None,
) -> dict:
    """Copia solo campos que existen en presupuesto_version_items."""
    out: Dict[str, Any] = {"version_id": version_id, "contrato_id": contrato_id}
    if origen_id is not None:
        out["presupuesto_item_id_origen"] = origen_id
    for k in PRESUPUESTO_VERSION_ITEM_INSERT_KEYS:
        if k in ("presupuesto_item_id_origen", "contrato_id"):
            continue
        if k in raw:
            out[k] = raw[k]
    if not out.get("tipo_ejecucion"):
        out["tipo_ejecucion"] = PPTO_TIPO_OBRA
    return out


def _count_version_items(sb, version_id: str) -> int:
    total = 0
    offset = 0
    PAGE = 1000
    while True:
        batch = (
            sb.table("presupuesto_version_items")
            .select("id")
            .eq("version_id", version_id)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        total += len(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return total


def materializar_biblioteca_version(sb, contrato_id: int, version_id: str) -> dict:
    """Copia el presupuesto vivo a presupuesto_version_items si la biblioteca está vacía."""
    assert_version_del_contrato(sb, contrato_id, version_id)
    if _count_version_items(sb, version_id) > 0:
        return {"ok": True, "items_copiados": 0, "ya_materializada": True}

    sb.table("presupuesto_version_items").delete().eq("version_id", version_id).execute()

    offset = 0
    PAGE = 500
    copiados = 0
    while True:
        batch = (
            sb.table("presupuesto")
            .select("*")
            .eq("contrato_id", contrato_id)
            .eq("tipo_ejecucion", PPTO_TIPO_OBRA)
            .eq("dado_de_baja", False)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        if not batch:
            break
        rows = []
        for p in batch:
            rows.append(
                _sanitize_version_item_row(
                    p,
                    version_id,
                    contrato_id,
                    origen_id=p.get("id"),
                )
            )
        if rows:
            sb.table("presupuesto_version_items").insert(rows).execute()
            copiados += len(rows)
        if len(batch) < PAGE:
            break
        offset += PAGE

    return {"ok": True, "items_copiados": copiados, "ya_materializada": False}


def _assert_biblioteca_item(sb, contrato_id: int, version_id: str, item_id: int) -> dict:
    row = (
        sb.table("presupuesto_version_items")
        .select("*")
        .eq("id", item_id)
        .eq("version_id", version_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado en esta versión")
    return row[0]


def _recalc_dimensiones(prev: dict, data: dict) -> dict:
    out = dict(data)
    _DIMK = ("area_long_nod", "ancho", "espesor")

    def _dim_merged(k: str) -> float:
        if k not in out:
            return float(prev.get(k) or 0)
        v = out.get(k)
        if v is None:
            return float(prev.get(k) or 0)
        return float(v or 0)

    area = _dim_merged("area_long_nod")
    ancho = _dim_merged("ancho")
    esp = _dim_merged("espesor")
    if "vlr_unitario" in out and out.get("vlr_unitario") is not None:
        vlr = float(out.get("vlr_unitario") or 0)
    else:
        vlr = float(prev.get("vlr_unitario") or 0)
    cant = round(area * ancho * esp, 2) if (ancho or esp) else round(area, 2)
    out["area_long_nod"] = area
    out["ancho"] = ancho
    out["espesor"] = esp
    out["cant_total"] = cant
    out["costo_directo"] = round(cant * vlr, 0)
    return out


def get_biblioteca_item(sb, contrato_id: int, version_id: str, item_id: int) -> dict:
    assert_version_del_contrato(sb, contrato_id, version_id)
    return _assert_biblioteca_item(sb, contrato_id, version_id, item_id)


def update_biblioteca_item(
    sb,
    contrato_id: int,
    version_id: str,
    item_id: int,
    data: dict,
    calculo_por: Optional[str] = None,
) -> dict:
    assert_version_del_contrato(sb, contrato_id, version_id)
    prev = _assert_biblioteca_item(sb, contrato_id, version_id, item_id)
    patch = {k: v for k, v in data.items() if v is not None or k in ("revisado", "validado_por", "validado_en")}
    _DIMK = ("area_long_nod", "ancho", "espesor")
    if any(k in patch for k in _DIMK):
        patch = _recalc_dimensiones(prev, patch)
        if calculo_por:
            patch["calculo_por"] = calculo_por
            patch["calculo_en"] = datetime.now(timezone.utc).isoformat()
    elif "vlr_unitario" in patch:
        cant0 = float(prev.get("cant_total") or 0)
        vlr0 = float(patch.get("vlr_unitario") or 0)
        patch["costo_directo"] = round(cant0 * vlr0, 0)
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    val_patch = _extraer_patch_validacion(patch)
    sb.table("presupuesto_version_items").update(patch).eq("id", item_id).execute()
    if val_patch:
        source_row = _assert_biblioteca_item(sb, contrato_id, version_id, item_id)
        _sincronizar_validacion_entre_versiones(
            sb, contrato_id, version_id, [source_row], val_patch
        )
    return get_biblioteca_item(sb, contrato_id, version_id, item_id)


def dar_baja_biblioteca_item(sb, contrato_id: int, version_id: str, item_id: int) -> dict:
    return update_biblioteca_item(sb, contrato_id, version_id, item_id, {"dado_de_baja": True})


def restaurar_biblioteca_item(sb, contrato_id: int, version_id: str, item_id: int) -> dict:
    return update_biblioteca_item(sb, contrato_id, version_id, item_id, {"dado_de_baja": False})


def bulk_insert_biblioteca(
    sb,
    contrato_id: int,
    version_id: str,
    rows: List[dict],
    mode: str = "append",
) -> dict:
    assert_version_del_contrato(sb, contrato_id, version_id)
    if mode == "replace":
        sb.table("presupuesto_version_items").delete().eq("version_id", version_id).execute()
    if not rows:
        return {"insertados": 0}
    insertados = 0
    BATCH = 500
    for i in range(0, len(rows), BATCH):
        chunk = []
        for raw in rows[i : i + BATCH]:
            chunk.append(_sanitize_version_item_row(raw, version_id, contrato_id))
        try:
            sb.table("presupuesto_version_items").insert(chunk).execute()
            insertados += len(chunk)
        except Exception:
            for row in chunk:
                try:
                    sb.table("presupuesto_version_items").insert(row).execute()
                    insertados += 1
                except Exception:
                    pass
    return {"insertados": insertados}


def bulk_patch_biblioteca_ids(
    sb,
    contrato_id: int,
    version_id: str,
    ids: List[int],
    patch: dict,
) -> dict:
    assert_version_del_contrato(sb, contrato_id, version_id)
    if not ids:
        return {"actualizados": 0}
    patch = {**patch, "updated_at": datetime.now(timezone.utc).isoformat()}
    val_patch = _extraer_patch_validacion(patch)
    actualizados = 0
    for i in range(0, len(ids), 200):
        batch_ids = ids[i : i + 200]
        sb.table("presupuesto_version_items").update(patch).eq("version_id", version_id).in_("id", batch_ids).execute()
        actualizados += len(batch_ids)
    sincronizados = 0
    if val_patch:
        source_rows = _fetch_biblioteca_items_by_ids(sb, contrato_id, version_id, ids)
        try:
            sincronizados = _sincronizar_validacion_entre_versiones(
                sb, contrato_id, version_id, source_rows, val_patch
            )
        except Exception as exc:
            logger.warning(
                "sync validación versión→versiones falló contrato=%s version=%s ids=%s: %s",
                contrato_id,
                version_id,
                ids,
                exc,
                exc_info=True,
            )
    out: Dict[str, Any] = {"actualizados": actualizados}
    if sincronizados:
        out["sincronizados_otras_versiones"] = sincronizados
    return out


def fetch_panel_validacion_biblioteca(
    sb,
    contrato_id: int,
    version_id: str,
    current_user: dict,
    *,
    nivel: str,
    capitulo: Optional[str],
    filtros: dict,
) -> dict:
    """Agregado panel validación desde presupuesto_version_items (modo biblioteca)."""
    from collections import defaultdict

    from presupuesto_helpers import (
        _presupuesto_aplica_filtro_interventoria,
        _presupuesto_q_estructura,
        _presupuesto_q_filtro_infraestructura_via_pk_ids,
        _presupuesto_q_filtros_ubicacion,
        _presupuesto_q_visibilidad_interventoria,
    )
    from presupuesto_panel_validacion import panel_validacion_rpc_a_filas

    assert_version_del_contrato(sb, contrato_id, version_id)
    caps = filtros.get("capitulos") or []
    items = filtros.get("items") or []
    offset = 0
    rows: List[dict] = []
    while True:
        q = sb.table("presupuesto_version_items").select(
            "capitulo, item, descripcion, und, cant_total, costo_directo, revisado"
        ).eq("contrato_id", int(contrato_id)).eq("version_id", version_id).eq("dado_de_baja", False)
        if nivel == "item" and capitulo:
            q = q.eq("capitulo", capitulo)
        q = _presupuesto_q_estructura(
            q,
            capitulo=caps[0] if len(caps) == 1 else None,
            capitulos=caps if len(caps) > 1 else None,
            item=items[0] if len(items) == 1 else None,
            items=items if len(items) > 1 else None,
            tramo=filtros.get("tramos", [None])[0] if len(filtros.get("tramos") or []) == 1 else None,
            tramos=filtros.get("tramos") if len(filtros.get("tramos") or []) > 1 else None,
            calzada=filtros.get("calzadas", [None])[0] if len(filtros.get("calzadas") or []) == 1 else None,
            calzadas=filtros.get("calzadas") if len(filtros.get("calzadas") or []) > 1 else None,
            competencia=filtros.get("competencias", [None])[0] if len(filtros.get("competencias") or []) == 1 else None,
            competencias=filtros.get("competencias") if len(filtros.get("competencias") or []) > 1 else None,
            und=filtros.get("unds", [None])[0] if len(filtros.get("unds") or []) == 1 else None,
            unds=filtros.get("unds") if len(filtros.get("unds") or []) > 1 else None,
        )
        q = _presupuesto_q_filtro_infraestructura_via_pk_ids(
            q,
            sb,
            int(contrato_id),
            single=filtros.get("infraestructuras", [None])[0] if len(filtros.get("infraestructuras") or []) == 1 else None,
            multi=filtros.get("infraestructuras") if len(filtros.get("infraestructuras") or []) > 1 else None,
        )
        q = _presupuesto_q_filtros_ubicacion(
            q,
            nodo_inicio=filtros.get("nodo_inicio"),
            nodo_final=filtros.get("nodo_final"),
            buscar=filtros.get("buscar"),
            id_pol=filtros.get("id_pol"),
            pk_criterio=filtros.get("pk_criterio"),
            texto=filtros.get("texto"),
            abs_desde=filtros.get("abs_desde"),
            abs_hasta=filtros.get("abs_hasta"),
            revisado=filtros.get("revisado"),
            pre_interv_estado=filtros.get("pre_interv_estado"),
            sellado=filtros.get("sellado"),
            vlr_unitario_desde=filtros.get("vlr_unitario_desde"),
            vlr_unitario_hasta=filtros.get("vlr_unitario_hasta"),
            cant_total_desde=filtros.get("cant_total_desde"),
            cant_total_hasta=filtros.get("cant_total_hasta"),
            costo_directo_desde=filtros.get("costo_directo_desde"),
            costo_directo_hasta=filtros.get("costo_directo_hasta"),
        )
        q = _presupuesto_q_visibilidad_interventoria(q, current_user)
        batch = q.range(offset, offset + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000

    mapa: Dict[str, dict] = defaultdict(lambda: {
        "capitulo": "",
        "item": None,
        "descripcion": "",
        "und": "",
        "cant_total": 0.0,
        "por_estado": defaultdict(lambda: {"registros": 0, "costo_directo": 0.0, "cant_total": 0.0}),
    })
    for r in rows:
        cap = str(r.get("capitulo") or "").strip() or "(sin capítulo)"
        it = str(r.get("item") or "").strip()
        key = f"{cap}|{it}" if nivel == "item" else cap
        bucket = mapa[key]
        bucket["capitulo"] = cap
        if nivel == "item":
            bucket["item"] = it
            bucket["descripcion"] = r.get("descripcion") or ""
            bucket["und"] = r.get("und") or ""
        est = str(r.get("revisado") or "No Revisado").strip() or "No Revisado"
        pe = bucket["por_estado"][est]
        pe["registros"] += 1
        pe["costo_directo"] += float(r.get("costo_directo") or 0)
        pe["cant_total"] += float(r.get("cant_total") or 0)
        bucket["cant_total"] += float(r.get("cant_total") or 0)

    grupos = []
    total = 0
    for g in mapa.values():
        por_estado = {k: dict(v) for k, v in g["por_estado"].items()}
        tr = sum(v["registros"] for v in por_estado.values())
        tc = sum(v["costo_directo"] for v in por_estado.values())
        total += tr
        grupos.append({
            "capitulo": g["capitulo"],
            "item": g["item"] if nivel == "item" else None,
            "descripcion": g["descripcion"],
            "und": g["und"],
            "cant_total": g["cant_total"],
            "total_registros": tr,
            "total_costo": round(tc, 2),
            "por_estado": por_estado,
        })

    data = {"nivel": nivel, "total_registros": total, "grupos": grupos}
    filas = panel_validacion_rpc_a_filas(data, nivel)
    return {
        "filas": filas,
        "nivel": nivel,
        "total_registros": total,
        "fuente": "biblioteca",
    }


def conteo_biblioteca(
    sb,
    contrato_id: int,
    version_id: str,
    q_builder,
) -> int:
    """Cuenta filas con el mismo builder que GET items (función _q_base del route)."""
    assert_version_del_contrato(sb, contrato_id, version_id)
    total = 0
    offset = 0
    PAGE = 1000
    while True:
        batch = q_builder().range(offset, offset + PAGE - 1).execute().data or []
        total += len(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return total
