"""
Servicio — módulo Almacén de Obra (Fase 1).
"""
from __future__ import annotations

import logging
import mimetypes
import re
import threading
import unicodedata
from datetime import date, datetime, timezone

from almacen_datetime import normalize_fecha_hora_bogota_to_utc_iso
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
    "descripcion_solicitada",
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
    "estado_validacion",
})

ESTADOS_ITEM_VALIDACION = frozenset({"pendiente", "aprobado", "rechazado"})


def _solicitud_editable(estado: str) -> bool:
    """Editable hasta generar OC (estado aprobada)."""
    return estado in ("borrador", "enviada", "rechazada")


def _norm_pk_id(pk) -> str:
    return str(pk or "").strip()


def _pk_digit_key(pk) -> str:
    return re.sub(r"\D", "", _norm_pk_id(pk))


def _pk_id_coincide(a, b) -> bool:
    """Compara PK-ID de mapa, maestro o solicitud (ej. 120350 vs CUN12-SEC3 vía dígitos)."""
    na = _norm_pk_id(a)
    nb = _norm_pk_id(b)
    if not na or not nb:
        return False
    if na.lower().replace(" ", "") == nb.lower().replace(" ", ""):
        return True
    da, db = _pk_digit_key(na), _pk_digit_key(nb)
    if not da or not db:
        return False
    return da == db or da.endswith(db) or db.endswith(da)


def _ubicacion_efectiva_entrada_items(
    sb,
    items: List[dict],
    ent_by_id: Dict[int, dict],
) -> Dict[int, dict]:
    """PK y ubicación por línea de entrada: cabecera o solicitud/OC asociada."""
    oci_ids = sorted({int(it["orden_compra_item_id"]) for it in items if it.get("orden_compra_item_id")})
    oci_map: Dict[int, dict] = {}
    sol_map: Dict[int, dict] = {}
    if oci_ids:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("id, solicitud_item_id")
            .in_("id", oci_ids)
            .execute()
            .data
            or []
        )
        oci_map = {int(r["id"]): r for r in oci_rows}
        sid_list = sorted({int(r["solicitud_item_id"]) for r in oci_rows if r.get("solicitud_item_id")})
        if sid_list:
            sol_rows = (
                sb.table("almacen_solicitud_item")
                .select("id, pk_id, tramo, costado, abscisa_inicial, abscisa_final")
                .in_("id", sid_list)
                .execute()
                .data
                or []
            )
            sol_map = {int(r["id"]): r for r in sol_rows}

    out: Dict[int, dict] = {}
    for it in items:
        ei_id = int(it["id"])
        ent = ent_by_id.get(int(it["entrada_id"]), {})
        pk = _norm_pk_id(ent.get("pk_id"))
        tramo = (ent.get("tramo") or "").strip() or None
        costado = (ent.get("costado") or "").strip() or None
        abs_ini = (ent.get("abscisa_inicial") or "").strip() or None
        abs_fin = (ent.get("abscisa_final") or "").strip() or None
        oci_id = it.get("orden_compra_item_id")
        if oci_id:
            oci = oci_map.get(int(oci_id), {})
            sid = oci.get("solicitud_item_id")
            if sid:
                sol = sol_map.get(int(sid), {})
                if not pk:
                    pk = _norm_pk_id(sol.get("pk_id"))
                if not tramo:
                    tramo = (sol.get("tramo") or "").strip() or None
                if not costado:
                    costado = (sol.get("costado") or "").strip() or None
                if not abs_ini:
                    abs_ini = _abscisa_entrada_str(sol.get("abscisa_inicial"))
                if not abs_fin:
                    abs_fin = _abscisa_entrada_str(sol.get("abscisa_final"))
        out[ei_id] = {
            "pk_id": pk or None,
            "tramo": tramo,
            "costado": costado,
            "abscisa_inicial": abs_ini,
            "abscisa_final": abs_fin,
        }
    return out


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
    rows = _fetch_ppto_rows_batch([presupuesto_id], contrato_id)
    row = rows.get(int(presupuesto_id))
    if not row:
        raise ValueError("Ítem de presupuesto no encontrado.")
    return row


