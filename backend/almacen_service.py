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
        .select("id, pk_id, capitulo, item, descripcion, und, cant_total, dado_de_baja")
        .eq("contrato_id", contrato_id)
        .eq("dado_de_baja", False)
        .order("capitulo")
        .order("item")
        .execute()
        .data
        or []
    )
    return rows


def _next_consecutivo(contrato_id: int, tabla: str, col: str) -> int:
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
        return 1
    return int(rows[0].get(col) or 0) + 1


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


def _enrich_solicitud(sb, sol: dict) -> dict:
    sid = sol["id"]
    items = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", sid)
        .order("id")
        .execute()
        .data
        or []
    )
    for it in items:
        cots = (
            sb.table("almacen_cotizacion")
            .select("*")
            .eq("solicitud_item_id", it["id"])
            .order("valor_unitario")
            .execute()
            .data
            or []
        )
        it["cotizaciones"] = cots
        it["cotizaciones_count"] = len(cots)
        if it.get("insumo_id"):
            try:
                from almacen_insumos_service import get_presupuesto_context
                ctx = get_presupuesto_context(
                    sol["contrato_id"],
                    int(it["presupuesto_id"]),
                    str(it.get("pk_id") or ""),
                    _to_float(it.get("cantidad")),
                )
                it["contexto_presupuesto"] = ctx
            except Exception:
                pass
        vc = _to_float(it.get("valor_compra_unitario"))
        vlr = _to_float(it.get("vlr_unitario_cobro"))
        cant = _to_float(it.get("cantidad"))
        if vlr and vc:
            it["analisis_valor"] = {
                "costo_insumo_linea": round(vc * cant, 2),
                "valor_cobro_linea": round(vlr * cant, 2),
                "utilidad_estimada_linea": round(vlr * cant - vc * cant, 2),
            }
    sol["items"] = items
    if sol.get("estado") == "aprobada":
        oc = (
            sb.table("almacen_orden_compra")
            .select("id, numero_oc, estado, created_at")
            .eq("solicitud_id", sid)
            .limit(1)
            .execute()
            .data
            or []
        )
        sol["orden_compra"] = oc[0] if oc else None
    return sol


def list_solicitudes(contrato_id: int, estado: Optional[str] = None) -> List[dict]:
    sb = _sb()
    q = sb.table("almacen_solicitud").select("*").eq("contrato_id", contrato_id)
    if estado:
        q = q.eq("estado", estado)
    rows = q.order("created_at", desc=True).execute().data or []
    out = []
    for r in rows:
        out.append(_enrich_solicitud(sb, dict(r)))
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
        out.append({
            "presupuesto_id": pid,
            "pk_id": pk or None,
            "capitulo": ppto.get("capitulo"),
            "item": ppto.get("item"),
            "material_descripcion": mat,
            "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
            "cantidad": cant,
            "es_recurrente": bool(raw.get("es_recurrente")),
            "cant_presupuestada": _to_float(ppto.get("cant_total")),
            "valor_compra_unitario": _to_float(raw.get("valor_compra_unitario")),
            "vlr_unitario_cobro": _to_float(ppto.get("vlr_unitario")),
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
                batch_qty[key],
                exclude_solicitud_id=exclude_solicitud_id,
            )
            it["supera_presupuesto"] = ctx.get("supera_presupuesto")
            it["contexto_presupuesto"] = ctx
            it["cant_presupuestada"] = ctx.get("cant_presupuestada")
            it["vlr_unitario_cobro"] = ctx.get("vlr_unitario_cobro")
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
    for it in items:
        it["solicitud_id"] = sid
        sb.table("almacen_solicitud_item").insert(it).execute()
    return get_solicitud(contrato_id, sid)


def update_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    if sol["estado"] != "borrador":
        raise ValueError("Solo se pueden editar solicitudes en borrador.")
    upd = {}
    if "observaciones" in body:
        upd["observaciones"] = (body.get("observaciones") or "").strip() or None
    if upd:
        sb.table("almacen_solicitud").update(upd).eq("id", solicitud_id).execute()
    if "items" in body:
        sb.table("almacen_solicitud_item").delete().eq("solicitud_id", solicitud_id).execute()
        items = _validate_items_payload(body["items"], contrato_id, user_id, exclude_solicitud_id=solicitud_id)
        for it in items:
            it["solicitud_id"] = solicitud_id
            sb.table("almacen_solicitud_item").insert(it).execute()
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


def _destinatarios_validadores_almacen(contrato_id: int) -> List[int]:
    """Usuarios con permiso validar en función Almacén para el contrato."""
    sb = _sb()
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
    if not fid:
        return []
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
    if not cargo_ids:
        return []
    usuarios = (
        sb.table("usuarios")
        .select("id, cargo_id, activo, contrato_id")
        .eq("activo", True)
        .in_("cargo_id", list(cargo_ids))
        .execute()
        .data
        or []
    )
    dest = []
    for u in usuarios:
        uc = u.get("contrato_id")
        if uc is not None and int(uc) != contrato_id:
            uc_rows = (
                sb.table("usuario_contratos")
                .select("id")
                .eq("usuario_id", u["id"])
                .eq("contrato_id", contrato_id)
                .limit(1)
                .execute()
                .data
            )
            if not uc_rows:
                continue
        dest.append(int(u["id"]))
    return list(set(dest))


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
    asunto = f"Solicitud de materiales #{consecutivo} pendiente de aprobación"
    mensaje = (
        f"Hay una solicitud de materiales pendiente de su revisión.\n\n"
        f"Contrato: {num_ct}\n"
        f"Solicitud: #{consecutivo}\n\n"
        f"Abra el módulo Almacén → Validación para aprobar o rechazar."
    )
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
        })
    if rows:
        try:
            sb.table("notificaciones").insert(rows).execute()
        except Exception as exc:
            _log.warning("Notificación almacén solicitud %s: %s", solicitud_id, exc)


