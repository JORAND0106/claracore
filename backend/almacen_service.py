"""
Servicio — módulo Almacén de Obra (Fase 1).
"""
from __future__ import annotations

import logging
import mimetypes
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from azure_blob_storage import delete_blob_private, download_blob_bytes_private, upload_blob_private

_log = logging.getLogger("claracore.almacen")

SOPORTE_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_SOPORTE_BYTES = 20 * 1024 * 1024

ESTADOS_SOLICITUD = frozenset({"borrador", "enviada", "aprobada", "rechazada"})

SOLICITUD_ITEM_DB_COLUMNS = frozenset({
    "solicitud_id",
    "presupuesto_id",
    "pk_id",
    "pk_id_id",
    "capitulo",
    "item",
    "material_descripcion",
    "unidad",
    "cantidad",
    "es_recurrente",
    "cant_presupuestada",
    "cotizacion_seleccionada_id",
    "insumo_id",
    "listado_precio_id",
    "valor_compra_unitario",
    "vlr_unitario_cobro",
    "supera_presupuesto",
    "supera_negociado",
    "tramo",
    "costado",
    "abscisa_inicial",
    "abscisa_final",
    "observacion_residente",
    "numero_linea",
})


def _norm_pk_id(pk) -> str:
    return str(pk or "").strip()


def _item_for_db_insert(item: dict) -> dict:
    """Solo columnas persistibles — excluye contexto_presupuesto, analisis_valor, etc."""
    row = {k: v for k, v in item.items() if k in SOLICITUD_ITEM_DB_COLUMNS}
    if row.get("pk_id") is not None:
        row["pk_id"] = _norm_pk_id(row.get("pk_id")) or None
    return row


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def _sb():
    from main import supabase
    return supabase


def _execute(fn):
    from main import supabase_execute
    return supabase_execute(fn)


def _to_float(v) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _safe_filename(name: str) -> str:
    base = re.sub(r"[^\w.\-]+", "_", (name or "archivo").strip())[:180]
    return base or "archivo"


def _semaforo_ratio(ratio: float) -> str:
    if ratio <= 0.8:
        return "verde"
    if ratio <= 1.0:
        return "amarillo"
    return "rojo"