def _fetch_ppto_rows_batch(presupuesto_ids: List[int], contrato_id: int) -> Dict[int, dict]:
    ids = sorted({int(x) for x in presupuesto_ids if x})
    if not ids:
        return {}
    sb = _sb()
    rows = (
        sb.table("presupuesto")
        .select(
            "id, pk_id, capitulo, item, descripcion, und, cant_total, contrato_id, "
            "tramo, abs_inicio, abs_final, no_inicio, no_final"
        )
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    out: Dict[int, dict] = {}
    for row in rows:
        if int(row.get("contrato_id") or 0) != int(contrato_id):
            continue
        out[int(row["id"])] = row
    return out


def _insert_solicitud_items_batch(sb, rows: List[dict], chunk_size: int = 80) -> None:
    if not rows:
        return
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        sb.table("almacen_solicitud_item").insert(chunk).execute()


def _cotizaciones_catalogo_batch(sb, insumo_ids: List[int]) -> Dict[int, dict]:
    """Cotizaciones de catálogo para varios insumos (2 queries)."""
    ids = sorted({int(x) for x in insumo_ids if x})
    empty = {"total": 0, "ganadora": False, "soportes": 0}
    if not ids:
        return {}
    rows = (
        sb.table("almacen_insumo")
        .select("id, soporte_pdf_blob_path, cotizacion_numero, proveedor_id, valor_compra_referencia")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    soportes = (
        sb.table("almacen_insumo_cotizacion_soporte")
        .select("id, insumo_id")
        .in_("insumo_id", ids)
        .execute()
        .data
        or []
    )
    sop_count: Dict[int, int] = {i: 0 for i in ids}
    for s in soportes:
        iid = int(s.get("insumo_id") or 0)
        if iid in sop_count:
            sop_count[iid] += 1
    out: Dict[int, dict] = {i: dict(empty) for i in ids}
    for row in rows:
        iid = int(row["id"])
        tiene_ganadora = bool(row.get("soporte_pdf_blob_path") or row.get("cotizacion_numero"))
        n_sop = sop_count.get(iid, 0)
        out[iid] = {
            "total": (1 if tiene_ganadora else 0) + n_sop,
            "ganadora": tiene_ganadora,
            "soportes": n_sop,
            "valor_compra_referencia": _to_float(row.get("valor_compra_referencia")),
            "proveedor_id": row.get("proveedor_id"),
        }
    return out


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


def _usuario_firma_url(sb, user_id: Optional[int]) -> Optional[str]:
    """URL de firma del perfil de usuario (mismo origen que informes CCD)."""
    if not user_id:
        return None
    rows = (
        sb.table("usuarios")
        .select("firma_imagen_url")
        .eq("id", int(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    url = (rows[0].get("firma_imagen_url") or "").strip()
    return url or None


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


def _strip_economics_item(it: dict) -> None:
    it.pop("analisis_valor", None)
    it.pop("analisis_rentabilidad", None)
    it.pop("valor_compra_unitario", None)
    it.pop("vlr_unitario_cobro", None)
    ctx = it.get("contexto_negociado")
    if isinstance(ctx, dict):
        ctx.pop("valor_negociado", None)


def _strip_economics_solicitud(sol: dict) -> dict:
    for it in sol.get("items") or []:
        _strip_economics_item(it)
    return sol


def _fetch_solicitud_head(contrato_id: int, solicitud_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_solicitud")
        .select("id, contrato_id, estado, created_by, consecutivo, titulo")
        .eq("id", solicitud_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada.")
    return rows[0]


def _enrich_solicitud(
    sb,
    sol: dict,
    *,
    validadores_pendientes: Optional[List[str]] = None,
    ver_economicos: bool = True,
    ligera: bool = False,
    include_rentabilidad: bool = False,
) -> dict:
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
    if ligera:
        insumo_ids = sorted({int(it["insumo_id"]) for it in items if it.get("insumo_id")})
        insumo_codigos: Dict[int, str] = {}
        if insumo_ids:
            ins_rows = (
                sb.table("almacen_insumo")
                .select("id, codigo")
                .in_("id", insumo_ids)
                .execute()
                .data
                or []
            )
            for r in ins_rows:
                cod = (r.get("codigo") or "").strip()
                if cod:
                    insumo_codigos[int(r["id"])] = cod
        for it in items:
            iid = it.get("insumo_id")
            if iid and int(iid) in insumo_codigos:
                it["insumo_codigo"] = insumo_codigos[int(iid)]
            if not ver_economicos:
                _strip_economics_item(it)
        sol["items"] = items
    else:
        from almacen_insumos_service import (
            _build_analisis_valor,
            apply_saldo_flags_batch,
            get_analisis_rentabilidad_por_oc,
        )

        insumo_ids = sorted({int(it["insumo_id"]) for it in items if it.get("insumo_id")})
        listado_ids = sorted({
            int(it["listado_precio_id"]) for it in items
            if it.get("listado_precio_id") and not it.get("insumo_id")
        })
        insumo_meta: Dict[int, dict] = {}
        if insumo_ids:
            for r in (
                sb.table("almacen_insumo")
                .select("id, codigo, descripcion, cantidad_negociada, valor_negociado_total, unidad")
                .in_("id", insumo_ids)
                .execute()
                .data
                or []
            ):
                insumo_meta[int(r["id"])] = r
        listado_codes: Dict[int, str] = {}
        if listado_ids:
            for r in (
                sb.table("listado_precios")
                .select("id, item_numero")
                .in_("id", listado_ids)
                .execute()
                .data
                or []
            ):
                listado_codes[int(r["id"])] = (r.get("item_numero") or "").strip() or None

        cot_map = _cotizaciones_catalogo_batch(sb, insumo_ids)
        prov_ids = sorted({
            int(c["proveedor_id"]) for c in cot_map.values() if c.get("proveedor_id")
        })
        prov_names: Dict[int, str] = {}
        if prov_ids:
            for r in (
                sb.table("almacen_proveedor")
                .select("id, razon_social")
                .in_("id", prov_ids)
                .execute()
                .data
                or []
            ):
                prov_names[int(r["id"])] = r.get("razon_social")

        ppto_ids = [int(it["presupuesto_id"]) for it in items if it.get("presupuesto_id")]
        ppto_map = _fetch_ppto_rows_batch(ppto_ids, int(sol["contrato_id"]))
        for it in items:
            pid = it.get("presupuesto_id")
            if pid and int(pid) in ppto_map:
                pr = ppto_map[int(pid)]
                if it.get("cant_presupuestada") is None:
                    it["cant_presupuestada"] = _to_float(pr.get("cant_total"))
                if not it.get("capitulo"):
                    it["capitulo"] = pr.get("capitulo")
                if not it.get("item"):
                    it["item"] = pr.get("item")

        apply_saldo_flags_batch(
            int(sol["contrato_id"]),
            items,
            exclude_solicitud_id=None,
            descontar_linea_actual=False,
            refresh_listado=False,
        )

        for it in items:
            insumo_id = it.get("insumo_id")
            listado_id = it.get("listado_precio_id")
            if insumo_id and int(insumo_id) in insumo_meta:
                meta = insumo_meta[int(insumo_id)]
                it["insumo_codigo"] = (meta.get("codigo") or "").strip() or None
            elif listado_id and int(listado_id) in listado_codes:
                it["insumo_codigo"] = listado_codes[int(listado_id)]
            if insumo_id:
                cat_cot = cot_map.get(int(insumo_id)) or {
                    "total": 0, "ganadora": False, "soportes": 0,
                }
                it["cotizaciones_catalogo"] = cat_cot
                it["cotizaciones_count"] = cat_cot.get("total", 0)
                pid = cat_cot.get("proveedor_id")
                if pid and int(pid) in prov_names:
                    it["proveedor_catalogo"] = prov_names[int(pid)]
            else:
                it["cotizaciones_catalogo"] = {"total": 0, "ganadora": False, "soportes": 0}
                it["cotizaciones_count"] = 0
            it["cotizaciones"] = []
            # Completar nodos/abs en contexto desde fila presupuesto
            pid = it.get("presupuesto_id")
            if pid and int(pid) in ppto_map and isinstance(it.get("contexto_presupuesto"), dict):
                pr = ppto_map[int(pid)]
                ctx = it["contexto_presupuesto"]
                ctx.setdefault("descripcion", pr.get("descripcion"))
                ctx.setdefault("unidad", pr.get("und"))
                ctx.setdefault("tramo", pr.get("tramo"))
                ctx.setdefault("abs_inicio", pr.get("abs_inicio"))
                ctx.setdefault("abs_final", pr.get("abs_final"))
                ctx.setdefault("nodo_inicio", pr.get("no_inicio"))
                ctx.setdefault("nodo_final", pr.get("no_final"))
            vc = _to_float(it.get("valor_compra_unitario"))
            vlr = _to_float(it.get("vlr_unitario_cobro"))
            cant = _to_float(it.get("cantidad"))
            it["analisis_valor"] = _build_analisis_valor(
                cant,
                vc if vc > 0 else None,
                vlr,
            )
            if include_rentabilidad and ver_economicos and it.get("id"):
                try:
                    it["analisis_rentabilidad"] = get_analisis_rentabilidad_por_oc(
                        int(sol["contrato_id"]),
                        solicitud_item_id=int(it["id"]),
                        solicitud_id=int(sid),
                        insumo_id=int(insumo_id) if insumo_id else None,
                        capitulo=it.get("capitulo") or "",
                        item_cobro=it.get("item") or "",
                        cantidad_presente=cant,
                        valor_compra_unitario=vc if vc > 0 else None,
                        valor_cobro_unitario=vlr,
                        solicitud_consecutivo=sol.get("consecutivo"),
                    )
                except Exception:
                    pass
            if not ver_economicos:
                _strip_economics_item(it)
        sol["items"] = items

    oc = (
        sb.table("almacen_orden_compra")
        .select("id, numero_oc, estado, created_at, pdf_blob_path, pdf_nombre, solicitud_id")
        .eq("solicitud_id", sid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if oc:
        oc_row = oc[0]
        oc_row["tiene_pdf_oc"] = bool(oc_row.get("pdf_blob_path"))
        sol["orden_compra"] = oc_row
        sol["tiene_orden_compra"] = True
        if sol.get("estado") != "aprobada":
            sb.table("almacen_solicitud").update({
                "estado": "aprobada",
            }).eq("id", sid).execute()
            sol["estado"] = "aprobada"
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("solicitud_item_id")
            .eq("orden_compra_id", oc_row["id"])
            .execute()
            .data
            or []
        )
        oc_item_ids = {int(r["solicitud_item_id"]) for r in oci_rows if r.get("solicitud_item_id")}
        for it in sol["items"]:
            if int(it.get("id") or 0) in oc_item_ids:
                it["en_orden_compra"] = True
                it["estado_validacion"] = "aprobado"
    else:
        sol["orden_compra"] = None
        sol["tiene_orden_compra"] = False
    return _enrich_solicitud_usuarios(sb, sol, validadores_pendientes)


def _solicitud_tiene_orden_compra(sol: dict) -> bool:
    """True si la solicitud ya tiene OC (orden_compra puede ser null explícito)."""
    if sol.get("tiene_orden_compra"):
        return True
    oc = sol.get("orden_compra")
    return bool(isinstance(oc, dict) and oc.get("id"))


def list_solicitudes(
    contrato_id: int,
    estado: Optional[str] = None,
    *,
    ver_economicos: bool = True,
    resumen: bool = True,
) -> List[dict]:
    """Lista solicitudes. Por defecto ``resumen=True`` (rápido para grilla)."""
    sb = _sb()
    q = sb.table("almacen_solicitud").select("*").eq("contrato_id", contrato_id)
    if estado:
        q = q.eq("estado", estado)
    rows = q.order("created_at", desc=True).execute().data or []
    if resumen:
        return _list_solicitudes_resumen(sb, rows, contrato_id)
    validadores_pendientes = _nombres_validadores_pendientes(sb, contrato_id)
    out = []
    for r in rows:
        out.append(_enrich_solicitud(
            sb, dict(r),
            validadores_pendientes=validadores_pendientes,
            ver_economicos=ver_economicos,
        ))
    return out


def count_solicitudes(contrato_id: int, estado: Optional[str] = None) -> int:
    """Conteo barato (badge de pendientes) sin enriquecer filas."""
    sb = _sb()
    q = (
        sb.table("almacen_solicitud")
        .select("id", count="exact")
        .eq("contrato_id", contrato_id)
    )
    if estado:
        q = q.eq("estado", estado)
    resp = q.limit(1).execute()
    if resp.count is not None:
        return int(resp.count)
    return len(resp.data or [])


def _list_solicitudes_resumen(sb, rows: List[dict], contrato_id: int) -> List[dict]:
    """Enriquecimiento mínimo para la grilla: conteo de ítems, OC y nombres."""
    if not rows:
        return []
    ids = [int(r["id"]) for r in rows if r.get("id")]
    item_counts: Dict[int, int] = {i: 0 for i in ids}
    if ids:
        # Una sola consulta de ítems (solo ids) en lugar de enriquecer cada solicitud.
        item_rows = (
            sb.table("almacen_solicitud_item")
            .select("id, solicitud_id")
            .in_("solicitud_id", ids)
            .execute()
            .data
            or []
        )
        for it in item_rows:
            sid = int(it.get("solicitud_id") or 0)
            if sid in item_counts:
                item_counts[sid] += 1

    oc_by_sol: Dict[int, dict] = {}
    if ids:
        oc_rows = (
            sb.table("almacen_orden_compra")
            .select("id, numero_oc, estado, created_at, pdf_blob_path, pdf_nombre, solicitud_id")
            .in_("solicitud_id", ids)
            .execute()
            .data
            or []
        )
        for oc in oc_rows:
            sid = int(oc.get("solicitud_id") or 0)
            if sid and sid not in oc_by_sol:
                oc = dict(oc)
                oc["tiene_pdf_oc"] = bool(oc.get("pdf_blob_path"))
                oc_by_sol[sid] = oc

    user_ids = []
    for r in rows:
        if r.get("created_by"):
            user_ids.append(int(r["created_by"]))
        if r.get("validada_by"):
            user_ids.append(int(r["validada_by"]))
    names = _map_usuario_nombres(sb, user_ids)
    validadores_pendientes = None
    if any((r.get("estado") or "") == "enviada" for r in rows):
        validadores_pendientes = _nombres_validadores_pendientes(sb, contrato_id)

    out: List[dict] = []
    for r in rows:
        sol = dict(r)
        sid = int(sol["id"])
        sol["items_count"] = item_counts.get(sid, 0)
        sol["items"] = []  # grilla usa items_count; detalle carga enrich completo
        oc = oc_by_sol.get(sid)
        if oc:
            sol["orden_compra"] = oc
            sol["tiene_orden_compra"] = True
            if sol.get("estado") != "aprobada":
                sol["estado"] = "aprobada"
        else:
            sol["orden_compra"] = None
            sol["tiene_orden_compra"] = False
        if sol.get("created_by"):
            sol["solicitante_nombre"] = names.get(int(sol["created_by"]))
        if sol.get("validada_by"):
            sol["validador_nombre"] = names.get(int(sol["validada_by"]))
        if sol.get("estado") == "enviada":
            sol["validadores_pendientes"] = validadores_pendientes or []
        out.append(sol)
    return out


def get_solicitud(
    contrato_id: int,
    solicitud_id: int,
    *,
    ver_economicos: bool = True,
    ligera: bool = False,
    include_rentabilidad: bool = False,
) -> dict:
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
    return _enrich_solicitud(
        sb,
        rows[0],
        ver_economicos=ver_economicos,
        ligera=ligera,
        include_rentabilidad=include_rentabilidad,
    )


def _validate_items_payload(items: List[dict], contrato_id: int, user_id: int = 0, exclude_solicitud_id: Optional[int] = None) -> List[dict]:
    if not items:
        raise ValueError("Debe incluir al menos un material en la solicitud.")
    from almacen_insumos_service import apply_saldo_flags_batch, resolve_insumo_for_solicitud

    # Prefetch presupuesto rows (una query) para líneas sin resolve_insumo.
    ppto_ids_prefetch = []
    for raw in items:
        desc_sol = (raw.get("descripcion_solicitada") or "").strip()
        if raw.get("insumo_id") or raw.get("listado_precio_id"):
            continue
        if raw.get("presupuesto_id"):
            ppto_ids_prefetch.append(int(raw["presupuesto_id"]))
    ppto_cache = _fetch_ppto_rows_batch(ppto_ids_prefetch, contrato_id)

    out = []
    for raw in items:
        raw = dict(raw)
        if raw.get("exclude_solicitud_id") is None and exclude_solicitud_id:
            raw["exclude_solicitud_id"] = exclude_solicitud_id
        # Flujo nuevo: Contratista describe en texto libre (sin insumo).
        # Solo resuelve catálogo si llega insumo_id/listado (legado o mapeo Gerencial vía PATCH).
        desc_sol = (raw.get("descripcion_solicitada") or "").strip()
        if desc_sol and not raw.get("insumo_id") and not raw.get("listado_precio_id"):
            pid = int(raw["presupuesto_id"])
            ppto = ppto_cache.get(pid) or _fetch_ppto_row(pid, contrato_id)
            cant = _to_float(raw.get("cantidad"))
            if cant <= 0:
                raise ValueError("La cantidad debe ser mayor a cero.")
            if len(desc_sol) < 3:
                raise ValueError("Describa el material solicitado (mínimo 3 caracteres).")
            pk = (raw.get("pk_id") or ppto.get("pk_id") or "").strip()
            cap_cobro = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or ppto.get("capitulo") or "").strip()
            item_cobro = (raw.get("presupuesto_item") or raw.get("item") or ppto.get("item") or "").strip()
            out.append({
                "presupuesto_id": pid,
                "pk_id": pk or None,
                "pk_id_id": raw.get("pk_id_id"),
                "capitulo": cap_cobro or ppto.get("capitulo"),
                "item": item_cobro or ppto.get("item"),
                "descripcion_solicitada": desc_sol,
                "material_descripcion": desc_sol,
                "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
                "cantidad": cant,
                "es_recurrente": bool(raw.get("es_recurrente")),
                "cant_presupuestada": _to_float(ppto.get("cant_total")),
                "valor_compra_unitario": None,
                "vlr_unitario_cobro": 0,
                "supera_presupuesto": False,
                "supera_negociado": False,
                "tramo": raw.get("tramo"),
                "costado": raw.get("costado"),
                "abscisa_inicial": raw.get("abscisa_inicial"),
                "abscisa_final": raw.get("abscisa_final"),
                "observacion_residente": raw.get("observacion_residente"),
                "insumo_id": None,
                "listado_precio_id": None,
            })
            continue
        if raw.get("insumo_id") or raw.get("listado_precio_id"):
            resolved = resolve_insumo_for_solicitud(
                contrato_id, user_id, raw, skip_context=True
            )
            # Conservar descripción solicitada si venía (legado / remapeo)
            if desc_sol:
                resolved["descripcion_solicitada"] = desc_sol
            elif not resolved.get("descripcion_solicitada"):
                resolved["descripcion_solicitada"] = (
                    raw.get("descripcion_solicitada")
                    or resolved.get("material_descripcion")
                )
            out.append({k: v for k, v in resolved.items() if k not in ("contexto_presupuesto", "analisis_valor")})
            continue
        pid = int(raw["presupuesto_id"])
        ppto = ppto_cache.get(pid) or _fetch_ppto_row(pid, contrato_id)
        cant = _to_float(raw.get("cantidad"))
        if cant <= 0:
            raise ValueError("La cantidad debe ser mayor a cero.")
        mat = (raw.get("material_descripcion") or desc_sol or ppto.get("descripcion") or "").strip()
        if not mat:
            raise ValueError("Cada material debe tener descripción.")
        pk = (raw.get("pk_id") or ppto.get("pk_id") or "").strip()
        cap_cobro = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or ppto.get("capitulo") or "").strip()
        item_cobro = (raw.get("presupuesto_item") or raw.get("item") or ppto.get("item") or "").strip()
        out.append({
            "presupuesto_id": pid,
            "pk_id": pk or None,
            "capitulo": cap_cobro or ppto.get("capitulo"),
            "item": item_cobro or ppto.get("item"),
            "descripcion_solicitada": desc_sol or mat,
            "material_descripcion": mat,
            "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
            "cantidad": cant,
            "es_recurrente": bool(raw.get("es_recurrente")),
            "cant_presupuestada": _to_float(ppto.get("cant_total")),
            "valor_compra_unitario": _to_float(raw.get("valor_compra_unitario")) or None,
            "vlr_unitario_cobro": 0,
            "supera_presupuesto": False,
        })
    if out:
        # Una pasada: listado cacheado + acumulados en lote (sin N× get_presupuesto_context).
        apply_saldo_flags_batch(
            contrato_id,
            out,
            exclude_solicitud_id=exclude_solicitud_id,
            descontar_linea_actual=True,
        )
    return out


def mapear_item_solicitud_gerencial(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    body: dict,
) -> dict:
    """
    Contratista Gerencial: asocia insumo del catálogo, ajusta cantidad/costo/cobro.
    Conserva descripcion_solicitada inmutable.
    """
    from almacen_insumos_service import apply_saldo_flags_batch, resolve_insumo_for_solicitud

    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "borrador", "rechazada"):
        raise ValueError("No se puede mapear ítems en el estado actual de la solicitud.")
    oc_exists = (
        sb.table("almacen_orden_compra")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if oc_exists:
        raise ValueError("Esta solicitud ya tiene Orden de Compra generada.")

    item_rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("id", int(item_id))
        .eq("solicitud_id", int(solicitud_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not item_rows:
        raise ValueError("Ítem de solicitud no encontrado.")
    existing = item_rows[0]

    insumo_id = body.get("insumo_id")
    if not insumo_id:
        raise ValueError("Seleccione el insumo del catálogo.")
    cantidad = _to_float(body.get("cantidad") if body.get("cantidad") is not None else existing.get("cantidad"))
    if cantidad <= 0:
        raise ValueError("La cantidad debe ser mayor a cero.")

    raw = {
        "insumo_id": int(insumo_id),
        "presupuesto_id": existing.get("presupuesto_id"),
        "presupuesto_capitulo": existing.get("capitulo"),
        "presupuesto_item": existing.get("item"),
        "pk_id": existing.get("pk_id"),
        "pk_id_id": existing.get("pk_id_id"),
        "cantidad": cantidad,
        "es_recurrente": bool(body.get("es_recurrente", existing.get("es_recurrente"))),
        "exclude_solicitud_id": solicitud_id,
        "tramo": existing.get("tramo"),
        "costado": existing.get("costado"),
        "abscisa_inicial": existing.get("abscisa_inicial"),
        "abscisa_final": existing.get("abscisa_final"),
        "observacion_residente": existing.get("observacion_residente"),
    }
    if body.get("valor_compra_unitario") is not None:
        raw["valor_compra_unitario"] = body.get("valor_compra_unitario")

    # skip_context: flags se calculan en batch sin N× context; listado solo si falta cobro.
    resolved = resolve_insumo_for_solicitud(contrato_id, user_id, raw, skip_context=True)
    desc_sol = (existing.get("descripcion_solicitada") or existing.get("material_descripcion") or "").strip()

    if body.get("vlr_unitario_cobro") is not None:
        resolved["vlr_unitario_cobro"] = _to_float(body["vlr_unitario_cobro"])
    apply_saldo_flags_batch(
        contrato_id,
        [resolved],
        exclude_solicitud_id=solicitud_id,
        descontar_linea_actual=True,
        refresh_listado=resolved.get("vlr_unitario_cobro") in (None, 0),
    )

    patch = {
        "insumo_id": resolved.get("insumo_id"),
        "listado_precio_id": resolved.get("listado_precio_id"),
        "material_descripcion": resolved.get("material_descripcion"),
        "descripcion_solicitada": desc_sol or resolved.get("material_descripcion"),
        "unidad": resolved.get("unidad") or existing.get("unidad"),
        "cantidad": cantidad,
        "valor_compra_unitario": (
            _to_float(body["valor_compra_unitario"])
            if body.get("valor_compra_unitario") is not None
            else resolved.get("valor_compra_unitario")
        ),
        "vlr_unitario_cobro": (
            _to_float(body["vlr_unitario_cobro"])
            if body.get("vlr_unitario_cobro") is not None
            else resolved.get("vlr_unitario_cobro")
        ),
        "supera_presupuesto": resolved.get("supera_presupuesto", False),
        "supera_negociado": resolved.get("supera_negociado", False),
        "es_recurrente": bool(body.get("es_recurrente", existing.get("es_recurrente"))),
    }
    if patch["valor_compra_unitario"] is not None and _to_float(patch["valor_compra_unitario"]) < 0:
        raise ValueError("El costo de compra no puede ser negativo.")
    if patch["vlr_unitario_cobro"] is not None and _to_float(patch["vlr_unitario_cobro"]) < 0:
        raise ValueError("El valor de cobro no puede ser negativo.")

    sb.table("almacen_solicitud_item").update(patch).eq("id", int(item_id)).execute()
    return get_solicitud(contrato_id, solicitud_id)


def create_solicitud(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    items = _validate_items_payload(body.get("items") or [], contrato_id, user_id)
    consecutivo = _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")
    sol_row = {
        "contrato_id": contrato_id,
        "consecutivo": consecutivo,
        "estado": "borrador",
        "titulo": (body.get("titulo") or "").strip() or None,
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    ins = sb.table("almacen_solicitud").insert(sol_row).execute().data
    if not ins:
        raise ValueError("No se pudo crear la solicitud.")
    sid = ins[0]["id"]
    rows = []
    for i, it in enumerate(items, start=1):
        row = _item_for_db_insert(it)
        row["solicitud_id"] = sid
        row["numero_linea"] = i
        rows.append(row)
    _insert_solicitud_items_batch(sb, rows)
    # Respuesta ligera: el formulario no necesita contexto/rentabilidad por línea.
    return get_solicitud(contrato_id, sid, ligera=True)


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
    estado = head[0]["estado"]
    aprobada = estado == "aprobada"
    if aprobada:
        if "items" in body:
            raise ValueError("La solicitud aprobada solo permite editar el título.")
        upd = {}
        if "titulo" in body:
            upd["titulo"] = (body.get("titulo") or "").strip() or None
        if not upd:
            raise ValueError("La solicitud aprobada solo permite editar el título.")
        sb.table("almacen_solicitud").update(upd).eq("id", solicitud_id).execute()
        return get_solicitud(contrato_id, solicitud_id, ligera=True)
    if not _solicitud_editable(estado):
        raise ValueError("La solicitud ya fue aprobada y no puede editarse.")
    upd = {}
    if "titulo" in body:
        upd["titulo"] = (body.get("titulo") or "").strip() or None
    if "observaciones" in body:
        upd["observaciones"] = (body.get("observaciones") or "").strip() or None
    if upd:
        sb.table("almacen_solicitud").update(upd).eq("id", solicitud_id).execute()
    if "items" in body:
        sb.table("almacen_solicitud_item").delete().eq("solicitud_id", solicitud_id).execute()
        items = _validate_items_payload(body["items"], contrato_id, user_id, exclude_solicitud_id=solicitud_id)
        rows = []
        for i, it in enumerate(items, start=1):
            row = _item_for_db_insert(it)
            row["solicitud_id"] = solicitud_id
            row["numero_linea"] = i
            if estado in ("enviada", "rechazada"):
                row["estado_validacion"] = "pendiente"
            rows.append(row)
        _insert_solicitud_items_batch(sb, rows)
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


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


def _administradores_contrato_contactos(sb, contrato_id: int) -> List[dict]:
    """Administradores activos del contrato (principal o usuario_contratos)."""
    cargos = sb.table("cargos").select("id, nombre").execute().data or []
    admin_cargo_ids = [
        int(c["id"])
        for c in cargos
        if _norm(c.get("nombre") or "") == "administrador"
    ]
    if not admin_cargo_ids:
        return [{"nombre": "—", "email": "—"}]

    admins = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, email, contrato_id, activo")
        .eq("activo", True)
        .in_("cargo_id", admin_cargo_ids)
        .execute()
        .data
        or []
    )
    out: List[dict] = []
    seen: set = set()

    def _append(u: dict) -> None:
        uid = int(u["id"])
        if uid in seen:
            return
        seen.add(uid)
        nom = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
        out.append({
            "nombre": nom or "—",
            "email": (u.get("email") or "—").strip(),
        })

    for u in admins:
        if u.get("contrato_id") is not None and int(u["contrato_id"]) == int(contrato_id):
            _append(u)

    admin_ids = [int(u["id"]) for u in admins if u.get("id") is not None]
    if admin_ids:
        uc = (
            sb.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", contrato_id)
            .in_("usuario_id", admin_ids)
            .execute()
            .data
            or []
        )
        linked = {int(r["usuario_id"]) for r in uc}
        for u in admins:
            if int(u["id"]) in linked:
                _append(u)

    if not out:
        return [{"nombre": "—", "email": "—"}]
    out.sort(key=lambda x: (x.get("nombre") or "").lower())
    return out


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
    if sol["estado"] not in ("borrador", "rechazada"):
        raise ValueError("Solo se pueden enviar solicitudes en borrador o rechazadas para reenvío.")
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
        "motivo_rechazo": None,
        "validada_at": None,
        "validada_by": None,
    }).eq("id", solicitud_id).execute()
    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "pendiente",
    }).eq("solicitud_id", solicitud_id).execute()
    _notificar_validadores(contrato_id, solicitud_id, sol["consecutivo"], user_id)
    sol["estado"] = "enviada"
    sol["enviada_at"] = enviada_at
    sol["motivo_rechazo"] = None
    return _enrich_solicitud_usuarios(sb, sol)


def validar_item_solicitud(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    accion: str,
    motivo: Optional[str] = None,
) -> dict:
    """Aprueba o rechaza un ítem individual de una solicitud enviada."""
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] != "enviada":
        raise ValueError("Solo se pueden validar ítems de solicitudes enviadas.")
    oc_exists = (
        sb.table("almacen_orden_compra")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if oc_exists:
        raise ValueError("Esta solicitud ya tiene Orden de Compra generada.")
    accion = _norm(accion)
    if accion not in ("aprobar", "rechazar"):
        raise ValueError("Acción inválida. Use aprobar o rechazar.")
    item_rows = (
        sb.table("almacen_solicitud_item")
        .select("id, solicitud_id")
        .eq("id", item_id)
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not item_rows:
        raise ValueError("Ítem de solicitud no encontrado.")
    nuevo = "aprobado" if accion == "aprobar" else "rechazado"
    if accion == "rechazar" and not (motivo or "").strip():
        raise ValueError("Indique el motivo del rechazo del ítem.")
    upd = {"estado_validacion": nuevo}
    sb.table("almacen_solicitud_item").update(upd).eq("id", item_id).execute()
    return get_solicitud(contrato_id, solicitud_id)


def aprobar_todos_items_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    """Marca como aprobados todos los ítems pendientes de una solicitud enviada."""
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] != "enviada":
        raise ValueError("Solo aplica a solicitudes enviadas.")
    oc_exists = (
        sb.table("almacen_orden_compra")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if oc_exists:
        raise ValueError("Esta solicitud ya tiene Orden de Compra generada.")
    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "aprobado",
    }).eq("solicitud_id", solicitud_id).eq("estado_validacion", "pendiente").execute()
    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "aprobado",
    }).eq("solicitud_id", solicitud_id).is_("estado_validacion", "null").execute()
    return get_solicitud(contrato_id, solicitud_id)


def aprobar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: Optional[dict] = None) -> dict:
    sb = _sb()
    body = body or {}
    # Evitar enrich completo (listado/contexto): solo cabecera + ítems crudos.
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] != "enviada":
        raise ValueError("Solo se pueden aprobar solicitudes enviadas.")
    existing_oc = (
        sb.table("almacen_orden_compra")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing_oc:
        raise ValueError("Esta solicitud ya tiene Orden de Compra generada.")

    if body.get("aprobar_todos_pendientes", True):
        sb.table("almacen_solicitud_item").update({
            "estado_validacion": "aprobado",
        }).eq("solicitud_id", solicitud_id).eq("estado_validacion", "pendiente").execute()
        sb.table("almacen_solicitud_item").update({
            "estado_validacion": "aprobado",
        }).eq("solicitud_id", solicitud_id).is_("estado_validacion", "null").execute()

    # Recargar ítems desde BD (pueden haberse mapeado tras el GET inicial)
    fresh_items = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    items_aprobados = []
    for it in fresh_items:
        ev = it.get("estado_validacion") or "pendiente"
        if ev != "aprobado":
            continue
        merged = dict(it)
        if not merged.get("insumo_id") and not merged.get("es_recurrente"):
            raise ValueError(
                f"Línea {merged.get('numero_linea') or merged.get('id')}: "
                "el Contratista Gerencial debe seleccionar el insumo del catálogo antes de aprobar."
            )
        vu = _to_float(merged.get("valor_compra_unitario"))
        if vu <= 0 and not merged.get("es_recurrente"):
            raise ValueError(
                f"Línea {merged.get('numero_linea') or merged.get('id')}: "
                "defina el costo de compra unitario antes de generar la OC."
            )
        items_aprobados.append(merged)
    if not items_aprobados:
        raise ValueError("Debe aprobar al menos un ítem antes de generar la Orden de Compra.")

    insumo_ids = sorted({
        int(it["insumo_id"]) for it in items_aprobados
        if it.get("insumo_id") and not it.get("es_recurrente")
    })
    cat_map = _cotizaciones_catalogo_batch(sb, insumo_ids)
    prov_ids: set = set()
    for cat in cat_map.values():
        if cat.get("proveedor_id"):
            prov_ids.add(int(cat["proveedor_id"]))
    prov_nombres: Dict[int, str] = {}
    if prov_ids:
        prov_rows = (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        )
        prov_nombres = {int(r["id"]): (r.get("razon_social") or "") for r in prov_rows}

    numero_oc = _next_consecutivo(contrato_id, "almacen_orden_compra", "numero_oc")
    aprobador_firma = _usuario_firma_url(sb, user_id)
    if not aprobador_firma:
        raise ValueError(
            "Configure la imagen de firma en su perfil de usuario antes de aprobar y generar la Orden de Compra."
        )
    solicitante_firma = _usuario_firma_url(sb, sol.get("created_by"))
    oc_row = {
        "solicitud_id": solicitud_id,
        "contrato_id": contrato_id,
        "numero_oc": numero_oc,
        "estado": "aprobada",
        "fecha_compromiso": body.get("fecha_compromiso") if body else None,
        "aprobada_por": user_id,
        "aprobador_firma_imagen_url": aprobador_firma,
        "solicitante_firma_imagen_url": solicitante_firma,
    }
    oc_ins = sb.table("almacen_orden_compra").insert(oc_row).execute().data
    if not oc_ins:
        raise ValueError("No se pudo generar la orden de compra.")
    oc_id = oc_ins[0]["id"]

    for it in items_aprobados:
        iid = int(it["id"])
        if it.get("es_recurrente"):
            proveedor = "Compra recurrente"
            vu = _to_float(it.get("valor_compra_unitario")) or 0
            cot_sel_id = None
        else:
            cat = it.get("cotizaciones_catalogo") or {}
            if not cat and it.get("insumo_id"):
                cat = cat_map.get(int(it["insumo_id"])) or _cotizaciones_catalogo_insumo(sb, int(it["insumo_id"]))
            vu = _to_float(it.get("valor_compra_unitario")) or _to_float(cat.get("valor_compra_referencia"))
            if vu <= 0:
                raise ValueError(
                    f"«{it.get('material_descripcion')}» no tiene precio de compra en el catálogo."
                )
            proveedor = it.get("proveedor_catalogo") or "Proveedor catálogo"
            pid = cat.get("proveedor_id")
            if pid:
                proveedor = prov_nombres.get(int(pid)) or proveedor
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

    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "aprobado",
    }).eq("solicitud_id", solicitud_id).in_("id", [int(it["id"]) for it in items_aprobados]).execute()

    result = get_solicitud(contrato_id, solicitud_id, ligera=True)
    result["orden_compra_generada"] = {
        "id": oc_id,
        "numero_oc": numero_oc,
        "estado": "aprobada",
        "solicitud_id": solicitud_id,
        "tiene_pdf_oc": False,
        "pdf_generando": True,
    }

    def _pdf_en_segundo_plano() -> None:
        try:
            oc_full = get_orden_compra(contrato_id, oc_id)
            sol_pdf = get_solicitud(contrato_id, solicitud_id, ligera=True)
            generar_y_guardar_pdf_oc(contrato_id, oc_id, oc_full, sol_pdf, user_id)
        except Exception as exc:
            _log.warning("PDF OC %s no generado: %s", oc_id, exc)

    threading.Thread(target=_pdf_en_segundo_plano, daemon=True).start()
    return result


