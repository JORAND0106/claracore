"""
Servicio — versionador de presupuesto (snapshots por contrato).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException


class PresupuestoVersionError(Exception):
    """Error de reglas de negocio del versionador."""


def _rpc_result(data: Any) -> dict:
    if isinstance(data, list):
        return data[0] if data else {}
    return data if isinstance(data, dict) else {}


def listar_versiones(sb, contrato_id: int) -> List[dict]:
    rows = (
        sb.table("presupuesto_versiones")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("numero_version", desc=True)
        .execute()
        .data
        or []
    )
    if not rows:
        return []

    version_ids = [r["id"] for r in rows]
    items = (
        sb.table("presupuesto_version_items")
        .select("version_id, costo_directo")
        .in_("version_id", version_ids)
        .execute()
        .data
        or []
    )
    agg: Dict[str, Dict[str, Any]] = {}
    for it in items:
        vid = str(it.get("version_id"))
        bucket = agg.setdefault(vid, {"conteo_items": 0, "costo_directo_total": 0.0})
        bucket["conteo_items"] += 1
        try:
            bucket["costo_directo_total"] += float(it.get("costo_directo") or 0)
        except (TypeError, ValueError):
            pass

    out: List[dict] = []
    uids = list({r.get("creada_por") for r in rows if r.get("creada_por")})
    nombres: Dict[Any, str] = {}
    if uids:
        urows = (
            sb.table("usuarios")
            .select("id, nombre, apellidos, email")
            .in_("id", uids)
            .execute()
            .data
            or []
        )
        for u in urows:
            uid = u.get("id")
            nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
            nombres[uid] = nom or (u.get("email") or f"Usuario {uid}")

    for row in rows:
        vid = str(row.get("id"))
        stats = agg.get(vid, {"conteo_items": 0, "costo_directo_total": 0.0})
        creador = row.get("creada_por")
        out.append(
            {
                "id": row.get("id"),
                "contrato_id": row.get("contrato_id"),
                "numero_version": row.get("numero_version"),
                "etiqueta": row.get("etiqueta"),
                "es_vigente": bool(row.get("es_vigente")),
                "justificacion_tecnica": row.get("justificacion_tecnica"),
                "creada_por": creador,
                "creada_por_nombre": nombres.get(creador) if creador else None,
                "creada_en": row.get("creada_en"),
                "snapshot_tipo": row.get("snapshot_tipo"),
                "aiu_porcentaje": float(row["aiu_porcentaje"]) if row.get("aiu_porcentaje") is not None else None,
                "conteo_items": stats["conteo_items"],
                "costo_directo_total": round(stats["costo_directo_total"], 2),
            }
        )
    return out


def assert_version_del_contrato(sb, contrato_id: int, version_id: str) -> dict:
    row = (
        sb.table("presupuesto_versiones")
        .select("*")
        .eq("id", version_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Versión no encontrada para este contrato")
    return row[0]


def crear_version(
    sb,
    contrato_id: int,
    usuario_id: int,
    etiqueta: str,
    justificacion_tecnica: Optional[str] = None,
    aiu_porcentaje: Optional[float] = None,
) -> dict:
    et = (etiqueta or "").strip()
    if not et:
        raise HTTPException(status_code=400, detail="La etiqueta es obligatoria")
    res = sb.rpc(
        "presupuesto_version_crear",
        {
            "p_contrato_id": int(contrato_id),
            "p_etiqueta": et,
            "p_justificacion_tecnica": (justificacion_tecnica or "").strip() or None,
            "p_creada_por": int(usuario_id),
        },
    ).execute()
    data = _rpc_result(res.data)
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="No se pudo crear la versión de presupuesto")
    version_id = data.get("version_id")
    if aiu_porcentaje is not None:
        try:
            pct = float(aiu_porcentaje)
            if pct >= 0:
                sb.table("presupuesto_versiones").update({"aiu_porcentaje": pct}).eq(
                    "id", str(version_id)
                ).execute()
        except (TypeError, ValueError):
            pass
    version = assert_version_del_contrato(sb, contrato_id, str(version_id))
    items = (
        sb.table("presupuesto_version_items")
        .select("costo_directo")
        .eq("version_id", str(version_id))
        .execute()
        .data
        or []
    )
    total = 0.0
    for it in items:
        try:
            total += float(it.get("costo_directo") or 0)
        except (TypeError, ValueError):
            pass
    return {
        **version,
        "items_copiados": data.get("items_copiados", 0),
        "conteo_items": data.get("items_copiados", 0),
        "costo_directo_total": round(total, 2),
    }


def restaurar_version(sb, contrato_id: int, version_id: str) -> dict:
    assert_version_del_contrato(sb, contrato_id, version_id)
    res = sb.rpc(
        "presupuesto_version_restaurar",
        {
            "p_contrato_id": int(contrato_id),
            "p_version_id": str(version_id),
        },
    ).execute()
    data = _rpc_result(res.data)
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="No se pudo restaurar la versión")
    return assert_version_del_contrato(sb, contrato_id, version_id)


def _orden_capitulo_version(c: Optional[str]) -> tuple:
    import re
    if not c:
        return (2, 0, c or "")
    m = re.match(r"^(\d+)", str(c).strip())
    if m:
        return (0, int(m.group(1)), c)
    return (1, 0, c)


def _fetch_version_items_rows(
    sb,
    contrato_id: int,
    version_id: str,
    capitulo: Optional[str] = None,
    tramo: Optional[str] = None,
    select: str = "capitulo, costo_directo, cant_total",
) -> List[dict]:
    assert_version_del_contrato(sb, contrato_id, version_id)
    rows: List[dict] = []
    offset = 0
    while True:
        q = (
            sb.table("presupuesto_version_items")
            .select(select)
            .eq("contrato_id", contrato_id)
            .eq("version_id", version_id)
            .eq("dado_de_baja", False)
        )
        if capitulo:
            q = q.eq("capitulo", capitulo)
        if tramo and str(tramo).strip():
            q = q.eq("tramo", str(tramo).strip())
        batch = q.range(offset, offset + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def _aggregate_items_lista(rows: List[dict]) -> List[dict]:
    items: dict = {}
    for r in rows:
        it = r.get("item") or ""
        if it not in items:
            items[it] = {
                "item": it,
                "descripcion": r.get("descripcion") or "",
                "und": r.get("und") or "",
                "vlr_unitario": r.get("vlr_unitario") or 0,
                "cant_total": 0.0,
                "costo_total": 0.0,
                "total_registros": 0,
                "revisados": [],
            }
        items[it]["cant_total"] += float(r.get("cant_total") or 0)
        items[it]["costo_total"] += float(r.get("costo_directo") or 0)
        items[it]["total_registros"] += 1
        items[it]["revisados"].append(r.get("revisado") or "No Revisado")
    return sorted(items.values(), key=lambda x: x["item"])


def resumen_capitulos_version(
    sb,
    contrato_id: int,
    version_id: str,
    tramo: Optional[str] = None,
) -> List[dict]:
    """Totales por capítulo (cantidad + costo directo) desde presupuesto_version_items."""
    rows = _fetch_version_items_rows(
        sb,
        contrato_id,
        version_id,
        tramo=tramo,
        select="capitulo, costo_directo, cant_total",
    )
    caps: dict = {}
    for r in rows:
        cap = r.get("capitulo") or ""
        if cap not in caps:
            caps[cap] = {
                "capitulo": cap,
                "cant_total": 0.0,
                "costo_total": 0.0,
                "total_registros": 0,
            }
        caps[cap]["cant_total"] += float(r.get("cant_total") or 0)
        caps[cap]["costo_total"] += float(r.get("costo_directo") or 0)
        caps[cap]["total_registros"] += 1
    return sorted(caps.values(), key=lambda x: _orden_capitulo_version(x.get("capitulo")))


def items_lista_version(
    sb,
    contrato_id: int,
    version_id: str,
    capitulo: str,
    tramo: Optional[str] = None,
) -> List[dict]:
    """Ítems agregados de un capítulo en snapshot de versión (misma forma que GET /presupuesto/.../items-lista)."""
    cap = (capitulo or "").strip()
    if not cap:
        raise HTTPException(status_code=422, detail="capitulo es obligatorio")
    rows = _fetch_version_items_rows(
        sb,
        contrato_id,
        version_id,
        capitulo=cap,
        tramo=tramo,
        select="item, descripcion, und, vlr_unitario, cant_total, costo_directo, revisado",
    )
    return _aggregate_items_lista(rows)


def eliminar_version(sb, contrato_id: int, version_id: str) -> dict:
    row = assert_version_del_contrato(sb, contrato_id, version_id)
    if row.get("es_vigente"):
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar la versión vigente. Restaure otra versión antes.",
        )
    sb.table("presupuesto_version_items").delete().eq("version_id", version_id).execute()
    sb.table("presupuesto_versiones").delete().eq("id", version_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True, "version_id": version_id}
