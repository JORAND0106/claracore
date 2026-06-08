"""
Servicio — versionador de presupuesto (snapshots por contrato).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException


class PresupuestoVersionError(Exception):
    """Error de reglas de negocio del versionador."""


PPTO_TIPO_OBRA = "Presupuesto de Obra"


def _rpc_result(data: Any) -> dict:
    if isinstance(data, list):
        return data[0] if data else {}
    return data if isinstance(data, dict) else {}


def _aggregate_presupuesto_vivo(sb, contrato_id: int) -> Dict[str, Any]:
    """Conteo y costo directo del presupuesto VIVO (Presupuesto de Obra activo).

    La versión vigente representa el presupuesto de trabajo en curso: su contenido
    es la tabla `presupuesto` viva, no un snapshot congelado. Paginamos porque
    PostgREST limita cada respuesta a ~1000 filas.
    """
    conteo = 0
    costo = 0.0
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table("presupuesto")
            .select("costo_directo")
            .eq("contrato_id", contrato_id)
            .eq("tipo_ejecucion", PPTO_TIPO_OBRA)
            .eq("dado_de_baja", False)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for it in batch:
            conteo += 1
            try:
                costo += float(it.get("costo_directo") or 0)
            except (TypeError, ValueError):
                pass
        if len(batch) < PAGE:
            break
        offset += PAGE
    return {"conteo_items": conteo, "costo_directo_total": round(costo, 2)}


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
    # PostgREST limita cada respuesta a ~1000 filas. Una sola query .in_(version_ids)
    # truncaba el conteo total (p. ej. 84 + 916 = 1000), subcontando los ítems reales
    # de cada versión. Paginamos ordenando por PK estable (id) para acumular todo.
    agg: Dict[str, Dict[str, Any]] = {}
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table("presupuesto_version_items")
            .select("version_id, costo_directo")
            .in_("version_id", version_ids)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for it in batch:
            vid = str(it.get("version_id"))
            bucket = agg.setdefault(vid, {"conteo_items": 0, "costo_directo_total": 0.0})
            bucket["conteo_items"] += 1
            try:
                bucket["costo_directo_total"] += float(it.get("costo_directo") or 0)
            except (TypeError, ValueError):
                pass
        if len(batch) < PAGE:
            break
        offset += PAGE

    # La versión vigente refleja el presupuesto vivo (no su snapshot congelado).
    hay_vigente = any(bool(r.get("es_vigente")) for r in rows)
    vivo = _aggregate_presupuesto_vivo(sb, contrato_id) if hay_vigente else None

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
        es_vigente = bool(row.get("es_vigente"))
        # Borrador activo (es_vigente) → presupuesto vivo; selladas → su snapshot.
        if es_vigente and vivo is not None:
            stats = vivo
        else:
            stats = agg.get(vid, {"conteo_items": 0, "costo_directo_total": 0.0})
        creador = row.get("creada_por")
        out.append(
            {
                "id": row.get("id"),
                "contrato_id": row.get("contrato_id"),
                "numero_version": row.get("numero_version"),
                "etiqueta": row.get("etiqueta"),
                "es_vigente": es_vigente,
                # Ciclo de aprobación (doble llave).
                "estado": row.get("estado") or ("borrador" if es_vigente else "aprobado_sellado"),
                "sellado": bool(row.get("sellado")),
                "es_vigente_aprobada": bool(row.get("es_vigente_aprobada")),
                "observaciones": row.get("observaciones"),
                "enviado_en": row.get("enviado_en"),
                "sellado_en": row.get("sellado_en"),
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

    # Nuevo modelo (doble llave): crear versión = registrar un BORRADOR activo y
    # des-sellar el presupuesto vivo para que el contratista pueda editar. No se
    # congela snapshot aquí (eso ocurre al SELLAR). El vivo ya equivale a la última
    # versión sellada, así que las cantidades aprobadas "llegan" al nuevo borrador.
    res = sb.rpc(
        "presupuesto_version_crear_borrador",
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
    version_id = str(data.get("version_id"))

    if aiu_porcentaje is not None:
        try:
            pct = float(aiu_porcentaje)
            if pct >= 0:
                sb.table("presupuesto_versiones").update({"aiu_porcentaje": pct}).eq(
                    "id", version_id
                ).execute()
        except (TypeError, ValueError):
            pass

    version = assert_version_del_contrato(sb, contrato_id, version_id)
    vivo = _aggregate_presupuesto_vivo(sb, contrato_id)
    return {
        **version,
        "items_copiados": vivo["conteo_items"],
        "conteo_items": vivo["conteo_items"],
        "costo_directo_total": vivo["costo_directo_total"],
    }


def estado_revision(sb, contrato_id: int) -> Dict[str, Any]:
    """Conteo de revisión del presupuesto vivo (Obra activo) para el aviso de 100%."""
    total = 0
    aprobados = 0
    PAGE = 1000
    offset = 0
    while True:
        batch = (
            sb.table("presupuesto")
            .select("revisado")
            .eq("contrato_id", contrato_id)
            .eq("tipo_ejecucion", PPTO_TIPO_OBRA)
            .eq("dado_de_baja", False)
            .order("id")
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
            or []
        )
        for it in batch:
            total += 1
            if (str(it.get("revisado") or "No Revisado").strip()) == "Aprobado":
                aprobados += 1
        if len(batch) < PAGE:
            break
        offset += PAGE
    pendientes = total - aprobados
    return {
        "total": total,
        "aprobados": aprobados,
        "pendientes": pendientes,
        "porcentaje_aprobado": round((aprobados / total) * 100, 2) if total else 0.0,
        "completo": total > 0 and pendientes == 0,
    }


def resumen_ejecutivo(sb, contrato_id: int, version_id: str) -> Dict[str, Any]:
    """Resumen ejecutivo (capítulos + costo directo + conteo) de una versión.

    Para el borrador activo se calcula desde el vivo; para selladas, de su snapshot.
    """
    capitulos = resumen_capitulos_version(sb, contrato_id, version_id)
    costo_directo_total = round(sum(float(c.get("costo_total") or 0) for c in capitulos), 2)
    conteo_items = int(sum(int(c.get("total_registros") or 0) for c in capitulos))
    rev = estado_revision(sb, contrato_id)
    return {
        "version_id": version_id,
        "capitulos": capitulos,
        "costo_directo_total": costo_directo_total,
        "conteo_items": conteo_items,
        "num_capitulos": len(capitulos),
        "revision": rev,
    }


def enviar_a_interventoria(sb, contrato_id: int, version_id: str, usuario_id: int) -> dict:
    """Llave 1 (contratista): marca la versión como enviada a interventoría."""
    assert_version_del_contrato(sb, contrato_id, version_id)
    res = sb.rpc(
        "presupuesto_version_enviar_interventoria",
        {
            "p_contrato_id": int(contrato_id),
            "p_version_id": str(version_id),
            "p_usuario_id": int(usuario_id),
        },
    ).execute()
    data = _rpc_result(res.data)
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="No se pudo enviar la versión a interventoría")
    return assert_version_del_contrato(sb, contrato_id, version_id)


def rechazar_version(
    sb, contrato_id: int, version_id: str, usuario_id: int, observaciones: Optional[str] = None
) -> dict:
    """Interventoría devuelve la versión a borrador editable con observaciones."""
    assert_version_del_contrato(sb, contrato_id, version_id)
    res = sb.rpc(
        "presupuesto_version_rechazar",
        {
            "p_contrato_id": int(contrato_id),
            "p_version_id": str(version_id),
            "p_usuario_id": int(usuario_id),
            "p_observaciones": (observaciones or "").strip() or None,
        },
    ).execute()
    data = _rpc_result(res.data)
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="No se pudo rechazar la versión")
    return assert_version_del_contrato(sb, contrato_id, version_id)


def sellar_version(
    sb, contrato_id: int, version_id: str, usuario_id: int, observaciones: Optional[str] = None
) -> dict:
    """Llave 2 (interventoría): aprueba y sella (congela snapshot + marca vigente aprobada)."""
    assert_version_del_contrato(sb, contrato_id, version_id)
    res = sb.rpc(
        "presupuesto_version_sellar",
        {
            "p_contrato_id": int(contrato_id),
            "p_version_id": str(version_id),
            "p_usuario_id": int(usuario_id),
            "p_observaciones": (observaciones or "").strip() or None,
        },
    ).execute()
    data = _rpc_result(res.data)
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="No se pudo sellar la versión")
    version = assert_version_del_contrato(sb, contrato_id, version_id)
    return {**version, "items_sellados": int(data.get("items_sellados", 0) or 0)}


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
    tramos: Optional[List[str]] = None,
    select: str = "capitulo, costo_directo, cant_total",
) -> List[dict]:
    """Filas de una versión. Si es la vigente, lee del presupuesto VIVO (su contenido
    real); si está congelada, lee de su snapshot en presupuesto_version_items."""
    row = assert_version_del_contrato(sb, contrato_id, version_id)
    es_vigente = bool(row.get("es_vigente"))
    tabla = "presupuesto" if es_vigente else "presupuesto_version_items"
    rows: List[dict] = []
    offset = 0
    while True:
        q = (
            sb.table(tabla)
            .select(select)
            .eq("contrato_id", contrato_id)
            .eq("dado_de_baja", False)
        )
        if es_vigente:
            q = q.eq("tipo_ejecucion", PPTO_TIPO_OBRA)
        else:
            q = q.eq("version_id", version_id)
        if capitulo:
            q = q.eq("capitulo", capitulo)
        tramo_filter = [t.strip() for t in (tramos or []) if t and str(t).strip()]
        if not tramo_filter and tramo and str(tramo).strip():
            tramo_filter = [str(tramo).strip()]
        if len(tramo_filter) == 1:
            q = q.eq("tramo", tramo_filter[0])
        elif len(tramo_filter) > 1:
            q = q.in_("tramo", tramo_filter)
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


def _version_inicial_numero(sb, contrato_id: int) -> Optional[int]:
    """numero_version de la versión inicial (la más antigua) del contrato."""
    r = (
        sb.table("presupuesto_versiones")
        .select("numero_version")
        .eq("contrato_id", contrato_id)
        .order("numero_version")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not r:
        return None
    try:
        return int(r[0]["numero_version"])
    except (TypeError, ValueError):
        return None


def eliminar_version(sb, contrato_id: int, version_id: str) -> dict:
    row = assert_version_del_contrato(sb, contrato_id, version_id)
    if row.get("es_vigente"):
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar el borrador activo.",
        )
    if row.get("es_vigente_aprobada"):
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar la versión vigente aprobada (alimenta dashboard y programación).",
        )
    # La versión inicial (V0) es el contractual de referencia y NUNCA puede eliminarse.
    inicial = _version_inicial_numero(sb, contrato_id)
    try:
        es_inicial = inicial is not None and int(row.get("numero_version")) == inicial
    except (TypeError, ValueError):
        es_inicial = False
    if es_inicial:
        raise HTTPException(
            status_code=400,
            detail="La versión inicial (contractual) no puede eliminarse bajo ninguna circunstancia.",
        )
    sb.table("presupuesto_version_items").delete().eq("version_id", version_id).execute()
    sb.table("presupuesto_versiones").delete().eq("id", version_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True, "version_id": version_id}