def rechazar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, motivo: str) -> dict:
    sb = _sb()
    head = _fetch_solicitud_head(contrato_id, solicitud_id)
    if head["estado"] != "enviada":
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
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def anular_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    """Anula una solicitud en borrador (elimina) o enviada (marca rechazada)."""
    sb = _sb()
    head = _fetch_solicitud_head(contrato_id, solicitud_id)
    estado = head.get("estado")
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
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def eliminar_solicitud_desarrollador(contrato_id: int, solicitud_id: int, current_user) -> dict:
    """
    Elimina permanentemente una solicitud y datos dependientes.
    Solo cargo Desarrollador — herramienta de limpieza, fuera del flujo operativo.
    """
    from main import _es_desarrollador

    if not _es_desarrollador(current_user):
        raise ValueError("Solo el cargo Desarrollador puede eliminar solicitudes de forma permanente.")

    sb = _sb()
    _fetch_solicitud_head(contrato_id, solicitud_id)

    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("id, pdf_blob_path, factura_blob_path")
        .eq("solicitud_id", solicitud_id)
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )

    for oc in oc_rows:
        oc_id = int(oc["id"])
        entradas = (
            sb.table("almacen_entrada")
            .select("id")
            .eq("orden_compra_id", oc_id)
            .execute()
            .data
            or []
        )
        for ent in entradas:
            eid = int(ent["id"])
            ei_rows = (
                sb.table("almacen_entrada_item")
                .select("id")
                .eq("entrada_id", eid)
                .execute()
                .data
                or []
            )
            ei_ids = [int(x["id"]) for x in ei_rows if x.get("id")]
            if ei_ids:
                salidas = (
                    sb.table("almacen_salida")
                    .select("id")
                    .in_("entrada_item_id", ei_ids)
                    .execute()
                    .data
                    or []
                )
                for sal in salidas:
                    eliminar_salida(contrato_id, int(sal["id"]))
            eliminar_entrada(contrato_id, eid)

        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("id")
            .eq("orden_compra_id", oc_id)
            .execute()
            .data
            or []
        )
        for oci in oci_rows:
            sb.table("almacen_orden_compra_item").delete().eq("id", int(oci["id"])).execute()

        for path in (oc.get("pdf_blob_path"), oc.get("factura_blob_path")):
            p = (path or "").strip()
            if p:
                try:
                    delete_blob_private(p)
                except Exception as exc:
                    _log.warning("Dev delete OC blob %s: %s", oc_id, exc)

        sb.table("almacen_orden_compra").delete().eq("id", oc_id).execute()

    sb.table("almacen_solicitud_item").delete().eq("solicitud_id", solicitud_id).execute()
    sb.table("almacen_solicitud").delete().eq("id", solicitud_id).eq("contrato_id", contrato_id).execute()
    return {"ok": True, "deleted": True, "id": solicitud_id}


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
    return _enriquecer_ocs_con_saldo_recepcion(sb, rows)