def enviar_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    if sol["estado"] != "borrador":
        raise ValueError("Solo se pueden enviar solicitudes en borrador.")
    if not sol.get("items"):
        raise ValueError("La solicitud debe tener al menos un material.")
    sb.table("almacen_solicitud").update({
        "estado": "enviada",
        "enviada_at": _now_iso(),
    }).eq("id", solicitud_id).execute()
    _notificar_validadores(contrato_id, solicitud_id, sol["consecutivo"], user_id)
    return get_solicitud(contrato_id, solicitud_id)


def _validar_cotizaciones_minimas(sol: dict, config: dict) -> None:
    min_cot = int(config.get("cotizaciones_minimas") or 3)
    for it in sol.get("items") or []:
        if it.get("es_recurrente"):
            continue
        n = len(it.get("cotizaciones") or [])
        if n < min_cot:
            mat = it.get("material_descripcion") or "material"
            raise ValueError(
                f"«{mat}» requiere al menos {min_cot} cotizaciones (tiene {n}). "
                "Marque como compra recurrente o agregue cotizaciones."
            )


def aprobar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: Optional[dict] = None) -> dict:
    sb = _sb()
    sol = get_solicitud(contrato_id, solicitud_id)
    if sol["estado"] != "enviada":
        raise ValueError("Solo se pueden aprobar solicitudes enviadas.")
    config = get_config(contrato_id)
    _validar_cotizaciones_minimas(sol, config)

    selecciones = {}
    if body and body.get("cotizaciones_seleccionadas"):
        for sel in body["cotizaciones_seleccionadas"]:
            selecciones[int(sel["solicitud_item_id"])] = int(sel["cotizacion_id"])

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
        cots = it.get("cotizaciones") or []
        cot_sel_id = selecciones.get(iid)
        if cot_sel_id:
            cot = next((c for c in cots if int(c["id"]) == cot_sel_id), None)
        elif cots:
            cot = min(cots, key=lambda c: _to_float(c.get("valor_unitario")))
            cot_sel_id = int(cot["id"])
        elif it.get("es_recurrente"):
            cot = None
            cot_sel_id = None
        else:
            raise ValueError(f"Sin cotización para «{it.get('material_descripcion')}».")
        if cot_sel_id:
            sb.table("almacen_solicitud_item").update({
                "cotizacion_seleccionada_id": cot_sel_id,
            }).eq("id", iid).execute()
        proveedor = (cot.get("proveedor_nombre") if cot else "Compra recurrente") or "N/D"
        vu = _to_float(cot.get("valor_unitario")) if cot else 0
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
    oc["items"] = items
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
    return oc


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


def create_entrada(contrato_id: int, user_id: int, body: dict, remision_data: Optional[bytes] = None,
                   remision_nombre: Optional[str] = None, remision_mime: Optional[str] = None) -> dict:
    sb = _sb()
    oc_id = int(body["orden_compra_id"])
    oc = get_orden_compra(contrato_id, oc_id)
    if oc.get("estado") == "anulada":
        raise ValueError("La orden de compra está anulada.")
    lineas = body.get("items") or []
    if not lineas:
        raise ValueError("Debe registrar al menos una línea de entrada.")

    entrada_row = {
        "orden_compra_id": oc_id,
        "contrato_id": contrato_id,
        "fecha_entrada": body.get("fecha_entrada") or date.today().isoformat(),
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
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

    oc_items_map = {int(x["id"]): x for x in oc.get("items") or []}

    for ln in lineas:
        oci_id = int(ln["orden_compra_item_id"])
        oci = oc_items_map.get(oci_id)
        if not oci:
            raise ValueError(f"Línea OC {oci_id} no válida.")
        qty = _to_float(ln.get("cantidad_recibida"))
        if qty <= 0:
            raise ValueError("cantidad_recibida debe ser mayor a cero.")
        pendiente = _to_float(oci.get("cantidad")) - _to_float(oci.get("cantidad_recibida"))
        if qty > pendiente + 0.0001:
            raise ValueError(
                f"Cantidad recibida ({qty}) supera lo pendiente ({pendiente}) para «{oci.get('material_descripcion')}»."
            )
        ei_row = {
            "entrada_id": entrada_id,
            "orden_compra_item_id": oci_id,
            "presupuesto_id": oci["presupuesto_id"],
            "cantidad_recibida": qty,
            "lote": (ln.get("lote") or "").strip() or None,
            "fecha_vencimiento": ln.get("fecha_vencimiento") or None,
        }
        ei_ins = sb.table("almacen_entrada_item").insert(ei_row).execute().data
        ei_id = ei_ins[0]["id"] if ei_ins else None

        new_rec = _to_float(oci.get("cantidad_recibida")) + qty
        sb.table("almacen_orden_compra_item").update({
            "cantidad_recibida": new_rec,
        }).eq("id", oci_id).execute()
        oci["cantidad_recibida"] = new_rec

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

    _actualizar_estado_oc(sb, oc_id)
    return get_entrada(contrato_id, entrada_id)


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
        .select("cantidad, cantidad_recibida")
        .eq("orden_compra_id", oc_id)
        .execute()
        .data
        or []
    )
    if not items:
        return
    completa = all(_to_float(i.get("cantidad_recibida")) >= _to_float(i.get("cantidad")) - 0.0001 for i in items)
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