def get_config(contrato_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_config")
        .select("*")
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    return {
        "contrato_id": contrato_id,
        "cotizaciones_minimas": 3,
        "dias_alerta_vencimiento": 30,
    }


def update_config(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    cot = int(body.get("cotizaciones_minimas", 3))
    dias = int(body.get("dias_alerta_vencimiento", 30))
    if cot < 1 or cot > 10:
        raise ValueError("cotizaciones_minimas debe estar entre 1 y 10.")
    if dias < 1 or dias > 365:
        raise ValueError("dias_alerta_vencimiento debe estar entre 1 y 365.")
    row = {
        "contrato_id": contrato_id,
        "cotizaciones_minimas": cot,
        "dias_alerta_vencimiento": dias,
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }
    sb.table("almacen_config").upsert(row, on_conflict="contrato_id").execute()
    return get_config(contrato_id)


def list_presupuesto_items(contrato_id: int) -> List[dict]:
    sb = _sb()
    rows = (
        sb.table("presupuesto")
        .select("id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario, dado_de_baja")
        .eq("contrato_id", contrato_id)
        .eq("dado_de_baja", False)
        .order("capitulo")
        .order("item")
        .execute()
        .data
        or []
    )
    return rows


def _max_consecutivo(contrato_id: int, tabla: str, col: str) -> int:
    sb = _sb()
    rows = (
        sb.table(tabla)
        .select(col)
        .eq("contrato_id", contrato_id)
        .order(col, desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0
    return int(rows[0].get(col) or 0)


def _next_consecutivo(contrato_id: int, tabla: str, col: str) -> int:
    return _max_consecutivo(contrato_id, tabla, col) + 1


def _fetch_ppto_row(presupuesto_id: int, contrato_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("presupuesto")
        .select("id, pk_id, capitulo, item, descripcion, und, cant_total, contrato_id")
        .eq("id", presupuesto_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Ítem de presupuesto no encontrado.")
    row = rows[0]
    if int(row.get("contrato_id") or 0) != contrato_id:
        raise ValueError("El ítem de presupuesto no pertenece a este contrato.")
    return row


def _cotizaciones_catalogo_insumo(sb, insumo_id: int) -> dict:
    """Cotizaciones del catálogo: 1 ganadora + PDFs de soporte."""
    rows = (
        sb.table("almacen_insumo")
        .select("id, soporte_pdf_blob_path, cotizacion_numero, proveedor_id, valor_compra_referencia")
        .eq("id", insumo_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {"total": 0, "ganadora": False, "soportes": 0}
    row = rows[0]
    tiene_ganadora = bool(row.get("soporte_pdf_blob_path") or row.get("cotizacion_numero"))
    soportes = (
        sb.table("almacen_insumo_cotizacion_soporte")
        .select("id")
        .eq("insumo_id", insumo_id)
        .execute()
        .data
        or []
    )
    n_sop = len(soportes)
    return {
        "total": (1 if tiene_ganadora else 0) + n_sop,
        "ganadora": tiene_ganadora,
        "soportes": n_sop,
        "valor_compra_referencia": _to_float(row.get("valor_compra_referencia")),
        "proveedor_id": row.get("proveedor_id"),
    }


def _map_usuario_nombres(sb, user_ids: List[int]) -> Dict[int, str]:
    ids = sorted({int(x) for x in user_ids if x})
    if not ids:
        return {}
    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    out: Dict[int, str] = {}
    for r in rows:
        uid = int(r["id"])
        nom = f"{r.get('nombre') or ''} {r.get('apellidos') or ''}".strip()
        out[uid] = nom or f"Usuario #{uid}"
    return out


def _nombres_validadores_pendientes(sb, contrato_id: int) -> List[str]:
    dest_ids = _destinatarios_validadores_almacen(contrato_id)
    names = _map_usuario_nombres(sb, dest_ids)
    return [names.get(i, f"Usuario #{i}") for i in sorted(dest_ids)]


def _enrich_solicitud_usuarios(sb, sol: dict, validadores_pendientes: Optional[List[str]] = None) -> dict:
    names = _map_usuario_nombres(sb, [sol.get("created_by"), sol.get("validada_by")])
    if sol.get("created_by"):
        sol["solicitante_nombre"] = names.get(int(sol["created_by"]))
    if sol.get("validada_by"):
        sol["validador_nombre"] = names.get(int(sol["validada_by"]))
    if sol.get("estado") == "enviada":
        if validadores_pendientes is None:
            validadores_pendientes = _nombres_validadores_pendientes(sb, int(sol["contrato_id"]))
        sol["validadores_pendientes"] = validadores_pendientes
    return sol


def _enrich_solicitud(sb, sol: dict, *, validadores_pendientes: Optional[List[str]] = None) -> dict:
    sid = sol["id"]
    items = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", sid)
        .order("numero_linea")
        .order("id")
        .execute()
        .data
        or []
    )
    for it in items:
        insumo_id = it.get("insumo_id")
        if insumo_id:
            cat_cot = _cotizaciones_catalogo_insumo(sb, int(insumo_id))
            it["cotizaciones_catalogo"] = cat_cot
            it["cotizaciones_count"] = cat_cot.get("total", 0)
            pid = cat_cot.get("proveedor_id")
            if pid:
                prov = (
                    sb.table("almacen_proveedor")
                    .select("razon_social")
                    .eq("id", int(pid))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if prov:
                    it["proveedor_catalogo"] = prov[0].get("razon_social")
        else:
            it["cotizaciones_catalogo"] = {"total": 0, "ganadora": False, "soportes": 0}
            it["cotizaciones_count"] = 0
        it["cotizaciones"] = []
        if insumo_id:
            try:
                from almacen_insumos_service import get_presupuesto_context
                ctx = get_presupuesto_context(
                    sol["contrato_id"],
                    int(it["presupuesto_id"]),
                    str(it.get("pk_id") or ""),
                    _to_float(it.get("cantidad")),
                    capitulo_listado=it.get("capitulo"),
                    item_listado=it.get("item"),
                )
                it["contexto_presupuesto"] = ctx
                it["vlr_unitario_cobro"] = ctx.get("vlr_unitario_cobro")
            except Exception:
                pass
            try:
                from almacen_insumos_service import get_contexto_negociado_insumo
                ctx_neg = get_contexto_negociado_insumo(
                    sol["contrato_id"],
                    int(insumo_id),
                    _to_float(it.get("cantidad")),
                )
                it["contexto_negociado"] = ctx_neg
                if ctx_neg.get("tiene_negociado"):
                    it["supera_negociado"] = bool(it.get("supera_negociado")) or ctx_neg.get("supera_negociado")
            except Exception:
                pass
        vc = _to_float(it.get("valor_compra_unitario"))
        vlr = _to_float(it.get("vlr_unitario_cobro"))
        cant = _to_float(it.get("cantidad"))
        from almacen_insumos_service import _build_analisis_valor
        it["analisis_valor"] = _build_analisis_valor(
            cant,
            vc if vc > 0 else None,
            vlr,
        )
    sol["items"] = items
    if sol.get("estado") == "aprobada":
        oc = (
            sb.table("almacen_orden_compra")
            .select("id, numero_oc, estado, created_at, pdf_blob_path, pdf_nombre")
            .eq("solicitud_id", sid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if oc:
            oc[0]["tiene_pdf_oc"] = bool(oc[0].get("pdf_blob_path"))
        sol["orden_compra"] = oc[0] if oc else None
    return _enrich_solicitud_usuarios(sb, sol, validadores_pendientes)


def list_solicitudes(contrato_id: int, estado: Optional[str] = None) -> List[dict]:
    sb = _sb()
    q = sb.table("almacen_solicitud").select("*").eq("contrato_id", contrato_id)
    if estado:
        q = q.eq("estado", estado)
    rows = q.order("created_at", desc=True).execute().data or []
    validadores_pendientes = _nombres_validadores_pendientes(sb, contrato_id)
    out = []
    for r in rows:
        out.append(_enrich_solicitud(sb, dict(r), validadores_pendientes=validadores_pendientes))
    return out


def get_solicitud(contrato_id: int, solicitud_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_solicitud")
        .select("*")
        .eq("id", solicitud_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada.")
    return _enrich_solicitud(sb, rows[0])


def _validate_items_payload(items: List[dict], contrato_id: int, user_id: int = 0, exclude_solicitud_id: Optional[int] = None) -> List[dict]:
    if not items:
        raise ValueError("Debe incluir al menos un insumo en la solicitud.")
    from almacen_insumos_service import resolve_insumo_for_solicitud

    out = []
    for raw in items:
        raw = dict(raw)
        if raw.get("exclude_solicitud_id") is None and exclude_solicitud_id:
            raw["exclude_solicitud_id"] = exclude_solicitud_id
        if raw.get("insumo_id") or raw.get("listado_precio_id"):
            resolved = resolve_insumo_for_solicitud(contrato_id, user_id, raw)
            out.append({k: v for k, v in resolved.items() if k not in ("contexto_presupuesto", "analisis_valor")})
            continue
        pid = int(raw["presupuesto_id"])
        ppto = _fetch_ppto_row(pid, contrato_id)
        cant = _to_float(raw.get("cantidad"))
        if cant <= 0:
            raise ValueError("La cantidad debe ser mayor a cero.")
        mat = (raw.get("material_descripcion") or ppto.get("descripcion") or "").strip()
        if not mat:
            raise ValueError("Cada material debe tener descripción.")
        pk = (raw.get("pk_id") or ppto.get("pk_id") or "").strip()
        cap_cobro = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or ppto.get("capitulo") or "").strip()
        item_cobro = (raw.get("presupuesto_item") or raw.get("item") or ppto.get("item") or "").strip()
        from almacen_insumos_service import get_listado_precio_unitario
        vlr_cobro = get_listado_precio_unitario(contrato_id, cap_cobro, item_cobro)
        out.append({
            "presupuesto_id": pid,
            "pk_id": pk or None,
            "capitulo": cap_cobro or ppto.get("capitulo"),
            "item": item_cobro or ppto.get("item"),
            "material_descripcion": mat,
            "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
            "cantidad": cant,
            "es_recurrente": bool(raw.get("es_recurrente")),
            "cant_presupuestada": _to_float(ppto.get("cant_total")),
            "valor_compra_unitario": _to_float(raw.get("valor_compra_unitario")),
            "vlr_unitario_cobro": vlr_cobro if vlr_cobro is not None else 0,
            "supera_presupuesto": False,
        })
    if out:
        from almacen_insumos_service import get_presupuesto_context
        from collections import defaultdict
        batch_qty: dict = defaultdict(float)
        for it in out:
            key = (int(it["presupuesto_id"]), str(it.get("pk_id") or ""))
            batch_qty[key] += _to_float(it.get("cantidad"))
        for it in out:
            key = (int(it["presupuesto_id"]), str(it.get("pk_id") or ""))
            if not it.get("pk_id"):
                continue
            ctx = get_presupuesto_context(
                contrato_id,
                int(it["presupuesto_id"]),
                str(it.get("pk_id") or ""),
                _to_float(it.get("cantidad")),
                exclude_solicitud_id=exclude_solicitud_id,
                cantidad_extra_borrador=batch_qty[key] - _to_float(it.get("cantidad")),
                descontar_linea_actual=True,
                capitulo_listado=it.get("capitulo"),
                item_listado=it.get("item"),
            )
            it["supera_presupuesto"] = ctx.get("supera_presupuesto")
            it["contexto_presupuesto"] = ctx
            it["cant_presupuestada"] = ctx.get("cant_presupuestada")
            it["vlr_unitario_cobro"] = ctx.get("vlr_unitario_cobro")
        from almacen_insumos_service import get_contexto_negociado_insumo
        batch_insumo: dict = defaultdict(float)
        for it in out:
            if it.get("insumo_id"):
                batch_insumo[int(it["insumo_id"])] += _to_float(it.get("cantidad"))
        for it in out:
            iid = it.get("insumo_id")
            if not iid:
                it["supera_negociado"] = False
                continue
            key = int(iid)
            ctx_neg = get_contexto_negociado_insumo(
                contrato_id,
                key,
                _to_float(it.get("cantidad")),
                exclude_solicitud_id=exclude_solicitud_id,
                cantidad_extra_borrador=batch_insumo[key] - _to_float(it.get("cantidad")),
            )
            it["supera_negociado"] = ctx_neg.get("supera_negociado")
            it["contexto_negociado"] = ctx_neg
    return out


def create_solicitud(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    items = _validate_items_payload(body.get("items") or [], contrato_id, user_id)
    consecutivo = _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")
    sol_row = {
        "contrato_id": contrato_id,
        "consecutivo": consecutivo,
        "estado": "borrador",
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    ins = sb.table("almacen_solicitud").insert(sol_row).execute().data
    if not ins:
        raise ValueError("No se pudo crear la solicitud.")
    sid = ins[0]["id"]
    for i, it in enumerate(items, start=1):
        row = _item_for_db_insert(it)
        row["solicitud_id"] = sid
        row["numero_linea"] = i
        sb.table("almacen_solicitud_item").insert(row).execute()
    return get_solicitud(contrato_id, sid)


def update_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    head = (
        sb.table("almacen_solicitud")
        .select("id, estado")
        .eq("id", solicitud_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not head:
        raise ValueError("Solicitud no encontrada.")
    if head[0]["estado"] != "borrador":
        raise ValueError("Solo se pueden editar solicitudes en borrador.")
    upd = {}
    if "observaciones" in body:
        upd["observaciones"] = (body.get("observaciones") or "").strip() or None
    if upd:
        sb.table("almacen_solicitud").update(upd).eq("id", solicitud_id).execute()
    if "items" in body:
        sb.table("almacen_solicitud_item").delete().eq("solicitud_id", solicitud_id).execute()
        items = _validate_items_payload(body["items"], contrato_id, user_id, exclude_solicitud_id=solicitud_id)
        for i, it in enumerate(items, start=1):
            row = _item_for_db_insert(it)
            row["solicitud_id"] = solicitud_id
            row["numero_linea"] = i
            sb.table("almacen_solicitud_item").insert(row).execute()
    return get_solicitud(contrato_id, solicitud_id)


def add_cotizacion(
    contrato_id: int,
    solicitud_item_id: int,
    user_id: int,
    body: dict,
) -> dict:
    sb = _sb()
    item_rows = (
        sb.table("almacen_solicitud_item")
        .select("id, cantidad, solicitud_id")
        .eq("id", solicitud_item_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not item_rows:
        raise ValueError("Ítem de solicitud no encontrado.")
    item = item_rows[0]
    sol_rows = (
        sb.table("almacen_solicitud")
        .select("contrato_id, estado")
        .eq("id", item["solicitud_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sol_rows or int(sol_rows[0].get("contrato_id") or 0) != contrato_id:
        raise ValueError("Ítem no pertenece a este contrato.")
    if sol_rows[0].get("estado") not in ("borrador", "enviada"):
        raise ValueError("No se pueden agregar cotizaciones en el estado actual.")
    vu = _to_float(body.get("valor_unitario"))
    if vu < 0:
        raise ValueError("valor_unitario inválido.")
    cant = _to_float(item.get("cantidad"))
    proveedor_id = body.get("proveedor_id")
    proveedor_nombre = (body.get("proveedor_nombre") or "").strip()
    if proveedor_id:
        from almacen_insumos_service import create_proveedor, upsert_insumo_proveedor_precio
        prov_rows = (
            sb.table("almacen_proveedor")
            .select("razon_social, nit")
            .eq("id", int(proveedor_id))
            .eq("contrato_id", contrato_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not prov_rows:
            raise ValueError("Proveedor no encontrado.")
        proveedor_nombre = prov_rows[0].get("razon_social") or proveedor_nombre
        item_full = (
            sb.table("almacen_solicitud_item")
            .select("insumo_id")
            .eq("id", solicitud_item_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if item_full and item_full[0].get("insumo_id"):
            try:
                upsert_insumo_proveedor_precio(
                    contrato_id,
                    int(item_full[0]["insumo_id"]),
                    int(proveedor_id),
                    vu,
                    user_id,
                )
            except Exception:
                pass
    elif body.get("razon_social") and body.get("nit"):
        from almacen_insumos_service import create_proveedor, upsert_insumo_proveedor_precio
        prov = create_proveedor(contrato_id, user_id, {
            "razon_social": body.get("razon_social"),
            "nit": body.get("nit"),
        })
        proveedor_id = prov.get("id")
        proveedor_nombre = prov.get("razon_social") or proveedor_nombre
        item_full = (
            sb.table("almacen_solicitud_item")
            .select("insumo_id")
            .eq("id", solicitud_item_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if item_full and item_full[0].get("insumo_id") and proveedor_id:
            try:
                upsert_insumo_proveedor_precio(
                    contrato_id,
                    int(item_full[0]["insumo_id"]),
                    int(proveedor_id),
                    vu,
                    user_id,
                )
            except Exception:
                pass
    row = {
        "solicitud_item_id": solicitud_item_id,
        "proveedor_id": int(proveedor_id) if proveedor_id else None,
        "proveedor_nombre": proveedor_nombre,
        "valor_unitario": vu,
        "valor_total": round(vu * cant, 2),
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    if not row["proveedor_nombre"]:
        raise ValueError("Indique el nombre del proveedor.")
    ins = sb.table("almacen_cotizacion").insert(row).execute().data
    return ins[0] if ins else row


def delete_cotizacion(contrato_id: int, cotizacion_id: int) -> None:
    sb = _sb()
    cot_rows = (
        sb.table("almacen_cotizacion")
        .select("id, solicitud_item_id")
        .eq("id", cotizacion_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not cot_rows:
        raise ValueError("Cotización no encontrada.")
    item_id = cot_rows[0]["solicitud_item_id"]
    item_rows = (
        sb.table("almacen_solicitud_item")
        .select("solicitud_id")
        .eq("id", item_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not item_rows:
        raise ValueError("Ítem de solicitud no encontrado.")
    sol_rows = (
        sb.table("almacen_solicitud")
        .select("contrato_id, estado")
        .eq("id", item_rows[0]["solicitud_id"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sol_rows or int(sol_rows[0].get("contrato_id") or 0) != contrato_id:
        raise ValueError("Cotización no pertenece a este contrato.")
    if sol_rows[0].get("estado") not in ("borrador", "enviada"):
        raise ValueError("No se puede eliminar cotización en el estado actual.")
    sb.table("almacen_cotizacion").delete().eq("id", cotizacion_id).execute()


def _usuario_tiene_acceso_contrato(sb, user_id: int, contrato_id: int) -> bool:
    urows = (
        sb.table("usuarios")
        .select("contrato_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not urows:
        return False
    uc = urows[0].get("contrato_id")
    if uc is None or int(uc) == int(contrato_id):
        return True
    uc_rows = (
        sb.table("usuario_contratos")
        .select("id")
        .eq("usuario_id", user_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
    )
    return bool(uc_rows)


def _administrador_contrato_info(sb, contrato_id: int) -> dict:
    """Nombre y correo del administrador activo del contrato (principal o usuario_contratos)."""
    cargos = sb.table("cargos").select("id, nombre").execute().data or []
    admin_cargo_ids = [
        int(c["id"])
        for c in cargos
        if _norm(c.get("nombre") or "") == "administrador"
    ]
    if not admin_cargo_ids:
        return {"nombre": "—", "email": "—"}

    admins = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, email, contrato_id, activo")
        .eq("activo", True)
        .in_("cargo_id", admin_cargo_ids)
        .execute()
        .data
        or []
    )
    for u in admins:
        if u.get("contrato_id") is not None and int(u["contrato_id"]) == int(contrato_id):
            nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
            return {
                "nombre": nom or "—",
                "email": (u.get("email") or "—").strip(),
            }

    admin_ids = [int(u["id"]) for u in admins if u.get("id") is not None]
    if admin_ids:
        uc = (
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", contrato_id)
            .in_("usuario_id", admin_ids)
            .limit(1)
            .execute()
            .data
            or []
        )
        if uc:
            uid = int(uc[0]["usuario_id"])
            for u in admins:
                if int(u["id"]) == uid:
                    nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
                    return {
                        "nombre": nom or "—",
                        "email": (u.get("email") or "—").strip(),
                    }

    return {"nombre": "—", "email": "—"}


def _destinatarios_validadores_almacen(contrato_id: int) -> List[int]:
    """Usuarios que validan solicitudes: Nivel 3 (Director de Obra), Administrador y permiso validar en Almacén."""
    sb = _sb()
    dest: set = set()

    funcs = (
        sb.table("funciones")
        .select("id, nombre")
        .execute()
        .data
        or []
    )
    fid = None
    for f in funcs:
        if _norm(f.get("nombre") or "") in ("almacén", "almacen"):
            fid = f["id"]
            break
    if fid:
        perms = (
            sb.table("permisos")
            .select("cargo_id, validar, contrato_id")
            .eq("funcion_id", fid)
            .eq("validar", True)
            .execute()
            .data
            or []
        )
        cargo_ids = set()
        for p in perms:
            pc = p.get("contrato_id")
            if pc is not None and int(pc) != contrato_id:
                continue
            if p.get("cargo_id") is not None:
                cargo_ids.add(int(p["cargo_id"]))
        if cargo_ids:
            usuarios = (
                sb.table("usuarios")
                .select("id, activo")
                .eq("activo", True)
                .in_("cargo_id", list(cargo_ids))
                .execute()
                .data
                or []
            )
            for u in usuarios:
                if _usuario_tiene_acceso_contrato(sb, int(u["id"]), contrato_id):
                    dest.add(int(u["id"]))

    cargos = (
        sb.table("cargos")
        .select("id, nombre")
        .execute()
        .data
        or []
    )
    cargo_validador_ids = []
    for c in cargos:
        n = _norm(c.get("nombre") or "")
        if n in ("director de obra", "administrador"):
            cargo_validador_ids.append(int(c["id"]))
    if cargo_validador_ids:
        usuarios = (
            sb.table("usuarios")
            .select("id, activo")
            .eq("activo", True)
            .in_("cargo_id", cargo_validador_ids)
            .execute()
            .data
            or []
        )
        for u in usuarios:
            if _usuario_tiene_acceso_contrato(sb, int(u["id"]), contrato_id):
                dest.add(int(u["id"]))

    return list(dest)


def _notificar_validadores(contrato_id: int, solicitud_id: int, consecutivo: int, remitente_id: int) -> None:
    sb = _sb()
    dest_ids = _destinatarios_validadores_almacen(contrato_id)
    if not dest_ids:
        return
    ct = (
        sb.table("contratos")
        .select("numero")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    num_ct = (ct[0].get("numero") if ct else None) or f"#{contrato_id}"
    supera_rows = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .eq("supera_presupuesto", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    supera = bool(supera_rows)
    supera_neg_rows = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .eq("supera_negociado", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    supera_neg = bool(supera_neg_rows)
    asunto = f"Solicitud de materiales #{consecutivo} pendiente de aprobación"
    if supera and supera_neg:
        asunto = f"⚠ Presupuesto y negociado — solicitud #{consecutivo}"
    elif supera:
        asunto = f"⚠ Fuera de presupuesto — solicitud #{consecutivo}"
    elif supera_neg:
        asunto = f"⚠ Supera cantidad negociada — solicitud #{consecutivo}"
    mensaje = (
        f"Hay una solicitud de materiales pendiente de su revisión.\n\n"
        f"Contrato: {num_ct}\n"
        f"Solicitud: #{consecutivo}\n"
    )
    if supera:
        mensaje += "\n⚠ Esta solicitud supera el presupuesto disponible en uno o más ítems/PK.\n"
    if supera_neg:
        mensaje += "\n⚠ Una o más líneas superan la cantidad negociada con el proveedor.\n"
    mensaje += "\nAbra el módulo Almacén → Validación para aprobar o rechazar."
    rows = []
    for did in dest_ids:
        if did == remitente_id:
            continue
        rows.append({
            "remitente_id": remitente_id,
            "remitente_nombre": "ClaraCore",
            "destinatario_id": did,
            "asunto": asunto,
            "mensaje": mensaje,
            "tipo": "SISTEMA",
            "modulo": "ALMACEN",
            "contrato_id": contrato_id,
            "entidad_tipo": "solicitud",
            "entidad_id": str(solicitud_id),
            "leido": False,
            "oculto_destinatario": False,
            "oculto_remitente": False,
        })
    if rows:
        try:
            sb.table("notificaciones").insert(rows).execute()
        except Exception as exc:
            _log.warning("Notificación almacén solicitud %s: %s", solicitud_id, exc)


def enviar_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_solicitud")
        .select("*")
        .eq("id", solicitud_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada.")
    sol = dict(rows[0])
    if sol["estado"] != "borrador":
        raise ValueError("Solo se pueden enviar solicitudes en borrador.")
    has_items = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not has_items:
        raise ValueError("La solicitud debe tener al menos un material.")
    enviada_at = _now_iso()
    sb.table("almacen_solicitud").update({
        "estado": "enviada",
        "enviada_at": enviada_at,
    }).eq("id", solicitud_id).execute()
    _notificar_validadores(contrato_id, solicitud_id, sol["consecutivo"], user_id)
    sol["estado"] = "enviada"
    sol["enviada_at"] = enviada_at
    return _enrich_solicitud_usuarios(sb, sol)


def aprobar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: Optional[dict] = None) -> dict:
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    if sol["estado"] != "enviada":
        raise ValueError("Solo se pueden aprobar solicitudes enviadas.")

    numero_oc = _next_consecutivo(contrato_id, "almacen_orden_compra", "numero_oc")
    oc_row = {
        "solicitud_id": solicitud_id,
        "contrato_id": contrato_id,
        "numero_oc": numero_oc,
        "estado": "aprobada",
        "fecha_compromiso": body.get("fecha_compromiso") if body else None,
        "aprobada_por": user_id,
    }
    oc_ins = sb.table("almacen_orden_compra").insert(oc_row).execute().data
    if not oc_ins:
        raise ValueError("No se pudo generar la orden de compra.")
    oc_id = oc_ins[0]["id"]

    for it in sol.get("items") or []:
        iid = int(it["id"])
        if it.get("es_recurrente"):
            proveedor = "Compra recurrente"
            vu = _to_float(it.get("valor_compra_unitario")) or 0
            cot_sel_id = None
        else:
            cat = it.get("cotizaciones_catalogo") or {}
            if not cat and it.get("insumo_id"):
                cat = _cotizaciones_catalogo_insumo(sb, int(it["insumo_id"]))
            vu = _to_float(it.get("valor_compra_unitario")) or _to_float(cat.get("valor_compra_referencia"))
            if vu <= 0:
                raise ValueError(
                    f"«{it.get('material_descripcion')}» no tiene precio de compra en el catálogo."
                )
            proveedor = it.get("proveedor_catalogo") or "Proveedor catálogo"
            if cat.get("proveedor_id"):
                prov = (
                    sb.table("almacen_proveedor")
                    .select("razon_social")
                    .eq("id", int(cat["proveedor_id"]))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if prov:
                    proveedor = prov[0].get("razon_social") or proveedor
            cot_sel_id = None
        sb.table("almacen_orden_compra_item").insert({
            "orden_compra_id": oc_id,
            "solicitud_item_id": iid,
            "cotizacion_id": cot_sel_id,
            "proveedor_nombre": proveedor,
            "material_descripcion": it["material_descripcion"],
            "unidad": it["unidad"],
            "cantidad": it["cantidad"],
            "valor_unitario": vu,
            "presupuesto_id": it["presupuesto_id"],
        }).execute()

    sb.table("almacen_solicitud").update({
        "estado": "aprobada",
        "validada_at": _now_iso(),
        "validada_by": user_id,
        "motivo_rechazo": None,
    }).eq("id", solicitud_id).execute()

    result = get_solicitud(contrato_id, solicitud_id)
    oc_full = get_orden_compra(contrato_id, oc_id)
    try:
        generar_y_guardar_pdf_oc(contrato_id, oc_id, oc_full, result, user_id)
    except Exception as exc:
        _log.warning("PDF OC %s no generado: %s", oc_id, exc)
    result["orden_compra_generada"] = get_orden_compra(contrato_id, oc_id)
    return result


def rechazar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, motivo: str) -> dict:
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    if sol["estado"] != "enviada":
        raise ValueError("Solo se pueden rechazar solicitudes enviadas.")
    motivo = (motivo or "").strip()
    if not motivo:
        raise ValueError("Indique el motivo del rechazo.")
    sb.table("almacen_solicitud").update({
        "estado": "rechazada",
        "validada_at": _now_iso(),
        "validada_by": user_id,
        "motivo_rechazo": motivo,
    }).eq("id", solicitud_id).execute()
    return get_solicitud(contrato_id, solicitud_id)


def anular_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    """Anula una solicitud en borrador (elimina) o enviada (marca rechazada)."""
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    estado = sol.get("estado")
    if estado not in ("borrador", "enviada"):
        raise ValueError("Solo se pueden anular solicitudes en borrador o enviadas.")
    if estado == "borrador":
        sb.table("almacen_solicitud_item").delete().eq("solicitud_id", solicitud_id).execute()
        sb.table("almacen_solicitud").delete().eq("id", solicitud_id).execute()
        return {"ok": True, "deleted": True, "id": solicitud_id}
    sb.table("almacen_solicitud").update({
        "estado": "rechazada",
        "validada_at": _now_iso(),
        "validada_by": user_id,
        "motivo_rechazo": "Anulada por el solicitante.",
    }).eq("id", solicitud_id).execute()
    return get_solicitud(contrato_id, solicitud_id)


def list_ordenes_compra(contrato_id: int) -> List[dict]:
    sb = _sb()
    rows = (
        sb.table("almacen_orden_compra")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return rows


def get_orden_compra(contrato_id: int, oc_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_orden_compra")
        .select("*")
        .eq("id", oc_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Orden de compra no encontrada.")
    oc = rows[0]
    items = (
        sb.table("almacen_orden_compra_item")
        .select("*")
        .eq("orden_compra_id", oc_id)
        .order("id")
        .execute()
        .data
        or []
    )
    oc["items"] = [{**it, **_oc_item_saldos(it)} for it in items]
    entradas = (
        sb.table("almacen_entrada")
        .select("*")
        .eq("orden_compra_id", oc_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    oc["entradas"] = entradas
    oc["tiene_pdf_oc"] = bool(oc.get("pdf_blob_path"))
    return oc


def generar_y_guardar_pdf_oc(
    contrato_id: int,
    oc_id: int,
    oc: dict,
    solicitud: dict,
    user_id: int,
) -> dict:
    sb = _sb()
    contrato_rows = (
        sb.table("contratos")
        .select("id, numero, objeto, contratista, nit, logo_contratista")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not contrato_rows:
        raise ValueError("Contrato no encontrado.")
    aprobador = "—"
    uid_apr = solicitud.get("validada_by") or oc.get("aprobada_por") or user_id
    names = _map_usuario_nombres(sb, [uid_apr, solicitud.get("created_by")])
    if uid_apr:
        aprobador = names.get(int(uid_apr), "—")
    if solicitud.get("created_by") and not solicitud.get("solicitante_nombre"):
        solicitud["solicitante_nombre"] = names.get(int(solicitud["created_by"]))

    sol_items = {int(it["id"]): it for it in (solicitud.get("items") or []) if it.get("id")}
    insumo_ids = sorted({
        int(sol_items[int(sid)]["insumo_id"])
        for it in (oc.get("items") or [])
        if (sid := it.get("solicitud_item_id"))
        and int(sid) in sol_items
        and sol_items[int(sid)].get("insumo_id")
    })
    insumo_map: dict = {}
    prov_ids: set = set()
    if insumo_ids:
        ins_rows = (
            sb.table("almacen_insumo")
            .select("id, tipo_impuesto, impuesto_porcentaje, costo_base, proveedor_id, cotizacion_vigencia")
            .in_("id", insumo_ids)
            .execute()
            .data
            or []
        )
        for r in ins_rows:
            insumo_map[int(r["id"])] = r
            if r.get("proveedor_id"):
                prov_ids.add(int(r["proveedor_id"]))

    proveedores: list = []
    terminos = ""
    if prov_ids:
        proveedores = (
            sb.table("almacen_proveedor")
            .select("id, razon_social, nit, contacto_email, contacto_nombre, contacto_telefono")
            .in_("id", list(prov_ids))
            .order("razon_social")
            .execute()
            .data
            or []
        )
    for ins in insumo_map.values():
        vig = (ins.get("cotizacion_vigencia") or "").strip()
        if vig and not terminos:
            terminos = vig
            break

    from almacen_orden_compra_pdf import generar_pdf_orden_compra

    pdf_bytes = generar_pdf_orden_compra(
        contrato=contrato_rows[0],
        orden_compra=oc,
        solicitud=solicitud,
        aprobador_nombre=aprobador,
        proveedores=proveedores,
        insumo_map=insumo_map,
        terminos=terminos,
    )
    numero = oc.get("numero_oc") or oc_id
    nombre = f"OC-{numero}.pdf"
    blob_path = f"almacen-soportes/{contrato_id}/oc-pdf/{oc_id}/{_safe_filename(nombre)}"
    upload_blob_private(blob_path, pdf_bytes, "application/pdf", overwrite=True)
    sb.table("almacen_orden_compra").update({
        "pdf_blob_path": blob_path,
        "pdf_nombre": nombre,
    }).eq("id", oc_id).execute()
    return {"pdf_blob_path": blob_path, "pdf_nombre": nombre}


def download_pdf_oc(contrato_id: int, oc_id: int, user_id: int) -> tuple[bytes, str]:
    oc = get_orden_compra(contrato_id, oc_id)
    sol_id = oc.get("solicitud_id")
    if not sol_id:
        raise ValueError("La orden de compra no tiene solicitud asociada.")
    solicitud = get_solicitud(contrato_id, int(sol_id))
    try:
        generar_y_guardar_pdf_oc(contrato_id, oc_id, oc, solicitud, user_id)
    except Exception as exc:
        if not oc.get("pdf_blob_path"):
            raise ValueError(f"No se pudo generar el PDF de la Orden de Compra: {exc}") from exc
        _log.warning("Regeneración PDF OC %s falló, usando copia previa: %s", oc_id, exc)
    oc = get_orden_compra(contrato_id, oc_id)
    if not oc.get("pdf_blob_path"):
        raise ValueError("No se pudo generar el PDF de la Orden de Compra.")
    data, _mime = download_soporte(oc.get("pdf_blob_path"))
    if not data:
        raise ValueError("El PDF de la Orden de Compra está vacío o no está disponible.")
    fname = oc.get("pdf_nombre") or f"OC-{oc.get('numero_oc')}.pdf"
    return data, fname


def _upload_soporte(contrato_id: int, subcarpeta: str, ref_id: int, data: bytes, nombre: str, mime: str) -> dict:
    if len(data) > MAX_SOPORTE_BYTES:
        raise ValueError("El archivo supera el tamaño máximo (20 MB).")
    if mime not in SOPORTE_MIMES:
        raise ValueError("Formato no permitido. Use PDF, JPEG, PNG o WebP.")
    safe = _safe_filename(nombre)
    blob_path = f"almacen-soportes/{contrato_id}/{subcarpeta}/{ref_id}/{safe}"
    upload_blob_private(blob_path, data, mime, overwrite=True)
    return {"blob_path": blob_path, "nombre": safe, "mime": mime}


def upload_factura_oc(
    contrato_id: int,
    oc_id: int,
    data: bytes,
    nombre: str,
    mime: str,
) -> dict:
    sb = _sb()
    oc = get_orden_compra(contrato_id, oc_id)
    old = oc.get("factura_blob_path")
    meta = _upload_soporte(contrato_id, "facturas-oc", oc_id, data, nombre, mime)
    sb.table("almacen_orden_compra").update({
        "factura_blob_path": meta["blob_path"],
        "factura_nombre": meta["nombre"],
        "factura_mime": meta["mime"],
    }).eq("id", oc_id).execute()
    if old and old != meta["blob_path"]:
        try:
            delete_blob_private(old)
        except Exception:
            pass
    return get_orden_compra(contrato_id, oc_id)


def download_soporte(blob_path: str) -> tuple:
    if not blob_path:
        raise ValueError("Archivo no disponible.")
    data = download_blob_bytes_private(blob_path)
    mime = mimetypes.guess_type(blob_path)[0] or "application/octet-stream"
    return data, mime


def _norm_proveedor(txt: str) -> str:
    return _norm(txt or "").lower()


def _oc_item_saldos(item: dict) -> dict:
    cant = _to_float(item.get("cantidad"))
    rec = _to_float(item.get("cantidad_recibida"))
    vu = _to_float(item.get("valor_unitario"))
    val_total = round(cant * vu, 2)
    val_rec = round(_to_float(item.get("valor_recibido")), 2)
    saldo_cant = round(max(0.0, cant - rec), 4)
    saldo_val = round(max(0.0, val_total - val_rec), 2)
    return {
        "saldo_cantidad": saldo_cant,
        "saldo_valor": saldo_val,
        "valor_total": val_total,
        "valor_recibido_acum": val_rec,
        "tiene_saldo": saldo_cant > 0.0001 and saldo_val > 0.01,
    }


ALERTA_SIN_OC_GESTIONADA = "sin_oc_gestionada"
ALERTA_OC_CONSUMIDA = "oc_consumida"
ALERTA_SILENCIOSA_MSG = {
    ALERTA_SIN_OC_GESTIONADA: (
        "Se dispuso material en un PK-ID sin Orden de Compra gestionada."
    ),
    ALERTA_OC_CONSUMIDA: (
        "La Orden de Compra de este sector ya se consumió; se debe legalizar una nueva."
    ),
}


def _resolve_proveedor_id(
    contrato_id: int,
    nombre: Optional[str] = None,
    nit: Optional[str] = None,
) -> Optional[int]:
    sb = _sb()
    nit_clean = (nit or "").strip()
    if nit_clean:
        rows = (
            sb.table("almacen_proveedor")
            .select("id")
            .eq("contrato_id", contrato_id)
            .eq("activo", True)
            .eq("nit", nit_clean)
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            return int(rows[0]["id"])
    target = _norm_proveedor(nombre or "")
    if not target:
        return None
    rows = (
        sb.table("almacen_proveedor")
        .select("id, razon_social")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    for r in rows:
        if _norm_proveedor(r.get("razon_social")) == target:
            return int(r["id"])
    return None


def _solicitud_items_por_pk(contrato_id: int, pk_id: str) -> Dict[int, dict]:
    pk_norm = _norm_pk_id(pk_id)
    if not pk_norm:
        return {}

    sb = _sb()
    sol_items = (
        sb.table("almacen_solicitud_item")
        .select("id, insumo_id, material_descripcion, unidad, pk_id, solicitud_id, presupuesto_id")
        .execute()
        .data
        or []
    )
    if not sol_items:
        return {}

    sol_ids = {int(s["solicitud_id"]) for s in sol_items if s.get("solicitud_id")}
    sol_contrato: Dict[int, dict] = {}
    if sol_ids:
        sol_rows = (
            sb.table("almacen_solicitud")
            .select("id, contrato_id, estado")
            .in_("id", list(sol_ids))
            .eq("contrato_id", contrato_id)
            .execute()
            .data
            or []
        )
        sol_contrato = {int(r["id"]): r for r in sol_rows}

    sid_pk: Dict[int, dict] = {}
    for s in sol_items:
        sid = int(s.get("solicitud_id") or 0)
        if sid not in sol_contrato:
            continue
        if _norm_pk_id(s.get("pk_id")) != pk_norm:
            continue
        sid_pk[int(s["id"])] = s
    return sid_pk


def _contexto_oc_pk_flags(contrato_id: int, pk_id: str) -> dict:
    sid_pk = _solicitud_items_por_pk(contrato_id, pk_id)
    if not sid_pk:
        return {
            "sin_oc_gestionada": True,
            "oc_consumida": False,
            "tiene_items_pk": False,
        }

    sb = _sb()
    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("id, estado")
        .eq("contrato_id", contrato_id)
        .neq("estado", "anulada")
        .execute()
        .data
        or []
    )
    if not oc_rows:
        return {
            "sin_oc_gestionada": True,
            "oc_consumida": False,
            "tiene_items_pk": True,
        }

    oc_map = {int(o["id"]): o for o in oc_rows}
    oc_items = (
        sb.table("almacen_orden_compra_item")
        .select("id, orden_compra_id, solicitud_item_id, cantidad, cantidad_recibida, valor_unitario, valor_recibido")
        .in_("orden_compra_id", list(oc_map.keys()))
        .execute()
        .data
        or []
    )
    linked = [
        it for it in oc_items
        if int(it.get("solicitud_item_id") or 0) in sid_pk
    ]
    if not linked:
        return {
            "sin_oc_gestionada": True,
            "oc_consumida": False,
            "tiene_items_pk": True,
        }

    any_vigente = False
    for it in linked:
        oc = oc_map.get(int(it["orden_compra_id"]))
        if not oc or oc.get("estado") == "anulada":
            continue
        if oc.get("estado") == "completa":
            continue
        if _oc_item_saldos(it)["tiene_saldo"]:
            any_vigente = True
            break

    if any_vigente:
        return {
            "sin_oc_gestionada": False,
            "oc_consumida": False,
            "tiene_items_pk": True,
        }
    return {
        "sin_oc_gestionada": False,
        "oc_consumida": True,
        "tiene_items_pk": True,
    }


def contexto_ordenes_compra_por_pk(contrato_id: int, pk_id: str) -> dict:
    pk_norm = _norm_pk_id(pk_id)
    if not pk_norm:
        raise ValueError("Indique el PK-ID del sector de descargue.")
    flags = _contexto_oc_pk_flags(contrato_id, pk_id)
    vigentes = buscar_ordenes_compra_por_pk(contrato_id, pk_id)
    return {**flags, "ocs_vigentes": vigentes}


def _presupuesto_material_pk_insumo(
    contrato_id: int,
    pk_id: str,
    insumo_id: int,
) -> dict:
    from almacen_insumos_service import get_insumo

    ins = get_insumo(contrato_id, int(insumo_id))
    sid_pk = _solicitud_items_por_pk(contrato_id, pk_id)
    for sol_it in sid_pk.values():
        if int(sol_it.get("insumo_id") or 0) == int(insumo_id):
            return {
                "presupuesto_id": int(sol_it["presupuesto_id"]) if sol_it.get("presupuesto_id") else None,
                "material_descripcion": sol_it.get("material_descripcion") or ins.get("descripcion"),
                "unidad": sol_it.get("unidad") or ins.get("unidad") or "UND",
            }
    for sol_it in sid_pk.values():
        if sol_it.get("presupuesto_id"):
            return {
                "presupuesto_id": int(sol_it["presupuesto_id"]),
                "material_descripcion": ins.get("descripcion") or sol_it.get("material_descripcion"),
                "unidad": ins.get("unidad") or sol_it.get("unidad") or "UND",
            }
    return {
        "presupuesto_id": None,
        "material_descripcion": ins.get("descripcion") or "—",
        "unidad": ins.get("unidad") or "UND",
    }


def _max_numero_disposicion(contrato_id: int) -> int:
    sb = _sb()
    rows = (
        sb.table("almacen_entrada")
        .select("numero_documento")
        .eq("contrato_id", contrato_id)
        .eq("tipo", "disposicion")
        .execute()
        .data
        or []
    )
    max_n = 0
    for r in rows:
        raw = (r.get("numero_documento") or "").strip()
        try:
            max_n = max(max_n, int(raw))
        except ValueError:
            pass
    return max_n


def _next_numero_disposicion(contrato_id: int) -> str:
    return f"{_max_numero_disposicion(contrato_id) + 1:05d}"


def preview_proximo_numero_disposicion(contrato_id: int) -> dict:
    return {"proximo": _next_numero_disposicion(contrato_id)}


def map_ocr_to_remision(ocr_result: dict) -> dict:
    sug = ocr_result.get("sugerencias") or {}
    out: Dict[str, Any] = {}
    if sug.get("numero_documento"):
        out["numero_documento"] = str(sug["numero_documento"])[:64]
    if sug.get("fecha"):
        out["fecha_entrada"] = str(sug["fecha"])[:10]
    return out


def ocr_remision_entrada(data: bytes, content_type: Optional[str] = None) -> dict:
    from contabilidad_ocr import analyze_invoice_bytes
    result = analyze_invoice_bytes(data, content_type)
    return {"ocr": result, "campos": map_ocr_to_remision(result)}


def buscar_ordenes_compra_vigentes(contrato_id: int, proveedor_id: int, insumo_id: int) -> List[dict]:
    from almacen_insumos_service import get_insumo

    sb = _sb()
    prov_rows = (
        sb.table("almacen_proveedor")
        .select("razon_social, nit")
        .eq("id", int(proveedor_id))
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not prov_rows:
        raise ValueError("Proveedor no inscrito en el directorio.")
    prov_key = _norm_proveedor(prov_rows[0].get("razon_social"))

    get_insumo(contrato_id, int(insumo_id))

    sol_items = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("insumo_id", int(insumo_id))
        .execute()
        .data
        or []
    )
    if not sol_items:
        return []
    sid_set = {int(s["id"]) for s in sol_items}

    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("id, numero_oc, estado, contrato_id")
        .eq("contrato_id", contrato_id)
        .neq("estado", "anulada")
        .execute()
        .data
        or []
    )
    if not oc_rows:
        return []

    oc_map = {int(o["id"]): o for o in oc_rows}
    oc_ids = list(oc_map.keys())

    oc_items = (
        sb.table("almacen_orden_compra_item")
        .select("*")
        .in_("orden_compra_id", oc_ids)
        .execute()
        .data
        or []
    )

    out: List[dict] = []
    seen: set = set()
    for it in oc_items:
        if int(it.get("solicitud_item_id") or 0) not in sid_set:
            continue
        pn = _norm_proveedor(it.get("proveedor_nombre"))
        if prov_key not in pn and pn not in prov_key:
            continue
        saldos = _oc_item_saldos(it)
        if not saldos["tiene_saldo"]:
            continue
        oc = oc_map.get(int(it["orden_compra_id"]))
        if not oc or oc.get("estado") == "completa":
            continue
        key = (int(it["orden_compra_id"]), int(it["id"]))
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "orden_compra_id": int(it["orden_compra_id"]),
            "orden_compra_item_id": int(it["id"]),
            "numero_oc": oc.get("numero_oc"),
            "estado_oc": oc.get("estado"),
            "material_descripcion": it.get("material_descripcion"),
            "unidad": it.get("unidad"),
            "cantidad": _to_float(it.get("cantidad")),
            "valor_unitario": _to_float(it.get("valor_unitario")),
            **saldos,
        })
    out.sort(key=lambda x: (-int(x.get("numero_oc") or 0), x["orden_compra_item_id"]))
    return out


def buscar_ordenes_compra_por_pk(contrato_id: int, pk_id: str) -> List[dict]:
    """OC vigentes cuyo ítem de solicitud corresponde al PK-ID indicado."""
    sid_pk = _solicitud_items_por_pk(contrato_id, pk_id)
    if not sid_pk:
        return []

    sb = _sb()
    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("id, numero_oc, estado, contrato_id")
        .eq("contrato_id", contrato_id)
        .neq("estado", "anulada")
        .execute()
        .data
        or []
    )
    if not oc_rows:
        return []

    oc_map = {int(o["id"]): o for o in oc_rows}
    oc_items = (
        sb.table("almacen_orden_compra_item")
        .select("*")
        .in_("orden_compra_id", list(oc_map.keys()))
        .execute()
        .data
        or []
    )

    insumo_ids = {int(v["insumo_id"]) for v in sid_pk.values() if v.get("insumo_id")}
    insumo_map: Dict[int, dict] = {}
    if insumo_ids:
        ins_rows = (
            sb.table("almacen_insumo")
            .select("id, codigo, descripcion, proveedor_id")
            .in_("id", list(insumo_ids))
            .execute()
            .data
            or []
        )
        insumo_map = {int(r["id"]): r for r in ins_rows}

    prov_ids = {int(r.get("proveedor_id") or 0) for r in insumo_map.values() if r.get("proveedor_id")}
    prov_map: Dict[int, dict] = {}
    if prov_ids:
        prov_rows = (
            sb.table("almacen_proveedor")
            .select("id, razon_social, nit")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        )
        prov_map = {int(p["id"]): p for p in prov_rows}

    out: List[dict] = []
    seen: set = set()
    for it in oc_items:
        sol_it = sid_pk.get(int(it.get("solicitud_item_id") or 0))
        if not sol_it:
            continue
        saldos = _oc_item_saldos(it)
        if not saldos["tiene_saldo"]:
            continue
        oc = oc_map.get(int(it["orden_compra_id"]))
        if not oc or oc.get("estado") == "completa":
            continue
        key = (int(it["orden_compra_id"]), int(it["id"]))
        if key in seen:
            continue
        seen.add(key)
        iid = int(sol_it["insumo_id"]) if sol_it.get("insumo_id") else None
        ins = insumo_map.get(iid) if iid else None
        pid = int(ins.get("proveedor_id") or 0) if ins else 0
        if not pid:
            resolved = _resolve_proveedor_id(contrato_id, it.get("proveedor_nombre"))
            if resolved:
                pid = int(resolved)
        if pid and pid not in prov_map:
            pr = (
                sb.table("almacen_proveedor")
                .select("id, razon_social, nit")
                .eq("id", pid)
                .limit(1)
                .execute()
                .data
                or []
            )
            if pr:
                prov_map[pid] = pr[0]
        prov = prov_map.get(pid) if pid else None
        out.append({
            "orden_compra_id": int(it["orden_compra_id"]),
            "orden_compra_item_id": int(it["id"]),
            "numero_oc": oc.get("numero_oc"),
            "estado_oc": oc.get("estado"),
            "material_descripcion": it.get("material_descripcion"),
            "unidad": it.get("unidad"),
            "cantidad": _to_float(it.get("cantidad")),
            "valor_unitario": _to_float(it.get("valor_unitario")),
            "insumo_id": iid,
            "proveedor_id": pid or None,
            "proveedor_nombre": (prov or {}).get("razon_social") or it.get("proveedor_nombre"),
            "proveedor_nit": (prov or {}).get("nit"),
            "pk_id": sol_it.get("pk_id"),
            **saldos,
        })
    out.sort(key=lambda x: (-int(x.get("numero_oc") or 0), x["orden_compra_item_id"]))
    return out


def _generar_pdf_pos_entrada(
    contrato_id: int,
    entrada_id: int,
    entrada_row: dict,
    oc: dict,
    oc_item: dict,
    cantidad: float,
    user_id: int,
    tipo: str,
) -> None:
    from almacen_disposicion_pdf import generar_pdf_despachador_pos

    sb = _sb()
    contrato_rows = (
        sb.table("contratos")
        .select("id, numero, objeto, contratista, nit")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not contrato_rows:
        return
    admin = _administrador_contrato_info(sb, contrato_id)
    contrato_pdf = {
        **contrato_rows[0],
        "administrador_nombre": admin["nombre"],
        "administrador_email": admin["email"],
    }
    names = _map_usuario_nombres(sb, [user_id])
    u_name = names.get(int(user_id), "—")
    prov_name = "—"
    if entrada_row.get("proveedor_id"):
        pr = (
            sb.table("almacen_proveedor")
            .select("razon_social")
            .eq("id", int(entrada_row["proveedor_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if pr:
            prov_name = pr[0].get("razon_social") or "—"
    pdf_ctx = {**entrada_row, "cantidad_recibida": cantidad}
    pdf_bytes = generar_pdf_despachador_pos(
        tipo,
        contrato_pdf,
        pdf_ctx,
        oc,
        oc_item.get("material_descripcion") or "—",
        prov_name,
        u_name,
        oc_item.get("unidad") or "",
    )
    t = (tipo or "disposicion").strip().lower()
    doc_ref = entrada_row.get("numero_documento") or entrada_id
    fname = f"{t}-{doc_ref}.pdf"
    meta = _upload_soporte(
        contrato_id,
        "disposiciones",
        entrada_id,
        pdf_bytes,
        fname,
        "application/pdf",
    )
    sb.table("almacen_entrada").update({
        "disposicion_pdf_blob_path": meta["blob_path"],
        "disposicion_pdf_nombre": meta["nombre"],
        "disposicion_pdf_mime": meta["mime"],
    }).eq("id", entrada_id).execute()


_PLACA_TRANSPORTADOR_RE = re.compile(r"^[A-Z]{3}-\d{3}$")


def _normalize_placa_transportador(placa: str) -> str:
    return (placa or "").strip().upper()


def get_transportador_por_placa(contrato_id: int, placa: str) -> Optional[dict]:
    placa_n = _normalize_placa_transportador(placa)
    if not _PLACA_TRANSPORTADOR_RE.match(placa_n):
        return None
    rows = (
        _sb()
        .table("almacen_transportador")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("placa", placa_n)
        .eq("activo", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def search_transportadores(contrato_id: int, q: str = "", limit: int = 25) -> List[dict]:
    q_n = _normalize_placa_transportador(q)
    query = (
        _sb()
        .table("almacen_transportador")
        .select("id, placa, nombre")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
    )
    if q_n:
        query = query.ilike("placa", f"%{q_n}%")
    return query.order("placa").limit(limit).execute().data or []


def upsert_transportador(contrato_id: int, user_id: int, placa: str, nombre: str) -> tuple:
    """Registra o actualiza transportador por placa. Retorna (fila, es_nuevo)."""
    placa_n = _normalize_placa_transportador(placa)
    nombre_n = (nombre or "").strip()
    if not _PLACA_TRANSPORTADOR_RE.match(placa_n):
        raise ValueError("Placa inválida (formato AAA-000).")
    if not nombre_n:
        raise ValueError("Nombre del transportador es obligatorio.")

    sb = _sb()
    existing = (
        sb.table("almacen_transportador")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("placa", placa_n)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        row = existing[0]
        upd: Dict[str, Any] = {}
        if nombre_n and row.get("nombre") != nombre_n:
            upd["nombre"] = nombre_n
        if not row.get("activo", True):
            upd["activo"] = True
        if upd:
            upd["updated_at"] = datetime.now(timezone.utc).isoformat()
            sb.table("almacen_transportador").update(upd).eq("id", row["id"]).execute()
            row.update(upd)
        return row, False

    ins_row = {
        "contrato_id": contrato_id,
        "placa": placa_n,
        "nombre": nombre_n,
        "created_by": user_id,
    }
    ins = sb.table("almacen_transportador").insert(ins_row).execute().data
    if not ins:
        raise ValueError("No se pudo registrar el transportador.")
    return ins[0], True


def download_disposicion_pdf(contrato_id: int, entrada_id: int) -> tuple:
    ent = get_entrada(contrato_id, entrada_id)
    if ent.get("tipo") not in ("disposicion", "recibo"):
        raise ValueError("Esta entrada no tiene PDF POS de Despachador.")
    path = ent.get("disposicion_pdf_blob_path")
    if not path:
        raise ValueError("PDF POS no disponible.")
    data, mime = download_soporte(path)
    fname = ent.get("disposicion_pdf_nombre") or f"entrada-{entrada_id}.pdf"
    return data, fname


def create_entrada(contrato_id: int, user_id: int, body: dict, remision_data: Optional[bytes] = None,
                   remision_nombre: Optional[str] = None, remision_mime: Optional[str] = None) -> dict:
    sb = _sb()
    lineas = body.get("items") or []
    if not lineas:
        raise ValueError("Debe registrar al menos una línea de entrada.")

    tipo = (body.get("tipo") or "recibo").strip().lower()
    if tipo not in ("disposicion", "recibo"):
        raise ValueError("Tipo de entrada inválido.")

    pk_id = (body.get("pk_id") or "").strip()
    oc_id_raw = body.get("orden_compra_id")
    oc_id = int(oc_id_raw) if oc_id_raw not in (None, "", 0) else None

    alerta_codigo = None
    alerta_detalle = None
    oc: Optional[dict] = None

    if oc_id:
        oc = get_orden_compra(contrato_id, oc_id)
        if oc.get("estado") == "anulada":
            raise ValueError("La orden de compra está anulada.")
        if oc.get("estado") == "completa":
            raise ValueError("La orden de compra ya fue consumida en su totalidad.")
    else:
        if not pk_id:
            raise ValueError("Indique el PK-ID o seleccione una orden de compra vigente.")
        flags = _contexto_oc_pk_flags(contrato_id, pk_id)
        if flags.get("sin_oc_gestionada"):
            alerta_codigo = ALERTA_SIN_OC_GESTIONADA
            alerta_detalle = ALERTA_SILENCIOSA_MSG[ALERTA_SIN_OC_GESTIONADA]
        elif flags.get("oc_consumida"):
            alerta_codigo = ALERTA_OC_CONSUMIDA
            alerta_detalle = ALERTA_SILENCIOSA_MSG[ALERTA_OC_CONSUMIDA]
        else:
            raise ValueError("Debe seleccionar una orden de compra vigente con saldo disponible.")

    proveedor_id = body.get("proveedor_id")
    if proveedor_id is not None:
        prov_check = (
            sb.table("almacen_proveedor")
            .select("id")
            .eq("id", int(proveedor_id))
            .eq("contrato_id", contrato_id)
            .eq("activo", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not prov_check:
            raise ValueError("Proveedor no inscrito en el directorio.")

    insumo_id = int(body["insumo_id"]) if body.get("insumo_id") else None
    if not insumo_id:
        raise ValueError("Indique el insumo recibido.")

    numero_doc = (body.get("numero_documento") or "").strip()
    if tipo == "disposicion" and not numero_doc:
        numero_doc = _next_numero_disposicion(contrato_id)

    numero_entrada = _next_consecutivo(contrato_id, "almacen_entrada", "numero_entrada")

    entrada_row = {
        "orden_compra_id": oc_id,
        "contrato_id": contrato_id,
        "numero_entrada": numero_entrada,
        "fecha_entrada": body.get("fecha_entrada") or date.today().isoformat(),
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
        "tipo": tipo,
        "numero_documento": numero_doc or None,
        "proveedor_id": int(proveedor_id) if proveedor_id else None,
        "insumo_id": insumo_id,
        "pk_id": pk_id or None,
        "tramo": (body.get("tramo") or "").strip() or None,
        "costado": (body.get("costado") or "").strip() or None,
        "abscisa_inicial": (body.get("abscisa_inicial") or "").strip() or None,
        "abscisa_final": (body.get("abscisa_final") or "").strip() or None,
        "placa": (body.get("placa") or "").strip() or None,
        "transportador": (body.get("transportador") or "").strip() or None,
        "alerta_silenciosa_codigo": alerta_codigo,
        "alerta_silenciosa_detalle": alerta_detalle,
    }
    ent_ins = sb.table("almacen_entrada").insert(entrada_row).execute().data
    if not ent_ins:
        raise ValueError("No se pudo crear la entrada.")
    entrada_id = ent_ins[0]["id"]

    if remision_data:
        meta = _upload_soporte(contrato_id, "remisiones", entrada_id, remision_data, remision_nombre or "remision", remision_mime or "image/jpeg")
        sb.table("almacen_entrada").update({
            "remision_blob_path": meta["blob_path"],
            "remision_nombre": meta["nombre"],
            "remision_mime": meta["mime"],
        }).eq("id", entrada_id).execute()

    oc_items_map = {int(x["id"]): x for x in (oc.get("items") or [])} if oc else {}
    primera_cantidad = 0.0
    primera_oci: Optional[dict] = None
    pdf_oc: dict = oc or {"numero_oc": "—"}

    for ln in lineas:
        qty = _to_float(ln.get("cantidad_recibida"))
        if qty <= 0:
            raise ValueError("cantidad_recibida debe ser mayor a cero.")

        oci_id_raw = ln.get("orden_compra_item_id")
        oci_id = int(oci_id_raw) if oci_id_raw not in (None, "", 0) else None

        if oci_id:
            oci = oc_items_map.get(oci_id)
            if not oci:
                raise ValueError(f"Línea OC {oci_id} no válida.")
            saldos = _oc_item_saldos(oci)
            if not saldos["tiene_saldo"]:
                raise ValueError(
                    f"La orden de compra no tiene saldo disponible para «{oci.get('material_descripcion')}»."
                )
            pendiente = saldos["saldo_cantidad"]
            if qty > pendiente + 0.0001:
                raise ValueError(
                    f"Cantidad recibida ({qty}) supera el saldo ({pendiente}) para «{oci.get('material_descripcion')}»."
                )
            valor_linea = round(qty * _to_float(oci.get("valor_unitario")), 2)
            val_pend = saldos["saldo_valor"]
            if valor_linea > val_pend + 0.01:
                raise ValueError(
                    f"El valor recibido (${valor_linea:,.0f}) supera el saldo valor (${val_pend:,.0f}) "
                    f"para «{oci.get('material_descripcion')}»."
                )
            ei_row = {
                "entrada_id": entrada_id,
                "orden_compra_item_id": oci_id,
                "presupuesto_id": oci["presupuesto_id"],
                "cantidad_recibida": qty,
                "valor_recibido": valor_linea,
                "lote": (ln.get("lote") or "").strip() or None,
                "fecha_vencimiento": ln.get("fecha_vencimiento") or None,
            }
            ei_ins = sb.table("almacen_entrada_item").insert(ei_row).execute().data
            ei_id = ei_ins[0]["id"] if ei_ins else None

            new_rec = _to_float(oci.get("cantidad_recibida")) + qty
            new_val_rec = round(_to_float(oci.get("valor_recibido")) + valor_linea, 2)
            sb.table("almacen_orden_compra_item").update({
                "cantidad_recibida": new_rec,
                "valor_recibido": new_val_rec,
            }).eq("id", oci_id).execute()
            oci["cantidad_recibida"] = new_rec
            oci["valor_recibido"] = new_val_rec

            if primera_oci is None:
                primera_cantidad = qty
                primera_oci = oci

            sb.table("almacen_movimiento").insert({
                "contrato_id": contrato_id,
                "presupuesto_id": oci["presupuesto_id"],
                "material_descripcion": oci["material_descripcion"],
                "unidad": oci["unidad"],
                "tipo": "entrada",
                "cantidad": qty,
                "entrada_item_id": ei_id,
                "referencia_tipo": "entrada",
                "referencia_id": entrada_id,
                "lote": ei_row["lote"],
                "fecha_vencimiento": ei_row["fecha_vencimiento"],
                "created_by": user_id,
            }).execute()

            _upsert_inventario(
                contrato_id,
                oci["presupuesto_id"],
                oci["material_descripcion"],
                oci["unidad"],
                qty,
                _to_float(oci.get("cantidad")),
            )
        else:
            meta_mat = _presupuesto_material_pk_insumo(contrato_id, pk_id, insumo_id)
            material = meta_mat.get("material_descripcion") or "—"
            unidad = meta_mat.get("unidad") or "UND"
            presupuesto_id = meta_mat.get("presupuesto_id")
            ei_row = {
                "entrada_id": entrada_id,
                "orden_compra_item_id": None,
                "presupuesto_id": presupuesto_id,
                "cantidad_recibida": qty,
                "valor_recibido": None,
                "lote": (ln.get("lote") or "").strip() or None,
                "fecha_vencimiento": ln.get("fecha_vencimiento") or None,
            }
            ei_ins = sb.table("almacen_entrada_item").insert(ei_row).execute().data
            ei_id = ei_ins[0]["id"] if ei_ins else None

            if presupuesto_id:
                sb.table("almacen_movimiento").insert({
                    "contrato_id": contrato_id,
                    "presupuesto_id": presupuesto_id,
                    "material_descripcion": material,
                    "unidad": unidad,
                    "tipo": "entrada",
                    "cantidad": qty,
                    "entrada_item_id": ei_id,
                    "referencia_tipo": "entrada",
                    "referencia_id": entrada_id,
                    "lote": ei_row["lote"],
                    "fecha_vencimiento": ei_row["fecha_vencimiento"],
                    "created_by": user_id,
                }).execute()
                _upsert_inventario(
                    contrato_id,
                    presupuesto_id,
                    material,
                    unidad,
                    qty,
                    qty,
                )

            if primera_oci is None:
                primera_cantidad = qty
                primera_oci = {
                    "material_descripcion": material,
                    "unidad": unidad,
                }

    if oc_id:
        _actualizar_estado_oc(sb, oc_id)

    if primera_oci is not None and tipo in ("disposicion", "recibo"):
        try:
            _generar_pdf_pos_entrada(
                contrato_id,
                entrada_id,
                {**entrada_row, "numero_documento": numero_doc or entrada_row.get("numero_documento"), "cantidad_recibida": primera_cantidad},
                pdf_oc,
                primera_oci,
                primera_cantidad,
                user_id,
                tipo,
            )
        except ValueError:
            raise
        except Exception as exc:
            _log.exception("PDF POS entrada %s: %s", entrada_id, exc)
            raise ValueError(
                "La entrada se registró, pero no se pudo generar el PDF POS. "
                "Intente nuevamente desde el detalle de la entrada."
            ) from exc
        pdf_check = (
            sb.table("almacen_entrada")
            .select("disposicion_pdf_blob_path")
            .eq("id", entrada_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not pdf_check or not pdf_check[0].get("disposicion_pdf_blob_path"):
            raise ValueError("No se pudo generar el PDF POS del registro.")

    result = get_entrada(contrato_id, entrada_id)
    placa_val = entrada_row.get("placa")
    transportador_val = entrada_row.get("transportador")
    if placa_val and transportador_val:
        _, transportador_nuevo = upsert_transportador(
            contrato_id, user_id, placa_val, transportador_val
        )
        if transportador_nuevo:
            result["transportador_registrado"] = True
    return result


def _rollback_entrada_item_line(sb, contrato_id: int, ent: dict, it: dict) -> None:
    qty = _to_float(it.get("cantidad_recibida"))
    if qty <= 0:
        return

    oci_id = it.get("orden_compra_item_id")
    presupuesto_id = it.get("presupuesto_id")
    material = (it.get("almacen_orden_compra_item") or {}).get("material_descripcion")
    unidad = (it.get("almacen_orden_compra_item") or {}).get("unidad")

    if oci_id:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("*")
            .eq("id", int(oci_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if oci_rows:
            oci = oci_rows[0]
            val_linea = _to_float(it.get("valor_recibido"))
            if val_linea <= 0:
                val_linea = round(qty * _to_float(oci.get("valor_unitario")), 2)
            new_rec = max(0.0, _to_float(oci.get("cantidad_recibida")) - qty)
            new_val = max(0.0, round(_to_float(oci.get("valor_recibido")) - val_linea, 2))
            sb.table("almacen_orden_compra_item").update({
                "cantidad_recibida": new_rec,
                "valor_recibido": new_val,
            }).eq("id", int(oci_id)).execute()
            material = material or oci.get("material_descripcion")
            unidad = unidad or oci.get("unidad")
            presupuesto_id = presupuesto_id or oci.get("presupuesto_id")

    if not material and ent.get("insumo_id"):
        meta = _presupuesto_material_pk_insumo(
            contrato_id,
            ent.get("pk_id") or "",
            int(ent["insumo_id"]),
        )
        material = meta.get("material_descripcion")
        unidad = meta.get("unidad")
        presupuesto_id = presupuesto_id or meta.get("presupuesto_id")

    if presupuesto_id and material and unidad:
        _upsert_inventario(
            contrato_id,
            int(presupuesto_id),
            material,
            unidad,
            -qty,
            0,
        )


def eliminar_entrada(contrato_id: int, entrada_id: int) -> dict:
    """
    Elimina una entrada y revierte inventario / saldo OC.
    El consecutivo solo queda libre si era el máximo (entrada N.º o documento disposición).
    """
    sb = _sb()
    ent = get_entrada(contrato_id, entrada_id)

    numero_entrada = int(ent.get("numero_entrada") or 0)
    numero_doc_raw = (ent.get("numero_documento") or "").strip()
    tipo = (ent.get("tipo") or "").strip().lower()
    oc_id = ent.get("orden_compra_id")

    max_entrada = _max_consecutivo(contrato_id, "almacen_entrada", "numero_entrada")
    max_disp = _max_numero_disposicion(contrato_id) if tipo == "disposicion" else 0

    numero_doc_int = 0
    if numero_doc_raw:
        try:
            numero_doc_int = int(numero_doc_raw)
        except ValueError:
            pass

    for it in ent.get("items") or []:
        _rollback_entrada_item_line(sb, contrato_id, ent, it)

    sb.table("almacen_movimiento").delete().eq("referencia_tipo", "entrada").eq(
        "referencia_id", int(entrada_id),
    ).execute()

    if oc_id:
        _actualizar_estado_oc(sb, int(oc_id))

    for path in (ent.get("remision_blob_path"), ent.get("disposicion_pdf_blob_path")):
        p = (path or "").strip()
        if p:
            try:
                delete_blob_private(p)
            except Exception as exc:
                _log.warning("No se pudo borrar blob entrada %s: %s", entrada_id, exc)

    sb.table("almacen_entrada").delete().eq("id", int(entrada_id)).eq(
        "contrato_id", contrato_id,
    ).execute()

    consecutivo_entrada_liberado = numero_entrada > 0 and numero_entrada == max_entrada
    consecutivo_doc_liberado = (
        numero_doc_int > 0 and tipo == "disposicion" and numero_doc_int == max_disp
    )

    return {
        "ok": True,
        "id": int(entrada_id),
        "numero_entrada": numero_entrada,
        "consecutivo_entrada_liberado": consecutivo_entrada_liberado,
        "proximo_numero_entrada": _next_consecutivo(contrato_id, "almacen_entrada", "numero_entrada"),
        "numero_documento": numero_doc_raw or None,
        "consecutivo_documento_liberado": consecutivo_doc_liberado,
        "proximo_numero_documento": _next_numero_disposicion(contrato_id) if tipo == "disposicion" else None,
    }


def _upsert_inventario(
    contrato_id: int,
    presupuesto_id: int,
    material: str,
    unidad: str,
    delta: float,
    cant_ppto: float,
) -> None:
    sb = _sb()
    existing = (
        sb.table("almacen_inventario")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("presupuesto_id", presupuesto_id)
        .eq("material_descripcion", material)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        stock = _to_float(existing[0].get("stock_disponible")) + delta
        sb.table("almacen_inventario").update({
            "stock_disponible": stock,
            "updated_at": _now_iso(),
        }).eq("id", existing[0]["id"]).execute()
    else:
        ppto = _fetch_ppto_row(presupuesto_id, contrato_id)
        cant = cant_ppto or _to_float(ppto.get("cant_total"))
        sb.table("almacen_inventario").insert({
            "contrato_id": contrato_id,
            "presupuesto_id": presupuesto_id,
            "material_descripcion": material,
            "unidad": unidad,
            "stock_disponible": delta,
            "cant_presupuestada": cant,
            "updated_at": _now_iso(),
        }).execute()


def _actualizar_estado_oc(sb, oc_id: int) -> None:
    items = (
        sb.table("almacen_orden_compra_item")
        .select("cantidad, cantidad_recibida, valor_unitario, valor_recibido")
        .eq("orden_compra_id", oc_id)
        .execute()
        .data
        or []
    )
    if not items:
        return

    def _linea_completa(i: dict) -> bool:
        cant = _to_float(i.get("cantidad"))
        rec = _to_float(i.get("cantidad_recibida"))
        vu = _to_float(i.get("valor_unitario"))
        val_total = round(cant * vu, 2)
        val_rec = round(_to_float(i.get("valor_recibido")), 2)
        return rec >= cant - 0.0001 and val_rec >= val_total - 0.01

    completa = all(_linea_completa(i) for i in items)
    parcial = any(_to_float(i.get("cantidad_recibida")) > 0 for i in items)
    estado = "completa" if completa else ("parcial" if parcial else "aprobada")
    sb.table("almacen_orden_compra").update({"estado": estado}).eq("id", oc_id).execute()


def list_entradas(contrato_id: int) -> List[dict]:
    sb = _sb()
    rows = (
        sb.table("almacen_entrada")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    for r in rows:
        if r.get("orden_compra_id"):
            oc = (
                sb.table("almacen_orden_compra")
                .select("numero_oc, solicitud_id")
                .eq("id", r.get("orden_compra_id"))
                .limit(1)
                .execute()
                .data
                or []
            )
            r["almacen_orden_compra"] = oc[0] if oc else {}
        else:
            r["almacen_orden_compra"] = {}
        if r.get("proveedor_id"):
            pr = (
                sb.table("almacen_proveedor")
                .select("razon_social")
                .eq("id", int(r["proveedor_id"]))
                .limit(1)
                .execute()
                .data
                or []
            )
            r["proveedor_nombre"] = pr[0].get("razon_social") if pr else None
        if r.get("created_by"):
            names = _map_usuario_nombres(sb, [r.get("created_by")])
            r["usuario_nombre"] = names.get(int(r["created_by"]))
    return rows


def get_entrada(contrato_id: int, entrada_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_entrada")
        .select("*")
        .eq("id", entrada_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Entrada no encontrada.")
    ent = rows[0]
    items = (
        sb.table("almacen_entrada_item")
        .select("*")
        .eq("entrada_id", entrada_id)
        .execute()
        .data
        or []
    )
    for it in items:
        oci = (
            sb.table("almacen_orden_compra_item")
            .select("material_descripcion, unidad, cantidad")
            .eq("id", it.get("orden_compra_item_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        it["almacen_orden_compra_item"] = oci[0] if oci else {}
    ent["items"] = items
    ent["cantidad_recibida_total"] = sum(_to_float(it.get("cantidad_recibida")) for it in items)
    if ent.get("orden_compra_id"):
        oc = (
            sb.table("almacen_orden_compra")
            .select("numero_oc, estado")
            .eq("id", ent.get("orden_compra_id"))
            .limit(1)
            .execute()
            .data
            or []
        )
        ent["almacen_orden_compra"] = oc[0] if oc else {}
    else:
        ent["almacen_orden_compra"] = {}
    if ent.get("proveedor_id"):
        pr = (
            sb.table("almacen_proveedor")
            .select("razon_social, nit")
            .eq("id", int(ent["proveedor_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if pr:
            ent["proveedor_nombre"] = pr[0].get("razon_social")
            ent["proveedor_nit"] = pr[0].get("nit")
    if ent.get("insumo_id"):
        ins = (
            sb.table("almacen_insumo")
            .select("codigo, descripcion, unidad")
            .eq("id", int(ent["insumo_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if ins:
            ent["insumo_label"] = f"{ins[0].get('codigo') or ''} — {ins[0].get('descripcion') or ''}".strip(' —')
            ent["insumo_unidad"] = ins[0].get("unidad")
    if ent.get("created_by"):
        names = _map_usuario_nombres(sb, [ent.get("created_by")])
        ent["usuario_nombre"] = names.get(int(ent["created_by"]))
    ent["tiene_pdf_disposicion"] = bool(ent.get("disposicion_pdf_blob_path"))
    ent["tiene_remision"] = bool(ent.get("remision_blob_path"))
    return ent


def list_inventario(contrato_id: int) -> List[dict]:
    sb = _sb()
    rows = (
        sb.table("almacen_inventario")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("material_descripcion")
        .execute()
        .data
        or []
    )
    out = []
    ppto_cache: Dict[int, dict] = {}
    for r in rows:
        pid = int(r["presupuesto_id"])
        if pid not in ppto_cache:
            try:
                ppto_cache[pid] = _fetch_ppto_row(pid, contrato_id)
            except ValueError:
                ppto_cache[pid] = {}
        ppto = ppto_cache[pid]
        stock = _to_float(r.get("stock_disponible"))
        cant = _to_float(r.get("cant_presupuestada")) or 1
        ingresado = _ingresado_acumulado(sb, contrato_id, r["presupuesto_id"], r["material_descripcion"])
        ratio_ing = ingresado / cant if cant > 0 else 0
        out.append({
            **r,
            "capitulo": ppto.get("capitulo"),
            "item": ppto.get("item"),
            "ingresado_acumulado": ingresado,
            "ratio_consumo": round(ratio_ing, 4),
            "semaforo": _semaforo_ratio(ratio_ing),
        })
    return out


def _ingresado_acumulado(sb, contrato_id: int, presupuesto_id: int, material: str) -> float:
    movs = (
        sb.table("almacen_movimiento")
        .select("cantidad, tipo")
        .eq("contrato_id", contrato_id)
        .eq("presupuesto_id", presupuesto_id)
        .eq("material_descripcion", material)
        .eq("tipo", "entrada")
        .execute()
        .data
        or []
    )
    return sum(_to_float(m.get("cantidad")) for m in movs)


def list_movimientos(contrato_id: int, presupuesto_id: int, material: Optional[str] = None) -> List[dict]:
    sb = _sb()
    q = (
        sb.table("almacen_movimiento")
        .select("*")
        .eq("contrato_id", contrato_id)
        .eq("presupuesto_id", presupuesto_id)
    )
    if material:
        q = q.eq("material_descripcion", material)
    return q.order("created_at", desc=True).execute().data or []


def alertas_vencimiento(contrato_id: int) -> List[dict]:
    sb = _sb()
    config = get_config(contrato_id)
    dias = int(config.get("dias_alerta_vencimiento") or 30)
    today = date.today()
    entradas = (
        sb.table("almacen_entrada")
        .select("id")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    entrada_ids = [e["id"] for e in entradas]
    if not entrada_ids:
        return []
    rows = (
        sb.table("almacen_entrada_item")
        .select("id, lote, fecha_vencimiento, orden_compra_item_id")
        .in_("entrada_id", entrada_ids)
        .execute()
        .data
        or []
    )
    alertas = []
    for r in rows:
        fv = r.get("fecha_vencimiento")
        if not fv:
            continue
        try:
            fd = date.fromisoformat(str(fv)[:10])
        except ValueError:
            continue
        delta = (fd - today).days
        if delta > dias:
            continue
        oci_id = r.get("orden_compra_item_id")
        mat = ""
        und = ""
        if oci_id:
            oci = (
                sb.table("almacen_orden_compra_item")
                .select("material_descripcion, unidad")
                .eq("id", oci_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if oci:
                mat = oci[0].get("material_descripcion") or ""
                und = oci[0].get("unidad") or ""
        alertas.append({
            "entrada_item_id": r["id"],
            "material_descripcion": mat,
            "lote": r.get("lote"),
            "fecha_vencimiento": fv,
            "dias_restantes": delta,
            "vencido": delta < 0,
        })
    return alertas


def get_expediente(contrato_id: int, oc_id: int) -> dict:
    oc = get_orden_compra(contrato_id, oc_id)
    sol_id = oc.get("solicitud_id")
    solicitud = get_solicitud(contrato_id, sol_id) if sol_id else None
    entradas_det = []
    for e in oc.get("entradas") or []:
        entradas_det.append(get_entrada(contrato_id, e["id"]))
    return {
        "orden_compra": oc,
        "solicitud": solicitud,
        "entradas": entradas_det,
    }