def get_orden_compra(contrato_id: int, oc_id: int, *, incluir_entradas: bool = True) -> dict:
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
    oc.update(_oc_recepcion_resumen(items, oc.get("estado")))
    sid_items = [int(it["solicitud_item_id"]) for it in items if it.get("solicitud_item_id")]
    sol_item_map: Dict[int, dict] = {}
    if sid_items:
        sol_rows = (
            sb.table("almacen_solicitud_item")
            .select("id, pk_id, tramo, costado, abscisa_inicial, abscisa_final, capitulo, item, insumo_id, material_descripcion, unidad")
            .in_("id", sid_items)
            .execute()
            .data
            or []
        )
        insumo_ids = sorted({int(r["insumo_id"]) for r in sol_rows if r.get("insumo_id")})
        ins_codigos: Dict[int, str] = {}
        if insumo_ids:
            ins_rows = (
                sb.table("almacen_insumo")
                .select("id, codigo")
                .in_("id", insumo_ids)
                .execute()
                .data
                or []
            )
            for r in ins_rows:
                c = (r.get("codigo") or "").strip()
                if c:
                    ins_codigos[int(r["id"])] = c
        for r in sol_rows:
            row = dict(r)
            iid = row.get("insumo_id")
            if iid and int(iid) in ins_codigos:
                row["insumo_codigo"] = ins_codigos[int(iid)]
            sol_item_map[int(r["id"])] = row
    for it in oc["items"]:
        sid = it.get("solicitud_item_id")
        if sid and int(sid) in sol_item_map:
            it["almacen_solicitud_item"] = sol_item_map[int(sid)]
            if sol_item_map[int(sid)].get("insumo_codigo"):
                it["insumo_codigo"] = sol_item_map[int(sid)]["insumo_codigo"]
    if incluir_entradas:
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
    else:
        oc["entradas"] = []
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
        aprobador_firma_url=oc.get("aprobador_firma_imagen_url"),
        solicitante_firma_url=oc.get("solicitante_firma_imagen_url"),
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
    """Descarga el PDF de la OC. Reutiliza blob existente; solo regenera si falta."""
    oc = get_orden_compra(contrato_id, oc_id)
    fname = oc.get("pdf_nombre") or f"OC-{oc.get('numero_oc') or oc_id}.pdf"
    if oc.get("pdf_blob_path"):
        data, _mime = download_soporte(oc.get("pdf_blob_path"))
        if data:
            return data, fname
    sol_id = oc.get("solicitud_id")
    if not sol_id:
        raise ValueError("La orden de compra no tiene solicitud asociada.")
    # Ligera: el PDF no necesita contexto/listado/rentabilidad por línea.
    solicitud = get_solicitud(contrato_id, int(sol_id), ligera=True)
    try:
        generar_y_guardar_pdf_oc(contrato_id, oc_id, oc, solicitud, user_id)
    except Exception as exc:
        raise ValueError(f"No se pudo generar el PDF de la Orden de Compra: {exc}") from exc
    oc = get_orden_compra(contrato_id, oc_id)
    if not oc.get("pdf_blob_path"):
        raise ValueError("No se pudo generar el PDF de la Orden de Compra.")
    data, _mime = download_soporte(oc.get("pdf_blob_path"))
    if not data:
        raise ValueError("El PDF de la Orden de Compra está vacío o no está disponible.")
    fname = oc.get("pdf_nombre") or fname
    return data, fname


def _upload_soporte(contrato_id: int, subcarpeta: str, ref_id: int, data: bytes, nombre: str, mime: str) -> dict:
    from pdf_prepare import PdfPrepareError, prepare_pdf_for_storage

    payload = data
    skip_prepare = False
    if mime == "application/pdf":
        try:
            prepared = prepare_pdf_for_storage(payload)
        except PdfPrepareError as exc:
            raise ValueError(str(exc)) from exc
        payload = prepared.data
        skip_prepare = True
    elif len(payload) > MAX_SOPORTE_BYTES:
        raise ValueError("El archivo supera el tamaño máximo (20 MB).")
    if mime not in SOPORTE_MIMES:
        raise ValueError("Formato no permitido. Use PDF, JPEG, PNG o WebP.")
    safe = _safe_filename(nombre)
    blob_path = f"almacen-soportes/{contrato_id}/{subcarpeta}/{ref_id}/{safe}"
    upload_blob_private(
        blob_path,
        payload,
        mime,
        overwrite=True,
        contrato_id=contrato_id,
        storage_tipo="documentos" if mime == "application/pdf" else None,
        skip_pdf_prepare=skip_prepare,
    )
    return {
        "blob_path": blob_path,
        "nombre": safe,
        "mime": mime,
        "tamano_bytes": len(payload),
    }


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


def _oc_recepcion_resumen(items: List[dict], estado_oc: Optional[str] = None) -> dict:
    """Saldo pendiente y estado de recepción (distinto del flujo de aprobación)."""
    saldo_cant = 0.0
    tiene_saldo = False
    unidades: List[str] = []
    for it in items:
        s = _oc_item_saldos(it)
        saldo_cant += s["saldo_cantidad"]
        if s["tiene_saldo"]:
            tiene_saldo = True
        u = (it.get("unidad") or "").strip()
        if u and u not in unidades:
            unidades.append(u)
    saldo_cant = round(saldo_cant, 4)
    if estado_oc == "anulada":
        recepcion = "anulada"
    elif items and not tiene_saldo:
        recepcion = "completa"
    elif any(_to_float(i.get("cantidad_recibida")) > 0 for i in items):
        recepcion = "parcial"
    else:
        recepcion = "pendiente"
    return {
        "saldo_cantidad_pendiente": saldo_cant,
        "saldo_unidad": unidades[0] if len(unidades) == 1 else None,
        "saldo_unidades": unidades,
        "tiene_saldo_recepcion": tiene_saldo,
        "estado_recepcion": recepcion,
    }


def _enriquecer_ocs_con_saldo_recepcion(sb, rows: List[dict]) -> List[dict]:
    if not rows:
        return rows
    oc_ids = [int(r["id"]) for r in rows]
    all_items = (
        sb.table("almacen_orden_compra_item")
        .select("orden_compra_id, cantidad, cantidad_recibida, valor_unitario, valor_recibido, unidad")
        .in_("orden_compra_id", oc_ids)
        .execute()
        .data
        or []
    )
    items_by_oc: Dict[int, List[dict]] = {}
    for it in all_items:
        oid = int(it["orden_compra_id"])
        items_by_oc.setdefault(oid, []).append(it)
    for r in rows:
        oid = int(r["id"])
        r.update(_oc_recepcion_resumen(items_by_oc.get(oid, []), r.get("estado")))
    return rows


def _oc_resumen_para_entrada(sb, oc_id: int) -> dict:
    oc_rows = (
        sb.table("almacen_orden_compra")
        .select("numero_oc, estado, solicitud_id")
        .eq("id", oc_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    base = oc_rows[0] if oc_rows else {}
    items = (
        sb.table("almacen_orden_compra_item")
        .select("cantidad, cantidad_recibida, valor_unitario, valor_recibido, unidad")
        .eq("orden_compra_id", oc_id)
        .execute()
        .data
        or []
    )
    return {**base, **_oc_recepcion_resumen(items, base.get("estado"))}


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


def _contrato_segmento_documento(contrato_id: int) -> str:
    from catalogo_insumos_service import contrato_codigo_segment

    return contrato_codigo_segment(contrato_id)


def _parse_consecutivo_numero_documento(contrato_id: int, raw: str) -> int:
    raw = (raw or "").strip()
    if not raw:
        return 0
    seg = _contrato_segmento_documento(contrato_id)
    prefix = f"{seg}-"
    if raw.upper().startswith(prefix.upper()):
        tail = raw[len(prefix):].strip()
        try:
            return int(tail)
        except ValueError:
            return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def _format_numero_documento(contrato_id: int, consecutivo: int) -> str:
    return f"{_contrato_segmento_documento(contrato_id)}-{consecutivo:05d}"


def _format_codigo_entrada(contrato_id: int, consecutivo: int) -> str:
    return f"Ent-{_contrato_segmento_documento(contrato_id)}-{int(consecutivo):05d}"


def _format_codigo_salida(contrato_id: int, consecutivo: int) -> str:
    return f"Sal-{_contrato_segmento_documento(contrato_id)}-{int(consecutivo):05d}"


def _format_codigo_devolucion(contrato_id: int, consecutivo: int) -> str:
    return f"Dev-{_contrato_segmento_documento(contrato_id)}-{int(consecutivo):05d}"


def _asegurar_codigo_entrada(contrato_id: int, row: dict) -> dict:
    if row and not (row.get("codigo") or "").strip() and row.get("numero_entrada"):
        row["codigo"] = _format_codigo_entrada(contrato_id, int(row["numero_entrada"]))
    return row or {}


def _asegurar_codigo_salida(contrato_id: int, row: dict) -> dict:
    if row and not (row.get("codigo") or "").strip() and row.get("numero_salida"):
        row["codigo"] = _format_codigo_salida(contrato_id, int(row["numero_salida"]))
    return row or {}


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
        max_n = max(max_n, _parse_consecutivo_numero_documento(contrato_id, r.get("numero_documento") or ""))
    return max_n


def _next_numero_disposicion(contrato_id: int) -> str:
    return _format_numero_documento(contrato_id, _max_numero_disposicion(contrato_id) + 1)


REMISION_SOPORTE_MAX_BYTES = 300 * 1024


def _abscisa_entrada_str(val: Any) -> Optional[str]:
    if val is None or val == "":
        return None
    s = str(val).strip()
    if not s:
        return None
    if "+" in s or s.upper().startswith("K"):
        return s if s.upper().startswith("K") else f"K{s}"
    try:
        m = float(str(val).replace(",", "."))
        km = int(m // 1000)
        rest = m - km * 1000
        txt = f"K{km}+{rest:.2f}".rstrip("0").rstrip(".")
        return txt
    except (TypeError, ValueError):
        return s


def _enriquecer_entrada_desde_oc(
    contrato_id: int,
    oc: dict,
    lineas: List[dict],
    body: dict,
) -> dict:
    """Autodiligencia de proveedor, PK-ID, tramo y abscisas desde la OC / solicitud."""
    oc_items_map = {int(x["id"]): x for x in (oc.get("items") or []) if x.get("id") is not None}
    ref_oci: Optional[dict] = None
    for ln in lineas:
        raw_id = ln.get("orden_compra_item_id")
        if raw_id in (None, "", 0):
            continue
        ref_oci = oc_items_map.get(int(raw_id))
        if ref_oci:
            break
    if not ref_oci:
        return body

    sol_it: Optional[dict] = None
    embedded = ref_oci.get("almacen_solicitud_item")
    if isinstance(embedded, dict) and embedded:
        sol_it = embedded
    sid = ref_oci.get("solicitud_item_id")
    if not sol_it and sid:
        rows = (
            _sb()
            .table("almacen_solicitud_item")
            .select("pk_id, tramo, costado, abscisa_inicial, abscisa_final")
            .eq("id", int(sid))
            .limit(1)
            .execute()
            .data
            or []
        )
        if rows:
            sol_it = rows[0]

    if sol_it:
        if not _norm_pk_id(body.get("pk_id")):
            body["pk_id"] = _norm_pk_id(sol_it.get("pk_id")) or None
        if not (body.get("tramo") or "").strip():
            body["tramo"] = (sol_it.get("tramo") or "").strip() or None
        if not (body.get("costado") or "").strip():
            body["costado"] = (sol_it.get("costado") or "").strip() or None
        if not (body.get("abscisa_inicial") or "").strip():
            body["abscisa_inicial"] = _abscisa_entrada_str(sol_it.get("abscisa_inicial"))
        if not (body.get("abscisa_final") or "").strip():
            body["abscisa_final"] = _abscisa_entrada_str(sol_it.get("abscisa_final"))

    if not body.get("proveedor_id") and ref_oci.get("proveedor_nombre"):
        pid = _resolve_proveedor_id(contrato_id, ref_oci.get("proveedor_nombre"))
        if pid:
            body["proveedor_id"] = pid

    return body


def _resolve_numero_documento_entrada(contrato_id: int, tipo: str, numero_raw: Optional[str]) -> str:
    """Disposición: autonumerador del sistema. Recibo: número de remisión del proveedor."""
    t = (tipo or "recibo").strip().lower()
    raw = (numero_raw or "").strip()
    if t == "disposicion":
        return _next_numero_disposicion(contrato_id)
    if t == "recibo":
        if not raw:
            raise ValueError("Indique el número de remisión del proveedor.")
        return raw.upper()[:64]
    raise ValueError("Tipo de entrada inválido.")


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
        if not oc or oc.get("estado") == "anulada":
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
        if not oc or oc.get("estado") == "anulada":
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
    admin_list = _administradores_contrato_contactos(sb, contrato_id)
    contrato_pdf = {
        **contrato_rows[0],
        "administradores": admin_list,
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
    elif oc_item.get("proveedor_nombre"):
        prov_name = oc_item.get("proveedor_nombre") or "—"
    ts_rows = (
        sb.table("almacen_entrada")
        .select("created_at")
        .eq("id", entrada_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    created_at = ts_rows[0].get("created_at") if ts_rows else None
    pdf_ctx = {**entrada_row, "cantidad_recibida": cantidad, "created_at": created_at}
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
        oc = get_orden_compra(contrato_id, oc_id, incluir_entradas=False)
        if oc.get("estado") == "anulada":
            raise ValueError("La orden de compra está anulada.")
        items_oc = oc.get("items") or []
        if not any(_oc_item_saldos(it)["tiene_saldo"] for it in items_oc):
            raise ValueError("La orden de compra no tiene saldo pendiente por recibir.")
        body = _enriquecer_entrada_desde_oc(contrato_id, oc, lineas, body)
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

    pk_id = _norm_pk_id(body.get("pk_id") or pk_id) or None
    if oc_id and not pk_id:
        raise ValueError(
            "No se pudo determinar el PK-ID de la entrada. Verifique la solicitud asociada a la orden de compra."
        )

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
    if not insumo_id and not oc_id:
        raise ValueError("Indique el insumo recibido.")

    numero_doc = _resolve_numero_documento_entrada(
        contrato_id,
        tipo,
        body.get("numero_documento"),
    )

    if tipo == "recibo":
        if not remision_data:
            raise ValueError("Adjunte el soporte fotográfico o PDF de la remisión.")
        if len(remision_data) > REMISION_SOPORTE_MAX_BYTES:
            raise ValueError("El soporte de remisión no puede superar 300 KB.")

    numero_entrada = _next_consecutivo(contrato_id, "almacen_entrada", "numero_entrada")
    codigo_entrada = _format_codigo_entrada(contrato_id, numero_entrada)

    entrada_row = {
        "orden_compra_id": oc_id,
        "contrato_id": contrato_id,
        "numero_entrada": numero_entrada,
        "codigo": codigo_entrada,
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

    pdf_generando = False
    if primera_oci is not None and tipo in ("disposicion", "recibo"):
        pdf_generando = True
        entrada_pdf = {
            **entrada_row,
            "numero_documento": numero_doc or entrada_row.get("numero_documento"),
            "cantidad_recibida": primera_cantidad,
        }

        def _pdf_pos_entrada_background() -> None:
            try:
                _generar_pdf_pos_entrada(
                    contrato_id,
                    entrada_id,
                    entrada_pdf,
                    pdf_oc,
                    primera_oci,
                    primera_cantidad,
                    user_id,
                    tipo,
                )
            except Exception as exc:
                _log.warning("PDF POS entrada %s no generado: %s", entrada_id, exc)

        threading.Thread(target=_pdf_pos_entrada_background, daemon=True).start()

    result = {
        **entrada_row,
        "id": entrada_id,
        "items": [],
        "cantidad_recibida_total": sum(_to_float(ln.get("cantidad_recibida")) for ln in lineas),
        "pdf_generando": pdf_generando,
        "tiene_pdf_disposicion": False,
    }
    if oc_id:
        result["almacen_orden_compra"] = {
            "numero_oc": oc.get("numero_oc") if oc else None,
            "estado": oc.get("estado") if oc else None,
        }
    else:
        result["almacen_orden_compra"] = {}
    if result.get("created_by"):
        names = _map_usuario_nombres(sb, [result["created_by"]])
        result["usuario_nombre"] = names.get(int(result["created_by"]))
    placa_val = entrada_row.get("placa")
    transportador_val = entrada_row.get("transportador")
    if placa_val and transportador_val:
        _, transportador_nuevo = upsert_transportador(
            contrato_id, user_id, placa_val, transportador_val
        )
        if transportador_nuevo:
            result["transportador_registrado"] = True
    _invalidar_graficos_inventario(contrato_id)
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

    ei_ids = [int(it["id"]) for it in ent.get("items") or [] if it.get("id")]
    if ei_ids:
        salidas = (
            sb.table("almacen_salida")
            .select("id")
            .in_("entrada_item_id", ei_ids)
            .limit(1)
            .execute()
            .data
            or []
        )
        if salidas:
            raise ValueError(
                "No se puede eliminar la entrada porque ya tiene salidas de material registradas contra ella."
            )

    numero_entrada = int(ent.get("numero_entrada") or 0)
    numero_doc_raw = (ent.get("numero_documento") or "").strip()
    tipo = (ent.get("tipo") or "").strip().lower()
    oc_id = ent.get("orden_compra_id")

    max_entrada = _max_consecutivo(contrato_id, "almacen_entrada", "numero_entrada")
    max_disp = _max_numero_disposicion(contrato_id) if tipo == "disposicion" else 0

    numero_doc_int = _parse_consecutivo_numero_documento(contrato_id, numero_doc_raw) if numero_doc_raw else 0

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

    _invalidar_graficos_inventario(contrato_id)
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
    oc_resumen_cache: Dict[int, dict] = {}
    for r in rows:
        oc_id = r.get("orden_compra_id")
        if oc_id:
            oc_id_int = int(oc_id)
            if oc_id_int not in oc_resumen_cache:
                oc_resumen_cache[oc_id_int] = _oc_resumen_para_entrada(sb, oc_id_int)
            r["almacen_orden_compra"] = oc_resumen_cache[oc_id_int]
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
        _asegurar_codigo_entrada(contrato_id, r)
    _enriquecer_entradas_listado(sb, rows)
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
    ei_ids = [int(it["id"]) for it in items if it.get("id") is not None]
    despacho_map = _despacho_neto_por_entrada_item(sb, ei_ids) if ei_ids else {}
    for it in items:
        ei_id = int(it["id"]) if it.get("id") is not None else None
        recibida = _to_float(it.get("cantidad_recibida"))
        despachada = despacho_map.get(ei_id, 0.0) if ei_id is not None else 0.0
        saldo = _disponible_entrada_item(recibida, despachada)
        pct = _porcentaje_saldo_disponible(recibida, saldo)
        it["cantidad_despachada"] = despachada
        it["saldo_disponible"] = saldo
        it["porcentaje_saldo_disponible"] = pct
        it["alerta_saldo"] = _alerta_saldo_entrada(pct, recibida)
    ent["items"] = items
    if not _norm_pk_id(ent.get("pk_id")) and items:
        ubic_map = _ubicacion_efectiva_entrada_items(sb, items, {int(ent["id"]): ent})
        for it in items:
            ubic = ubic_map.get(int(it["id"])) or {}
            if _norm_pk_id(ubic.get("pk_id")):
                ent["pk_id"] = ubic["pk_id"]
                break
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
    return _asegurar_codigo_entrada(contrato_id, ent)


def _invalidar_graficos_inventario(contrato_id: int) -> None:
    try:
        from almacen_inventario_graficos import invalidar_cache_inventario_graficos
        invalidar_cache_inventario_graficos(contrato_id)
    except Exception:
        pass


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


# ── Salidas de material ────────────────────────────────────────────────────────

SALIDA_ALERTA_CONSUMO_FRACCION = 0.20


def _sum_salidas_por_entrada_item(sb, entrada_item_ids: List[int]) -> Dict[int, float]:
    ids = sorted({int(x) for x in entrada_item_ids if x})
    if not ids:
        return {}
    rows = (
        sb.table("almacen_salida")
        .select("entrada_item_id, cantidad_salida")
        .in_("entrada_item_id", ids)
        .execute()
        .data
        or []
    )
    out: Dict[int, float] = {}
    for r in rows:
        eid = int(r["entrada_item_id"])
        out[eid] = out.get(eid, 0.0) + _to_float(r.get("cantidad_salida"))
    return out


def _sum_devoluciones_por_entrada_item(sb, entrada_item_ids: List[int]) -> Dict[int, float]:
    """Suma cantidades devueltas por línea de entrada (reactiva saldo disponible)."""
    ids = sorted({int(x) for x in entrada_item_ids if x})
    if not ids:
        return {}
    rows = (
        sb.table("almacen_devolucion")
        .select("entrada_item_id, cantidad")
        .in_("entrada_item_id", ids)
        .execute()
        .data
        or []
    )
    out: Dict[int, float] = {}
    for r in rows:
        eid = int(r["entrada_item_id"])
        out[eid] = out.get(eid, 0.0) + _to_float(r.get("cantidad"))
    return out


def _sum_devoluciones_por_salida(sb, salida_ids: List[int]) -> Dict[int, float]:
    ids = sorted({int(x) for x in salida_ids if x})
    if not ids:
        return {}
    rows = (
        sb.table("almacen_devolucion")
        .select("salida_id, cantidad")
        .in_("salida_id", ids)
        .execute()
        .data
        or []
    )
    out: Dict[int, float] = {}
    for r in rows:
        sid = int(r["salida_id"])
        out[sid] = out.get(sid, 0.0) + _to_float(r.get("cantidad"))
    return out


def _despacho_neto_por_entrada_item(sb, entrada_item_ids: List[int]) -> Dict[int, float]:
    """Despachado neto = salidas − devoluciones (lo que sigue fuera del almacén)."""
    ids = sorted({int(x) for x in entrada_item_ids if x})
    if not ids:
        return {}
    salidas = _sum_salidas_por_entrada_item(sb, ids)
    devoluciones = _sum_devoluciones_por_entrada_item(sb, ids)
    out: Dict[int, float] = {}
    for eid in ids:
        neto = salidas.get(eid, 0.0) - devoluciones.get(eid, 0.0)
        out[eid] = max(0.0, round(neto, 4))
    return out


def _cantidad_recibida_entrada_item(sb, entrada_item_id: int) -> float:
    """Cantidad recibida en un registro de entrada (línea), nunca el total de la OC."""
    rows = (
        sb.table("almacen_entrada_item")
        .select("cantidad_recibida")
        .eq("id", int(entrada_item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return 0.0
    return _to_float(rows[0].get("cantidad_recibida"))


def _sum_entrada_item_recibido_posterior(
    sb,
    orden_compra_item_id: int,
    entrada_id: int,
    created_at: Optional[str],
) -> float:
    """Suma recibido en entradas posteriores a una misma línea de OC."""
    ei_rows = (
        sb.table("almacen_entrada_item")
        .select("id, cantidad_recibida, entrada_id")
        .eq("orden_compra_item_id", int(orden_compra_item_id))
        .execute()
        .data
        or []
    )
    if not ei_rows:
        return 0.0
    entrada_ids = sorted({int(r["entrada_id"]) for r in ei_rows if r.get("entrada_id")})
    ent_rows = (
        sb.table("almacen_entrada")
        .select("id, created_at")
        .in_("id", entrada_ids)
        .execute()
        .data
        or []
    )
    ent_map = {int(r["id"]): r.get("created_at") or "" for r in ent_rows}
    ref_ts = str(created_at or ent_map.get(int(entrada_id), ""))
    ref_id = int(entrada_id)
    total = 0.0
    for ei in ei_rows:
        eid = int(ei.get("entrada_id") or 0)
        if eid == ref_id:
            continue
        ts = str(ent_map.get(eid) or "")
        if ts > ref_ts or (ts == ref_ts and eid > ref_id):
            total += _to_float(ei.get("cantidad_recibida"))
    return total


def _saldo_oc_pendiente_tras_entrada(
    sb,
    entrada_id: int,
    created_at: Optional[str],
    entrada_items: List[dict],
) -> Optional[dict]:
    """Saldo OC pendiente justo después de registrar esta entrada."""
    oci_ids = sorted({
        int(x["orden_compra_item_id"])
        for x in entrada_items
        if x.get("orden_compra_item_id")
    })
    if not oci_ids:
        return None
    oci_rows = (
        sb.table("almacen_orden_compra_item")
        .select("id, cantidad, cantidad_recibida, unidad")
        .in_("id", oci_ids)
        .execute()
        .data
        or []
    )
    saldo_total = 0.0
    unidades: List[str] = []
    for oci in oci_rows:
        oci_id = int(oci["id"])
        cant_oc = _to_float(oci.get("cantidad"))
        later = _sum_entrada_item_recibido_posterior(sb, oci_id, int(entrada_id), created_at)
        rec_tras_esta = _to_float(oci.get("cantidad_recibida")) - later
        saldo_total += max(0.0, cant_oc - rec_tras_esta)
        u = (oci.get("unidad") or "").strip()
        if u and u not in unidades:
            unidades.append(u)
    return {
        "saldo_cantidad": round(saldo_total, 4),
        "saldo_unidad": unidades[0] if len(unidades) == 1 else None,
    }


def _enriquecer_entradas_listado(sb, rows: List[dict]) -> None:
    """Agrega cantidad recibida en el registro y saldo OC tras esa entrada."""
    if not rows:
        return
    entrada_ids = [int(r["id"]) for r in rows]
    ei_rows = (
        sb.table("almacen_entrada_item")
        .select("id, entrada_id, cantidad_recibida, orden_compra_item_id")
        .in_("entrada_id", entrada_ids)
        .execute()
        .data
        or []
    )
    by_entrada: Dict[int, List[dict]] = {}
    for ei in ei_rows:
        by_entrada.setdefault(int(ei["entrada_id"]), []).append(ei)

    oci_ids = sorted({
        int(ei["orden_compra_item_id"])
        for ei in ei_rows
        if ei.get("orden_compra_item_id")
    })
    unidad_map: Dict[int, str] = {}
    if oci_ids:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("id, unidad")
            .in_("id", oci_ids)
            .execute()
            .data
            or []
        )
        for o in oci_rows:
            unidad_map[int(o["id"])] = (o.get("unidad") or "").strip()

    for r in rows:
        eid = int(r["id"])
        items = by_entrada.get(eid, [])
        qty = round(sum(_to_float(x.get("cantidad_recibida")) for x in items), 4)
        r["cantidad_recibida_total"] = qty
        unidades = sorted({
            unidad_map.get(int(x["orden_compra_item_id"]), "")
            for x in items
            if x.get("orden_compra_item_id") and unidad_map.get(int(x["orden_compra_item_id"]))
        })
        r["cantidad_recibida_unidad"] = unidades[0] if len(unidades) == 1 else None
        saldo = _saldo_oc_pendiente_tras_entrada(sb, eid, r.get("created_at"), items)
        if saldo:
            r["saldo_oc_pendiente_despues"] = saldo.get("saldo_cantidad")
            r["saldo_oc_pendiente_despues_unidad"] = saldo.get("saldo_unidad") or r.get("cantidad_recibida_unidad")


def _disponible_entrada_item(cantidad_recibida: float, cantidad_despachada: float) -> float:
    return max(0.0, round(cantidad_recibida - cantidad_despachada, 4))


def _porcentaje_saldo_disponible(cantidad_recibida: float, saldo_disponible: float) -> float:
    if cantidad_recibida <= 0:
        return 0.0
    return round((saldo_disponible / cantidad_recibida) * 100, 2)


def _alerta_saldo_entrada(porcentaje_saldo: float, cantidad_recibida: float = 1.0) -> str:
    """rojo ≤10%, naranja ≤20%, normal >20% (sobre cantidad recibida de la línea)."""
    if cantidad_recibida <= 0:
        return "normal"
    if porcentaje_saldo <= 10:
        return "rojo"
    if porcentaje_saldo <= 20:
        return "naranja"
    return "normal"


def _alerta_proximidad_consumo(cantidad_recibida: float, cantidad_disponible: float) -> bool:
    if cantidad_recibida <= 0:
        return False
    umbral = cantidad_recibida * SALIDA_ALERTA_CONSUMO_FRACCION
    return cantidad_disponible <= umbral


def _enriquecer_entrada_item_opcion(
    sb,
    contrato_id: int,
    ent: dict,
    it: dict,
    salidas_map: Dict[int, float],
) -> Optional[dict]:
    ei_id = int(it["id"])
    recibida = _cantidad_recibida_entrada_item(sb, ei_id)
    despachada = salidas_map.get(ei_id, 0.0)
    disponible = _disponible_entrada_item(recibida, despachada)
    if disponible <= 0:
        return None

    oci_id = it.get("orden_compra_item_id")
    material = "—"
    unidad = "UND"
    insumo_codigo = None
    presupuesto_capitulo = None
    presupuesto_item = None
    numero_oc = None
    cantidad_oc_autorizada = None

    if oci_id:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("material_descripcion, unidad, orden_compra_id, solicitud_item_id, presupuesto_id, cantidad")
            .eq("id", int(oci_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if oci_rows:
            oci = oci_rows[0]
            cantidad_oc_autorizada = _to_float(oci.get("cantidad"))
            material = oci.get("material_descripcion") or "—"
            unidad = oci.get("unidad") or "UND"
            oc_id = oci.get("orden_compra_id")
            if oc_id:
                oc_row = (
                    sb.table("almacen_orden_compra")
                    .select("numero_oc")
                    .eq("id", int(oc_id))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if oc_row:
                    numero_oc = oc_row[0].get("numero_oc")
            sid = oci.get("solicitud_item_id")
            if sid:
                sol_it = (
                    sb.table("almacen_solicitud_item")
                    .select("capitulo, item, insumo_id")
                    .eq("id", int(sid))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if sol_it:
                    presupuesto_capitulo = sol_it[0].get("capitulo")
                    presupuesto_item = sol_it[0].get("item")
                    iid = sol_it[0].get("insumo_id")
                    if iid:
                        ins = (
                            sb.table("almacen_insumo")
                            .select("codigo")
                            .eq("id", int(iid))
                            .limit(1)
                            .execute()
                            .data
                            or []
                        )
                        if ins:
                            insumo_codigo = (ins[0].get("codigo") or "").strip() or None
            elif oci.get("presupuesto_id"):
                try:
                    ppto = _fetch_ppto_row(int(oci["presupuesto_id"]), contrato_id)
                    presupuesto_capitulo = ppto.get("capitulo")
                    presupuesto_item = ppto.get("item")
                except ValueError:
                    pass

    return {
        "entrada_id": ent.get("id"),
        "entrada_item_id": ei_id,
        "numero_entrada": ent.get("numero_entrada"),
        "fecha_entrada": ent.get("fecha_entrada"),
        "numero_documento": ent.get("numero_documento"),
        "tipo_entrada": ent.get("tipo"),
        "numero_oc": numero_oc,
        "material_descripcion": material,
        "unidad": unidad,
        "insumo_codigo": insumo_codigo,
        "presupuesto_capitulo": presupuesto_capitulo,
        "presupuesto_item": presupuesto_item,
        "cantidad_recibida": recibida,
        "cantidad_recibida_entrada": recibida,
        "cantidad_oc_autorizada": cantidad_oc_autorizada,
        "cantidad_despachada": despachada,
        "cantidad_disponible": disponible,
        "alerta_proximidad_consumo": _alerta_proximidad_consumo(recibida, disponible),
    }


def entradas_disponibles_por_pk(contrato_id: int, pk_id: str) -> List[dict]:
    """Entradas con saldo despachable para un PK-ID."""
    sb = _sb()
    pk_query = _norm_pk_id(pk_id)
    if not pk_query:
        raise ValueError("Indique el PK-ID.")

    entradas = (
        sb.table("almacen_entrada")
        .select("*")
        .eq("contrato_id", contrato_id)
        .execute()
        .data
        or []
    )
    if not entradas:
        return []

    ent_by_id = {int(e["id"]): e for e in entradas}
    entrada_ids = list(ent_by_id.keys())
    items = (
        sb.table("almacen_entrada_item")
        .select("*")
        .in_("entrada_id", entrada_ids)
        .execute()
        .data
        or []
    )
    if not items:
        return []

    ubicacion_map = _ubicacion_efectiva_entrada_items(sb, items, ent_by_id)
    salidas_map = _despacho_neto_por_entrada_item(sb, [int(it["id"]) for it in items])
    out: List[dict] = []
    for it in items:
        ei_id = int(it["id"])
        ubic = ubicacion_map.get(ei_id) or {}
        pk_eff = ubic.get("pk_id")
        if not _pk_id_coincide(pk_eff, pk_query):
            continue
        ent = ent_by_id.get(int(it["entrada_id"]), {})
        opc = _enriquecer_entrada_item_opcion(sb, contrato_id, ent, it, salidas_map)
        if opc:
            opc["pk_id"] = pk_eff
            opc["tramo"] = ubic.get("tramo")
            opc["costado"] = ubic.get("costado")
            opc["abscisa_inicial"] = ubic.get("abscisa_inicial")
            opc["abscisa_final"] = ubic.get("abscisa_final")
            out.append(opc)
    out.sort(key=lambda x: (
        -(int(x.get("numero_entrada") or 0)),
        -(int(x.get("entrada_item_id") or 0)),
    ))
    return out


def list_usuarios_receptor_obra(contrato_id: int, q: str = "", limit: int = 30) -> List[dict]:
    from almacen_permissions import es_rol_receptor_obra

    sb = _sb()
    uc = sb.table("usuario_contratos").select("usuario_id").eq("contrato_id", contrato_id).execute().data or []
    ids_uc = [int(r["usuario_id"]) for r in uc if r.get("usuario_id")]
    usuarios_principal = sb.table("usuarios").select("id").eq("contrato_id", contrato_id).eq("activo", True).execute().data or []
    ids_principal = [int(u["id"]) for u in usuarios_principal]
    todos_ids = sorted(set(ids_uc + ids_principal))
    if not todos_ids:
        return []

    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, email, rol_id, firma_imagen_url")
        .in_("id", todos_ids)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    rol_ids = sorted({int(r["rol_id"]) for r in rows if r.get("rol_id")})
    roles_map: Dict[int, str] = {}
    if rol_ids:
        rol_rows = sb.table("roles").select("id, nombre").in_("id", rol_ids).execute().data or []
        for rr in rol_rows:
            roles_map[int(rr["id"])] = rr.get("nombre") or ""

    q_norm = _norm_pk_id(q).lower()
    out: List[dict] = []
    for u in rows:
        rol_nom = roles_map.get(int(u.get("rol_id") or 0), "")
        if not es_rol_receptor_obra(rol_nom):
            continue
        label = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip()
        if not label:
            label = u.get("email") or f"Usuario #{u['id']}"
        if q_norm:
            blob = f"{label} {u.get('email') or ''}".lower()
            if q_norm not in blob:
                continue
        out.append({
            "id": u["id"],
            "label": label,
            "email": u.get("email"),
            "rol_nombre": rol_nom,
        })
        if len(out) >= limit:
            break
    return out


def _validar_receptor_obra(sb, contrato_id: int, receptor_id: int) -> dict:
    from almacen_permissions import es_rol_receptor_obra

    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, email, rol_id, firma_imagen_url, contrato_id, activo")
        .eq("id", int(receptor_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows or not rows[0].get("activo"):
        raise ValueError("El usuario receptor no existe o está inactivo.")
    u = rows[0]
    rol_nom = ""
    if u.get("rol_id"):
        rol_rows = sb.table("roles").select("nombre").eq("id", int(u["rol_id"])).limit(1).execute().data or []
        if rol_rows:
            rol_nom = rol_rows[0].get("nombre") or ""
    if not es_rol_receptor_obra(rol_nom):
        raise ValueError("El usuario seleccionado no tiene un rol válido para recibir material en obra.")

    uid = int(u["id"])
    uc = sb.table("usuario_contratos").select("id").eq("contrato_id", contrato_id).eq("usuario_id", uid).limit(1).execute().data or []
    if not uc and int(u.get("contrato_id") or 0) != contrato_id:
        raise ValueError("El usuario receptor no pertenece a este contrato.")
    label = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip() or u.get("email") or f"Usuario #{uid}"
    return {**u, "label": label, "rol_nombre": rol_nom}


def _generar_pdf_salida(
    contrato_id: int,
    salida_id: int,
    salida_row: dict,
    ctx: dict,
) -> None:
    from almacen_salida_pdf import generar_pdf_salida_pos

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
    contrato_pdf = {
        **contrato_rows[0],
        "administradores": _administradores_contrato_contactos(sb, contrato_id),
    }
    pdf_bytes = generar_pdf_salida_pos(
        contrato_pdf,
        salida_row,
        str(ctx.get("numero_oc") or "—"),
        ctx.get("insumo_label") or "—",
        ctx.get("presupuesto_label") or "—",
        ctx.get("unidad") or "",
        ctx.get("receptor_nombre") or "—",
        ctx.get("receptor_firma"),
        ctx.get("despachador_nombre") or "—",
        ctx.get("despachador_firma"),
    )
    meta = _upload_soporte(contrato_id, "salidas", salida_id, pdf_bytes, f"salida-{salida_id}.pdf", "application/pdf")
    sb.table("almacen_salida").update({
        "salida_pdf_blob_path": meta["blob_path"],
        "salida_pdf_nombre": meta["nombre"],
        "salida_pdf_mime": meta["mime"],
    }).eq("id", salida_id).execute()


def create_salida(contrato_id: int, user_id: int, body: dict) -> dict:
    sb = _sb()
    pk_id = _norm_pk_id(body.get("pk_id"))
    if not pk_id:
        raise ValueError("Seleccione la ubicación (PK-ID) en el mapa.")

    entrada_item_id = body.get("entrada_item_id")
    if not entrada_item_id:
        raise ValueError("Seleccione la entrada de material a despachar.")
    entrada_item_id = int(entrada_item_id)

    qty = _to_float(body.get("cantidad_salida"))
    if qty <= 0:
        raise ValueError("Indique una cantidad de salida mayor a cero.")

    receptor_id = body.get("receptor_usuario_id")
    if not receptor_id:
        raise ValueError("Indique quién recibe el material en obra.")
    receptor = _validar_receptor_obra(sb, contrato_id, int(receptor_id))

    ei_rows = (
        sb.table("almacen_entrada_item")
        .select("*")
        .eq("id", entrada_item_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not ei_rows:
        raise ValueError("La línea de entrada seleccionada no existe.")
    ei = ei_rows[0]

    ent_rows = (
        sb.table("almacen_entrada")
        .select("*")
        .eq("id", int(ei["entrada_id"]))
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not ent_rows:
        raise ValueError("La entrada asociada no pertenece a este contrato.")
    ent = ent_rows[0]
    ubic_map = _ubicacion_efectiva_entrada_items(sb, [ei], {int(ent["id"]): ent})
    pk_eff = (ubic_map.get(entrada_item_id) or {}).get("pk_id")
    if not _pk_id_coincide(pk_eff, pk_id):
        raise ValueError("La entrada seleccionada no corresponde al PK-ID indicado.")
    ubic_eff = ubic_map.get(entrada_item_id) or {}

    salidas_map = _despacho_neto_por_entrada_item(sb, [entrada_item_id])
    recibida = _cantidad_recibida_entrada_item(sb, entrada_item_id)
    despachada = salidas_map.get(entrada_item_id, 0.0)
    disponible = _disponible_entrada_item(recibida, despachada)
    if qty > disponible + 1e-9:
        raise ValueError(
            f"La cantidad a despachar ({qty}) supera el disponible para salida ({disponible}) "
            f"de esta entrada en el PK-ID {pk_id}. Máximo permitido: {disponible}."
        )

    fecha_hora = normalize_fecha_hora_bogota_to_utc_iso(
        (body.get("fecha_hora_salida") or "").strip()
    )
    numero_salida = _next_consecutivo(contrato_id, "almacen_salida", "numero_salida")
    codigo_salida = _format_codigo_salida(contrato_id, numero_salida)

    salida_row = {
        "contrato_id": contrato_id,
        "numero_salida": numero_salida,
        "codigo": codigo_salida,
        "fecha_hora_salida": fecha_hora,
        "receptor_usuario_id": int(receptor_id),
        "pk_id": pk_id,
        "pk_id_id": int(body["pk_id_id"]) if body.get("pk_id_id") else None,
        "tramo": (body.get("tramo") or ubic_eff.get("tramo") or ent.get("tramo") or "").strip() or None,
        "costado": (body.get("costado") or ubic_eff.get("costado") or ent.get("costado") or "").strip() or None,
        "abscisa_inicial": (body.get("abscisa_inicial") or ubic_eff.get("abscisa_inicial") or ent.get("abscisa_inicial") or "").strip() or None,
        "abscisa_final": (body.get("abscisa_final") or ubic_eff.get("abscisa_final") or ent.get("abscisa_final") or "").strip() or None,
        "entrada_item_id": entrada_item_id,
        "cantidad_salida": qty,
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    ins = sb.table("almacen_salida").insert(salida_row).execute().data
    if not ins:
        raise ValueError("No se pudo registrar la salida.")
    salida_id = int(ins[0]["id"])

    material = "—"
    unidad = "UND"
    presupuesto_id = ei.get("presupuesto_id")
    numero_oc = None
    insumo_label = material
    presupuesto_label = "—"

    oci_id = ei.get("orden_compra_item_id")
    if oci_id:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("material_descripcion, unidad, orden_compra_id, solicitud_item_id, presupuesto_id")
            .eq("id", int(oci_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if oci_rows:
            oci = oci_rows[0]
            material = oci.get("material_descripcion") or "—"
            unidad = oci.get("unidad") or "UND"
            presupuesto_id = oci.get("presupuesto_id") or presupuesto_id
            insumo_label = material
            if oci.get("orden_compra_id"):
                oc_r = (
                    sb.table("almacen_orden_compra")
                    .select("numero_oc")
                    .eq("id", int(oci["orden_compra_id"]))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if oc_r:
                    numero_oc = oc_r[0].get("numero_oc")
            sid = oci.get("solicitud_item_id")
            cap = None
            itm = None
            cod = None
            if sid:
                sol_it = (
                    sb.table("almacen_solicitud_item")
                    .select("capitulo, item, insumo_id, material_descripcion")
                    .eq("id", int(sid))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if sol_it:
                    cap = sol_it[0].get("capitulo")
                    itm = sol_it[0].get("item")
                    iid = sol_it[0].get("insumo_id")
                    if iid:
                        ins_r = (
                            sb.table("almacen_insumo")
                            .select("codigo, descripcion")
                            .eq("id", int(iid))
                            .limit(1)
                            .execute()
                            .data
                            or []
                        )
                        if ins_r:
                            cod = (ins_r[0].get("codigo") or "").strip()
                            desc = (ins_r[0].get("descripcion") or sol_it[0].get("material_descripcion") or "").strip()
                            insumo_label = f"{cod} — {desc}".strip(" —") if cod else desc
            if cap or itm:
                presupuesto_label = " · ".join(x for x in [cap, itm] if x)

    if presupuesto_id:
        sb.table("almacen_movimiento").insert({
            "contrato_id": contrato_id,
            "presupuesto_id": int(presupuesto_id),
            "material_descripcion": material,
            "unidad": unidad,
            "tipo": "salida",
            "cantidad": qty,
            "entrada_item_id": entrada_item_id,
            "referencia_tipo": "salida",
            "referencia_id": salida_id,
            "created_by": user_id,
        }).execute()
        _upsert_inventario(contrato_id, int(presupuesto_id), material, unidad, -qty, 0)

    desp_names = _map_usuario_nombres(sb, [user_id])
    despachador = desp_names.get(int(user_id), "—")
    desp_firma = None
    desp_rows = sb.table("usuarios").select("firma_imagen_url").eq("id", user_id).limit(1).execute().data or []
    if desp_rows:
        desp_firma = desp_rows[0].get("firma_imagen_url")

    pdf_ctx = {
        "numero_oc": numero_oc,
        "insumo_label": insumo_label,
        "presupuesto_label": presupuesto_label,
        "unidad": unidad,
        "receptor_nombre": receptor.get("label"),
        "receptor_firma": receptor.get("firma_imagen_url"),
        "despachador_nombre": despachador,
        "despachador_firma": desp_firma,
    }

    pdf_generando = True

    def _pdf_salida_background() -> None:
        try:
            _generar_pdf_salida(contrato_id, salida_id, {**salida_row, "id": salida_id}, pdf_ctx)
        except Exception as exc:
            _log.warning("PDF salida %s no generado: %s", salida_id, exc)

    threading.Thread(target=_pdf_salida_background, daemon=True).start()

    disponible_restante = _disponible_entrada_item(recibida, despachada + qty)
    alerta_proximidad = _alerta_proximidad_consumo(recibida, disponible_restante)

    _invalidar_graficos_inventario(contrato_id)
    return {
        **salida_row,
        "id": salida_id,
        "receptor_nombre": receptor.get("label"),
        "despachador_nombre": despachador,
        "material_descripcion": material,
        "unidad": unidad,
        "insumo_label": insumo_label,
        "presupuesto_label": presupuesto_label,
        "numero_oc": numero_oc,
        "cantidad_disponible_restante": disponible_restante,
        "alerta_proximidad_consumo": alerta_proximidad,
        "pdf_generando": pdf_generando,
        "tiene_pdf_salida": False,
    }


def list_salidas(contrato_id: int) -> List[dict]:
    sb = _sb()
    # Columnas necesarias para grilla + PDF flag (evita arrastrar blobs/metadatos pesados).
    rows = (
        sb.table("almacen_salida")
        .select(
            "id, contrato_id, numero_salida, codigo, fecha_hora_salida, pk_id, pk_id_id, "
            "tramo, costado, abscisa_inicial, abscisa_final, entrada_item_id, cantidad_salida, "
            "observaciones, receptor_usuario_id, created_by, created_at, "
            "salida_pdf_blob_path, salida_pdf_nombre, salida_pdf_mime"
        )
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return _enrich_salidas_rows(sb, contrato_id, rows)


def get_salida(contrato_id: int, salida_id: int) -> dict:
    sb = _sb()
    rows = (
        sb.table("almacen_salida")
        .select("*")
        .eq("id", salida_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Salida no encontrada.")
    enriched = _enrich_salidas_rows(sb, contrato_id, rows)
    return enriched[0]


def _enrich_salidas_rows(sb, contrato_id: int, rows: List[dict]) -> List[dict]:
    """Enriquece filas de salida (nombres, material, OC, código) sin N+1 por fila."""
    if not rows:
        return rows
    user_ids = []
    ei_ids = []
    for r in rows:
        if r.get("receptor_usuario_id"):
            user_ids.append(int(r["receptor_usuario_id"]))
        if r.get("created_by"):
            user_ids.append(int(r["created_by"]))
        if r.get("entrada_item_id"):
            ei_ids.append(int(r["entrada_item_id"]))
    names = _map_usuario_nombres(sb, user_ids)

    ei_map: Dict[int, dict] = {}
    if ei_ids:
        ei_rows = (
            sb.table("almacen_entrada_item")
            .select("id, orden_compra_item_id, presupuesto_id")
            .in_("id", ei_ids)
            .execute()
            .data
            or []
        )
        oci_ids = [int(x["orden_compra_item_id"]) for x in ei_rows if x.get("orden_compra_item_id")]
        oci_map: Dict[int, dict] = {}
        if oci_ids:
            oci_rows = (
                sb.table("almacen_orden_compra_item")
                .select("id, material_descripcion, unidad, orden_compra_id")
                .in_("id", oci_ids)
                .execute()
                .data
                or []
            )
            oc_ids = sorted({int(x["orden_compra_id"]) for x in oci_rows if x.get("orden_compra_id")})
            oc_map: Dict[int, dict] = {}
            if oc_ids:
                oc_rows = (
                    sb.table("almacen_orden_compra")
                    .select("id, numero_oc")
                    .in_("id", oc_ids)
                    .execute()
                    .data
                    or []
                )
                oc_map = {int(x["id"]): x for x in oc_rows}
            for o in oci_rows:
                oid = int(o["id"])
                oc_id = o.get("orden_compra_id")
                oci_map[oid] = {
                    **o,
                    "numero_oc": oc_map.get(int(oc_id), {}).get("numero_oc") if oc_id else None,
                }
        for e in ei_rows:
            oid = e.get("orden_compra_item_id")
            ei_map[int(e["id"])] = {
                **e,
                "almacen_orden_compra_item": oci_map.get(int(oid), {}) if oid else {},
            }

    # Un solo lookup de segmento de contrato por request (códigos legacy sin `codigo`).
    seg_cache: Dict[str, str] = {}

    def _codigo_salida_cached(numero_salida: int) -> str:
        if "seg" not in seg_cache:
            seg_cache["seg"] = _contrato_segmento_documento(contrato_id)
        return f"Sal-{seg_cache['seg']}-{int(numero_salida):05d}"

    for r in rows:
        r["receptor_nombre"] = names.get(int(r["receptor_usuario_id"])) if r.get("receptor_usuario_id") else None
        r["despachador_nombre"] = names.get(int(r["created_by"])) if r.get("created_by") else None
        ei = ei_map.get(int(r["entrada_item_id"] or 0), {})
        oci = ei.get("almacen_orden_compra_item") or {}
        r["material_descripcion"] = oci.get("material_descripcion")
        r["unidad"] = oci.get("unidad")
        r["numero_oc"] = oci.get("numero_oc")
        r["tiene_pdf_salida"] = bool(r.get("salida_pdf_blob_path"))
        if not (r.get("codigo") or "").strip() and r.get("numero_salida"):
            r["codigo"] = _codigo_salida_cached(int(r["numero_salida"]))
    return rows


def _pdf_ctx_for_salida(sb, contrato_id: int, sal: dict) -> dict:
    """Contexto para regenerar PDF POS de una salida existente."""
    ei_id = sal.get("entrada_item_id")
    material = sal.get("material_descripcion") or "—"
    unidad = sal.get("unidad") or "UND"
    numero_oc = sal.get("numero_oc")
    insumo_label = material
    presupuesto_label = "—"
    if ei_id:
        ei_rows = (
            sb.table("almacen_entrada_item")
            .select("orden_compra_item_id, presupuesto_id")
            .eq("id", int(ei_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if ei_rows:
            oci_id = ei_rows[0].get("orden_compra_item_id")
            if oci_id:
                oci = (
                    sb.table("almacen_orden_compra_item")
                    .select("material_descripcion, unidad, orden_compra_id, solicitud_item_id")
                    .eq("id", int(oci_id))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if oci:
                    material = oci[0].get("material_descripcion") or material
                    unidad = oci[0].get("unidad") or unidad
                    if oci[0].get("orden_compra_id"):
                        oc_r = (
                            sb.table("almacen_orden_compra")
                            .select("numero_oc")
                            .eq("id", int(oci[0]["orden_compra_id"]))
                            .limit(1)
                            .execute()
                            .data
                            or []
                        )
                        if oc_r:
                            numero_oc = oc_r[0].get("numero_oc")
                    sid = oci[0].get("solicitud_item_id")
                    if sid:
                        sol_it = (
                            sb.table("almacen_solicitud_item")
                            .select("capitulo, item, insumo_id, material_descripcion")
                            .eq("id", int(sid))
                            .limit(1)
                            .execute()
                            .data
                            or []
                        )
                        if sol_it:
                            cap = sol_it[0].get("capitulo")
                            itm = sol_it[0].get("item")
                            if cap or itm:
                                presupuesto_label = " · ".join(x for x in [cap, itm] if x)
                            iid = sol_it[0].get("insumo_id")
                            if iid:
                                ins = (
                                    sb.table("almacen_insumo")
                                    .select("codigo, descripcion")
                                    .eq("id", int(iid))
                                    .limit(1)
                                    .execute()
                                    .data
                                    or []
                                )
                                if ins:
                                    cod = (ins[0].get("codigo") or "").strip()
                                    desc = (ins[0].get("descripcion") or sol_it[0].get("material_descripcion") or material).strip()
                                    insumo_label = f"{cod} — {desc}".strip(" —") if cod else desc

    user_ids = [int(x) for x in (sal.get("receptor_usuario_id"), sal.get("created_by")) if x]
    names = _map_usuario_nombres(sb, user_ids)
    firmas: Dict[int, Optional[str]] = {}
    if user_ids:
        urows = (
            sb.table("usuarios")
            .select("id, firma_imagen_url")
            .in_("id", user_ids)
            .execute()
            .data
            or []
        )
        firmas = {int(u["id"]): u.get("firma_imagen_url") for u in urows}

    rec_id = int(sal["receptor_usuario_id"]) if sal.get("receptor_usuario_id") else None
    desp_id = int(sal["created_by"]) if sal.get("created_by") else None
    return {
        "numero_oc": numero_oc,
        "insumo_label": insumo_label,
        "presupuesto_label": presupuesto_label,
        "unidad": unidad,
        "receptor_nombre": names.get(rec_id) if rec_id else sal.get("receptor_nombre"),
        "receptor_firma": firmas.get(rec_id) if rec_id else None,
        "despachador_nombre": names.get(desp_id) if desp_id else sal.get("despachador_nombre"),
        "despachador_firma": firmas.get(desp_id) if desp_id else None,
    }


def download_salida_pdf(contrato_id: int, salida_id: int) -> tuple:
    """Descarga el recibo PDF. Reutiliza blob existente; solo regenera si falta."""
    sal = get_salida(contrato_id, salida_id)
    path = (sal.get("salida_pdf_blob_path") or "").strip()
    if path:
        data, _mime = download_soporte(path)
        if data:
            fname = sal.get("salida_pdf_nombre") or f"salida-{salida_id}.pdf"
            return data, fname
    sb = _sb()
    try:
        _generar_pdf_salida(contrato_id, salida_id, sal, _pdf_ctx_for_salida(sb, contrato_id, sal))
        sal = get_salida(contrato_id, salida_id)
    except Exception as exc:
        _log.warning("Regenerar PDF salida %s: %s", salida_id, exc)
    path = (sal.get("salida_pdf_blob_path") or "").strip()
    if not path:
        raise ValueError("El recibo de salida aún no está disponible. Intente de nuevo en unos segundos.")
    data, mime = download_soporte(path)
    fname = sal.get("salida_pdf_nombre") or f"salida-{salida_id}.pdf"
    return data, fname


def eliminar_salida(contrato_id: int, salida_id: int) -> dict:
    sb = _sb()
    sal = get_salida(contrato_id, salida_id)
    ei_id = int(sal["entrada_item_id"])
    qty = _to_float(sal.get("cantidad_salida"))

    devs = _sum_devoluciones_por_salida(sb, [int(salida_id)])
    if _to_float(devs.get(int(salida_id), 0)) > 1e-9:
        raise ValueError(
            "No se puede eliminar la salida porque tiene devoluciones registradas. "
            "Elimine primero las devoluciones asociadas."
        )

    ei_rows = sb.table("almacen_entrada_item").select("*").eq("id", ei_id).limit(1).execute().data or []
    if ei_rows:
        ei = ei_rows[0]
        material = "—"
        unidad = "UND"
        presupuesto_id = ei.get("presupuesto_id")
        oci_id = ei.get("orden_compra_item_id")
        if oci_id:
            oci = sb.table("almacen_orden_compra_item").select("material_descripcion, unidad, presupuesto_id").eq("id", int(oci_id)).limit(1).execute().data or []
            if oci:
                material = oci[0].get("material_descripcion") or material
                unidad = oci[0].get("unidad") or unidad
                presupuesto_id = oci[0].get("presupuesto_id") or presupuesto_id
        if presupuesto_id:
            _upsert_inventario(contrato_id, int(presupuesto_id), material, unidad, qty, 0)

    sb.table("almacen_movimiento").delete().eq("referencia_tipo", "salida").eq("referencia_id", int(salida_id)).execute()

    path = (sal.get("salida_pdf_blob_path") or "").strip()
    if path:
        try:
            delete_blob_private(path)
        except Exception as exc:
            _log.warning("No se pudo borrar PDF salida %s: %s", salida_id, exc)

    numero = int(sal.get("numero_salida") or 0)
    max_num = _max_consecutivo(contrato_id, "almacen_salida", "numero_salida")
    sb.table("almacen_salida").delete().eq("id", int(salida_id)).eq("contrato_id", contrato_id).execute()

    _invalidar_graficos_inventario(contrato_id)
    return {
        "ok": True,
        "id": int(salida_id),
        "numero_salida": numero,
        "consecutivo_liberado": numero > 0 and numero == max_num,
    }


def salidas_devolvibles_por_pk(contrato_id: int, pk_id: str) -> List[dict]:
    """Salidas del PK con saldo pendiente de devolver (> 0)."""
    sb = _sb()
    pk_query = _norm_pk_id(pk_id)
    if not pk_query:
        raise ValueError("Indique el PK-ID.")

    rows = (
        sb.table("almacen_salida")
        .select(
            "id, contrato_id, numero_salida, codigo, fecha_hora_salida, pk_id, pk_id_id, "
            "tramo, costado, abscisa_inicial, abscisa_final, entrada_item_id, cantidad_salida, "
            "receptor_usuario_id, created_by, created_at"
        )
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    matched = [r for r in rows if _pk_id_coincide(r.get("pk_id"), pk_query)]
    if not matched:
        return []

    enriched = _enrich_salidas_rows(sb, contrato_id, matched)
    salida_ids = [int(r["id"]) for r in enriched]
    dev_map = _sum_devoluciones_por_salida(sb, salida_ids)
    out: List[dict] = []
    for r in enriched:
        sid = int(r["id"])
        despachada = _to_float(r.get("cantidad_salida"))
        devuelta = _to_float(dev_map.get(sid, 0.0))
        pendiente = max(0.0, round(despachada - devuelta, 4))
        if pendiente <= 1e-9:
            continue
        out.append({
            **r,
            "cantidad_devuelta": devuelta,
            "cantidad_pendiente_devolver": pendiente,
        })
    return out


def create_devolucion(contrato_id: int, user_id: int, body: dict) -> dict:
    """Registra devolución parcial/total contra una salida y reactiva saldo disponible."""
    sb = _sb()
    salida_id = body.get("salida_id")
    if not salida_id:
        raise ValueError("Seleccione la salida contra la cual registra la devolución.")
    salida_id = int(salida_id)

    qty = _to_float(body.get("cantidad"))
    if qty <= 0:
        raise ValueError("Indique una cantidad a devolver mayor a cero.")

    receptor_id = body.get("receptor_usuario_id")
    if not receptor_id:
        raise ValueError("Indique quién realiza la devolución.")
    receptor = _validar_receptor_obra(sb, contrato_id, int(receptor_id))

    sal_rows = (
        sb.table("almacen_salida")
        .select("*")
        .eq("id", salida_id)
        .eq("contrato_id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sal_rows:
        raise ValueError("La salida seleccionada no existe.")
    sal = sal_rows[0]
    entrada_item_id = int(sal["entrada_item_id"])

    pk_id = _norm_pk_id(body.get("pk_id") or sal.get("pk_id"))
    if not pk_id:
        raise ValueError("Seleccione la ubicación (PK-ID) en el mapa.")
    if not _pk_id_coincide(sal.get("pk_id"), pk_id):
        raise ValueError("La salida seleccionada no corresponde al PK-ID indicado.")

    despachada = _to_float(sal.get("cantidad_salida"))
    ya_devuelta = _to_float(_sum_devoluciones_por_salida(sb, [salida_id]).get(salida_id, 0.0))
    pendiente = max(0.0, round(despachada - ya_devuelta, 4))
    if qty > pendiente + 1e-9:
        raise ValueError(
            f"La cantidad a devolver ({qty}) supera el pendiente de esta salida ({pendiente}). "
            f"Máximo permitido: {pendiente}."
        )

    costado = (body.get("costado") or "").strip() if body.get("costado") is not None else ""
    if not costado:
        raise ValueError("Indique el costado de la devolución.")
    abscisa_inicial = (
        (body.get("abscisa_inicial") or "").strip()
        if body.get("abscisa_inicial") is not None else ""
    )
    abscisa_final = (
        (body.get("abscisa_final") or "").strip()
        if body.get("abscisa_final") is not None else ""
    )
    if not abscisa_inicial or not abscisa_final:
        raise ValueError(
            "Indique abscisa inicial (ingreso) y abscisa final (salida) de la devolución."
        )

    fecha_hora = normalize_fecha_hora_bogota_to_utc_iso(
        (body.get("fecha_hora_devolucion") or "").strip()
    )
    numero = _next_consecutivo(contrato_id, "almacen_devolucion", "numero_devolucion")
    codigo = _format_codigo_devolucion(contrato_id, numero)

    row = {
        "contrato_id": contrato_id,
        "numero_devolucion": numero,
        "codigo": codigo,
        "salida_id": salida_id,
        "entrada_item_id": entrada_item_id,
        "cantidad": qty,
        "fecha_hora_devolucion": fecha_hora,
        "receptor_usuario_id": int(receptor_id),
        "pk_id": pk_id,
        "pk_id_id": int(body["pk_id_id"]) if body.get("pk_id_id") else sal.get("pk_id_id"),
        "tramo": (body.get("tramo") or sal.get("tramo") or "").strip() or None,
        "costado": costado,
        "abscisa_inicial": abscisa_inicial,
        "abscisa_final": abscisa_final,
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    ins = sb.table("almacen_devolucion").insert(row).execute().data
    if not ins:
        raise ValueError("No se pudo registrar la devolución.")
    devolucion_id = int(ins[0]["id"])

    material = "—"
    unidad = "UND"
    presupuesto_id = None
    numero_oc = None
    ei_rows = sb.table("almacen_entrada_item").select("*").eq("id", entrada_item_id).limit(1).execute().data or []
    if ei_rows:
        ei = ei_rows[0]
        presupuesto_id = ei.get("presupuesto_id")
        oci_id = ei.get("orden_compra_item_id")
        if oci_id:
            oci = (
                sb.table("almacen_orden_compra_item")
                .select("material_descripcion, unidad, orden_compra_id, presupuesto_id")
                .eq("id", int(oci_id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if oci:
                material = oci[0].get("material_descripcion") or material
                unidad = oci[0].get("unidad") or unidad
                presupuesto_id = oci[0].get("presupuesto_id") or presupuesto_id
                if oci[0].get("orden_compra_id"):
                    oc_r = (
                        sb.table("almacen_orden_compra")
                        .select("numero_oc")
                        .eq("id", int(oci[0]["orden_compra_id"]))
                        .limit(1)
                        .execute()
                        .data
                        or []
                    )
                    if oc_r:
                        numero_oc = oc_r[0].get("numero_oc")

    if presupuesto_id:
        sb.table("almacen_movimiento").insert({
            "contrato_id": contrato_id,
            "presupuesto_id": int(presupuesto_id),
            "material_descripcion": material,
            "unidad": unidad,
            "tipo": "devolucion",
            "cantidad": qty,
            "entrada_item_id": entrada_item_id,
            "referencia_tipo": "devolucion",
            "referencia_id": devolucion_id,
            "created_by": user_id,
        }).execute()
        # Reactiva stock (inverso de la salida).
        _upsert_inventario(contrato_id, int(presupuesto_id), material, unidad, qty, 0)

    recibida = _cantidad_recibida_entrada_item(sb, entrada_item_id)
    despacho_neto = _despacho_neto_por_entrada_item(sb, [entrada_item_id]).get(entrada_item_id, 0.0)
    disponible = _disponible_entrada_item(recibida, despacho_neto)
    pendiente_salida = max(0.0, round(despachada - ya_devuelta - qty, 4))

    _invalidar_graficos_inventario(contrato_id)
    return {
        **row,
        "id": devolucion_id,
        "receptor_nombre": receptor.get("label"),
        "material_descripcion": material,
        "unidad": unidad,
        "numero_oc": numero_oc,
        "numero_salida": sal.get("numero_salida"),
        "codigo_salida": sal.get("codigo"),
        "cantidad_pendiente_devolver": pendiente_salida,
        "cantidad_disponible_entrada": disponible,
    }


def list_devoluciones(contrato_id: int) -> List[dict]:
    sb = _sb()
    rows = (
        sb.table("almacen_devolucion")
        .select("*")
        .eq("contrato_id", contrato_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    if not rows:
        return []
    user_ids = []
    salida_ids = []
    for r in rows:
        if r.get("receptor_usuario_id"):
            user_ids.append(int(r["receptor_usuario_id"]))
        if r.get("created_by"):
            user_ids.append(int(r["created_by"]))
        if r.get("salida_id"):
            salida_ids.append(int(r["salida_id"]))
    names = _map_usuario_nombres(sb, user_ids)
    sal_map: Dict[int, dict] = {}
    if salida_ids:
        sal_rows = (
            sb.table("almacen_salida")
            .select("id, numero_salida, codigo, cantidad_salida, entrada_item_id")
            .in_("id", salida_ids)
            .execute()
            .data
            or []
        )
        # Reutilizar enriquecimiento (material / OC / unidad).
        enriched = _enrich_salidas_rows(sb, contrato_id, [
            {
                **s,
                "receptor_usuario_id": None,
                "created_by": None,
                "salida_pdf_blob_path": None,
            }
            for s in sal_rows
        ])
        sal_map = {int(s["id"]): s for s in enriched}

    for r in rows:
        sid = int(r["salida_id"]) if r.get("salida_id") else 0
        sal = sal_map.get(sid) or {}
        r["receptor_nombre"] = names.get(int(r["receptor_usuario_id"])) if r.get("receptor_usuario_id") else None
        r["registrado_por_nombre"] = names.get(int(r["created_by"])) if r.get("created_by") else None
        r["numero_salida"] = sal.get("numero_salida")
        r["codigo_salida"] = sal.get("codigo")
        r["material_descripcion"] = sal.get("material_descripcion")
        r["unidad"] = sal.get("unidad")
        r["numero_oc"] = sal.get("numero_oc")
    return rows

