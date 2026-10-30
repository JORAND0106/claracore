"""
Servicio — módulo Almacén de Obra (Fase 1).
"""
from __future__ import annotations

import logging
import mimetypes
import re
import threading
import time
import unicodedata
from datetime import date, datetime, timezone

from almacen_datetime import format_solicitud_titulo, normalize_fecha_hora_bogota_to_utc_iso
from almacen_dinero import a_decimal, fmt_dinero, producto
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

# Capítulo/ítem fijo: insumos cargados a Administración (AIU), sin ítem de obra.
CAPITULO_ADMINISTRACION_AIU = "Administración (AIU)"

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
    "es_principal",
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
    "justificacion_autor_id",
    "justificacion_autor_nombre",
    "justificacion_at",
    "proveedor_seleccionado_id",
    "proveedor_seleccionado_nombre",
    "cotizacion_numero_seleccionada",
    "numero_linea",
    "estado_validacion",
    "motivo_rechazo_linea",
    "solicitado_por",
    "grupo_seleccion",
    "grupo_etiqueta",
})

ESTADOS_ITEM_VALIDACION = frozenset({"pendiente", "aprobado", "rechazado"})


def _solicitud_editable(estado: str) -> bool:
    """Editable hasta generar OC (estado aprobada)."""
    return estado in ("borrador", "enviada", "rechazada")


def _exigir_agrupacion_libre(contrato_id: int, solicitud_id: int, user_id: int) -> None:
    """Otro usuario no edita la solicitud mientras Agrupar la tiene tomada."""
    from almacen_agrupar import exigir_solicitud_libre

    exigir_solicitud_libre(_sb(), contrato_id, solicitud_id, user_id)


def _sincronizar_titulo_solicitud(sb, solicitud_id: int) -> None:
    from almacen_agrupar import sincronizar_titulo_solicitud

    try:
        sincronizar_titulo_solicitud(sb, int(solicitud_id))
    except Exception:
        _log.exception("No se pudo actualizar el nombre de la solicitud %s", solicitud_id)


def _norm_pk_id(pk) -> str:
    return str(pk or "").strip()


def is_administracion_aiu(*parts) -> bool:
    """True si algún valor es el capítulo/ítem fijo Administración (AIU)."""
    label = CAPITULO_ADMINISTRACION_AIU.strip().lower()
    for p in parts:
        if str(p or "").strip().lower() == label:
            return True
    return False


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
    # Persistir siempre el booleano explícito (evita perder asociados por omisión/default).
    row["es_principal"] = _coerce_es_principal(item.get("es_principal"), default=True)
    # AIU: sin registro de presupuesto de obra.
    if is_administracion_aiu(row.get("capitulo"), row.get("item")):
        row["presupuesto_id"] = None
        row["capitulo"] = CAPITULO_ADMINISTRACION_AIU
        row["item"] = CAPITULO_ADMINISTRACION_AIU
        row["supera_presupuesto"] = False
        row["cant_presupuestada"] = None
    elif "presupuesto_id" in row and row.get("presupuesto_id") in (None, "", 0, "0"):
        row["presupuesto_id"] = None
    return row


def _coerce_es_principal(v, default: bool = True) -> bool:
    """Normaliza es_principal desde JSON/PostgREST/CSV a bool Python."""
    if v is None:
        return bool(default)
    if isinstance(v, str):
        return v.strip().lower() not in ("false", "0", "f", "no", "n", "off", "")
    if isinstance(v, (int, float)):
        return v != 0
    return bool(v)


def _nombre_usuario_id(sb, user_id: int) -> str:
    if not user_id:
        return ""
    try:
        names = _map_usuario_nombres(sb, [int(user_id)])
        return names.get(int(user_id)) or ""
    except Exception:
        return ""


def _aplicar_sello_justificacion(
    row: dict,
    prev: Optional[dict],
    user_id: int,
    autor_nombre: str,
) -> None:
    """Sella autor y fecha de la justificación de sobrepresupuesto. No pisa un texto igual."""
    obs = (row.get("observacion_residente") or "").strip()
    if not obs:
        row["observacion_residente"] = None
        row["justificacion_autor_id"] = None
        row["justificacion_autor_nombre"] = None
        row["justificacion_at"] = None
        return
    prev_obs = ((prev or {}).get("observacion_residente") or "").strip()
    if prev and prev_obs == obs and (prev.get("justificacion_autor_nombre") or prev.get("justificacion_at")):
        row["justificacion_autor_id"] = prev.get("justificacion_autor_id")
        row["justificacion_autor_nombre"] = prev.get("justificacion_autor_nombre")
        row["justificacion_at"] = prev.get("justificacion_at")
        return
    row["justificacion_autor_id"] = int(user_id) if user_id else None
    row["justificacion_autor_nombre"] = (autor_nombre or "").strip() or None
    row["justificacion_at"] = _now_iso()


def _select_items_para_sync(sb, solicitud_id: int) -> List[dict]:
    full = (
        "id, numero_linea, estado_validacion, observacion_residente, "
        "justificacion_autor_id, justificacion_autor_nombre, justificacion_at"
    )
    try:
        return (
            sb.table("almacen_solicitud_item")
            .select(full)
            .eq("solicitud_id", solicitud_id)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        text = str(exc).lower()
        if _pgrst_unknown_column(exc) or "does not exist" in text or "pgrst" in text:
            return (
                sb.table("almacen_solicitud_item")
                .select("id, estado_validacion")
                .eq("solicitud_id", solicitud_id)
                .execute()
                .data
                or []
            )
        raise


def _sync_solicitud_items(
    sb,
    solicitud_id: int,
    estado: str,
    items: List[dict],
    user_id: int = 0,
) -> None:
    """Upsert por id: actualiza existentes, inserta nuevos, elimina removidos.

    Evita delete-all + reinsert (lento y rompe ids/cotizaciones/estado_validacion).
    """
    existing_rows = _select_items_para_sync(sb, solicitud_id)
    existing_ids = {int(r["id"]) for r in existing_rows if r.get("id")}
    existing_by_id = {int(r["id"]): r for r in existing_rows if r.get("id")}
    existing_estado = {
        int(r["id"]): r.get("estado_validacion")
        for r in existing_rows
        if r.get("id")
    }
    from almacen_solicitud_numeracion import linea_congelada, planificar_numeros_linea

    keep_ids: set = set()
    planned: List[tuple] = []
    numeros = planificar_numeros_linea(existing_rows, items)
    for it, numero in zip(items, numeros):
        raw_id = it.get("id")
        try:
            iid = int(raw_id) if raw_id is not None else None
        except (TypeError, ValueError):
            iid = None
        if iid and iid in existing_ids:
            keep_ids.add(iid)
        it["numero_linea"] = numero
        planned.append((numero, it, iid))

    # Rechazar la baja antes de escribir: Guardar no elimina líneas persistidas.
    to_delete = existing_ids - keep_ids
    if to_delete:
        from almacen_eliminar_reglas import MOTIVO_LINEA_AL_GUARDAR, MOTIVO_LINEA_OC

        ocs = (
            sb.table("almacen_orden_compra")
            .select("id")
            .eq("solicitud_id", int(solicitud_id))
            .execute()
            .data
            or []
        )
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if to_delete & en_oc:
            raise ValueError(MOTIVO_LINEA_OC)
        raise ValueError(MOTIVO_LINEA_AL_GUARDAR)

    to_insert: List[dict] = []
    to_update: List[dict] = []
    autor = ""
    if user_id and any((it.get("observacion_residente") or "").strip() for it in items):
        autor = _nombre_usuario_id(sb, user_id)

    ocs = (
        sb.table("almacen_orden_compra")
        .select("id")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )
    en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
    congelados = {
        iid
        for iid in existing_ids
        if linea_congelada(existing_by_id.get(iid), en_oc)
    }

    for numero, it, iid in planned:
        if iid and iid in congelados:
            continue
        row = _item_for_db_insert(it)
        row["solicitud_id"] = solicitud_id
        row["numero_linea"] = numero
        if "observacion_residente" in it:
            _aplicar_sello_justificacion(
                row,
                existing_by_id.get(iid) if iid else None,
                user_id,
                autor,
            )
        if iid and iid in existing_ids:
            # Conservar estado_validacion previo salvo que el payload lo traiga.
            if "estado_validacion" not in row or row.get("estado_validacion") is None:
                prev = existing_estado.get(iid)
                if prev:
                    row["estado_validacion"] = prev
            from almacen_linea_partida import proteger_autor_linea

            proteger_autor_linea(row)
            to_update.append({"id": iid, **row})
        else:
            if estado in ("enviada", "rechazada") and not row.get("estado_validacion"):
                row["estado_validacion"] = "pendiente"
            from almacen_linea_partida import sellar_solicitado_por

            sellar_solicitado_por(row, user_id)
            to_insert.append(row)

    if to_update:
        _update_solicitud_items_batch(sb, to_update)
    if to_insert:
        _insert_solicitud_items_batch(sb, to_insert)
    _sync_solicitud_item_repartos(sb, solicitud_id, items, congelados=congelados)


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
    rows = []
    for i in range(0, len(ids), 80):
        chunk = ids[i:i + 80]
        rows.extend(
            sb.table("presupuesto")
            .select(
                "id, pk_id, capitulo, item, descripcion, und, cant_total, vlr_unitario, contrato_id, "
                "tramo, abs_inicio, abs_final, no_inicio, no_final"
            )
            .in_("id", chunk)
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


def _pgrst_unknown_column(err: BaseException) -> Optional[str]:
    """Extrae el nombre de columna ausente (PGRST204 / 42703 / schema cache)."""
    text = str(err or "")
    low = text.lower()
    if not any(tok in low for tok in ("pgrst204", "schema cache", "could not find", "does not exist", "42703")):
        return None
    m = re.search(r"find the ['\"]([^'\"]+)['\"] column", text, re.I)
    if m:
        return m.group(1)
    m = re.search(r"column\s+[\w.]+\.([a-zA-Z_][\w]*)\s+does not exist", text, re.I)
    if m:
        return m.group(1)
    m = re.search(r"column\s+[\"']?([a-zA-Z_][\w]*)[\"']?\s+does not exist", text, re.I)
    return m.group(1) if m else None


def _humanize_solicitud_db_error(exc: BaseException) -> str:
    """Mensaje accionable para fallos de PostgREST/Postgres al persistir solicitud."""
    col = _pgrst_unknown_column(exc)
    if col == "descripcion_solicitada":
        return (
            "Falta la columna descripcion_solicitada en almacen_solicitud_item. "
            "Ejecute en Supabase SQL Editor el script "
            "backend/sql/almacen_solicitud_descripcion_solicitada.sql "
            "(ADD COLUMN + NOTIFY pgrst, 'reload schema') y reintente."
        )
    if col == "es_principal":
        return (
            "Falta la columna es_principal en almacen_solicitud_item "
            "(principal vs asociado). Ejecute en Supabase SQL Editor el script "
            "backend/sql/almacen_solicitud_es_principal.sql "
            "(ADD COLUMN + NOTIFY pgrst, 'reload schema') y reintente. "
            "Sin esa migración la clasificación no se puede guardar."
        )
    if col:
        return (
            f"La base de datos no reconoce la columna «{col}» en la solicitud "
            f"(migración pendiente o caché PostgREST). Ejecute la migración SQL "
            f"correspondiente y NOTIFY pgrst, 'reload schema'; luego reintente. "
            f"Detalle: {str(exc)[:280]}"
        )
    text = str(exc or "").strip()
    low = text.lower()
    # NOT NULL / FK en presupuesto_id → migración AIU pendiente.
    if "presupuesto_id" in low and any(
        tok in low for tok in ("null value", "not-null", "not null", "23502")
    ):
        return (
            "La columna presupuesto_id aún no admite NULL (líneas Administración AIU). "
            "Ejecute en Supabase SQL Editor el script "
            "backend/sql/almacen_solicitud_administracion_aiu.sql "
            "(ALTER COLUMN … DROP NOT NULL + NOTIFY pgrst) y reintente."
        )
    if "solicitud_id" in low and any(
        tok in low for tok in ("null value", "not-null", "not null", "23502")
    ):
        return (
            "No se pudo guardar porque una línea llegó sin su solicitud. "
            "No se creó ninguna línea nueva. Recargue la solicitud, vuelva a seleccionar "
            "las líneas originales e intente de nuevo."
        )
    if "numero_linea" in low and any(
        tok in low for tok in ("null value", "not-null", "not null", "23502")
    ):
        return (
            "No se pudo guardar porque una línea llegó sin su número. "
            "No se creó ninguna línea nueva. Recargue la solicitud e intente de nuevo."
        )
    if "almacen_solicitud_item_reparto" in low and any(
        tok in low for tok in ("does not exist", "pgrst205", "schema cache", "could not find")
    ):
        return (
            "Falta la tabla almacen_solicitud_item_reparto (selección múltiple de registros). "
            "Ejecute en Supabase SQL Editor el script "
            "backend/sql/almacen_solicitud_item_reparto.sql "
            "(CREATE TABLE + NOTIFY pgrst, 'reload schema') y reintente."
        )
    if "idx_almacen_solicitud_item_linea" in low or (
        "numero_linea" in low and ("unique" in low or "23505" in low or "duplicate" in low)
    ):
        return (
            "No se pudo agregar el material porque el número de línea chocó con otra "
            "línea de la misma solicitud. Recargue la solicitud e intente de nuevo."
        )
    if text:
        return f"No se pudo guardar la solicitud en la base de datos: {text[:400]}"
    return "No se pudo guardar la solicitud en la base de datos (error desconocido)."


def _attach_repartos_en_lote(
    contrato_id: int,
    pares: List[tuple],
    *,
    exclude_solicitud_id: Optional[int] = None,
) -> None:
    """Reparte varias líneas con la misma consulta de registros por capítulo, ítem y PK."""
    from almacen_insumos_service import list_presupuesto_registros
    from almacen_presupuesto_reparto import normalize_presupuesto_ids

    multi: List[tuple] = []
    for src, dst in pares:
        if dst.get("presupuesto_id") is None and not (
            src.get("presupuesto_ids") or src.get("presupuesto_id")
        ):
            dst.setdefault("presupuesto_ids", [])
            dst.setdefault("repartos", [])
            continue
        pids = normalize_presupuesto_ids(
            src.get("presupuesto_ids") or dst.get("presupuesto_ids"),
            src.get("presupuesto_id") or dst.get("presupuesto_id"),
        )
        if len(pids) <= 1:
            _attach_reparto_meta(
                contrato_id,
                dst,
                src,
                exclude_solicitud_id=exclude_solicitud_id,
            )
            continue
        pk = (dst.get("pk_id") or src.get("pk_id") or "").strip()
        cap = (dst.get("capitulo") or "").strip()
        item_n = (dst.get("item") or "").strip()
        if not (pk and cap and item_n):
            raise ValueError("Seleccione capítulo, ítem y PK-ID para el reparto de presupuesto.")
        try:
            iid = int(dst.get("insumo_id") or 0)
        except (TypeError, ValueError):
            iid = 0
        multi.append((dst, pids, pk, cap, item_n, iid))

    grupos: Dict[tuple, List[tuple]] = {}
    for dst, pids, pk, cap, item_n, iid in multi:
        grupos.setdefault((cap, item_n, pk, iid), []).append((dst, pids))

    for (cap, item_n, pk, iid), group in grupos.items():
        data = list_presupuesto_registros(
            contrato_id,
            cap,
            item_n,
            pk,
            exclude_solicitud_id=exclude_solicitud_id,
            insumo_id=iid or None,
        )
        by_id = {int(r["presupuesto_id"]): r for r in (data.get("registros") or [])}
        for dst, pids in group:
            _aplicar_reparto_seleccionado(dst, pids, by_id, pk)


def _aplicar_reparto_seleccionado(item: dict, pids: List[int], by_id: Dict[int, dict], pk: str) -> None:
    from almacen_presupuesto_reparto import (
        repartir_cantidad_proporcional,
        total_saldo_registros,
    )

    selected = []
    for pid in pids:
        reg = by_id.get(int(pid))
        if not reg:
            raise ValueError(
                f"El registro de presupuesto {pid} no coincide con capítulo, ítem y PK-ID."
            )
        selected.append(reg)
    cant = _to_float(item.get("cantidad"))
    if _coerce_es_principal(item.get("es_principal"), default=True):
        shares = repartir_cantidad_proporcional(cant, selected)
    else:
        shares = [{"presupuesto_id": int(r["presupuesto_id"]), "cantidad": 0.0} for r in selected]
    item["presupuesto_id"] = pids[0]
    item["presupuesto_ids"] = pids
    item["repartos"] = [
        {"presupuesto_id": int(s["presupuesto_id"]), "cantidad": _to_float(s["cantidad"])}
        for s in shares
        if _to_float(s.get("cantidad")) > 0
    ]
    item["cant_presupuestada"] = sum(_to_float(r.get("cant_total")) for r in selected)
    saldo_combo = total_saldo_registros(selected)
    if _coerce_es_principal(item.get("es_principal"), default=True):
        item["supera_presupuesto"] = (saldo_combo - cant) < -0.0001
    item["contexto_presupuesto"] = {
        **(item.get("contexto_presupuesto") or {}),
        "presupuesto_id": pids[0],
        "presupuesto_ids": pids,
        "pk_id": pk,
        "cant_presupuestada": item["cant_presupuestada"],
        "cant_presupuestada_combo": item["cant_presupuestada"],
        "registros_combo_count": len(pids),
        "saldo_disponible_despues": saldo_combo - (
            cant if _coerce_es_principal(item.get("es_principal"), default=True) else 0
        ),
        "supera_presupuesto": item.get("supera_presupuesto", False),
        "repartos": item["repartos"],
    }


def _attach_reparto_meta(
    contrato_id: int,
    item: dict,
    raw: dict,
    *,
    exclude_solicitud_id: Optional[int] = None,
) -> None:
    """Calcula presupuesto_ids + repartos proporcionales y ajusta cant_presupuestada."""
    from almacen_insumos_service import list_presupuesto_registros
    from almacen_presupuesto_reparto import (
        normalize_presupuesto_ids,
        repartir_cantidad_proporcional,
        total_saldo_registros,
    )

    if is_administracion_aiu(item.get("capitulo"), item.get("item")):
        item["presupuesto_ids"] = []
        item["repartos"] = []
        return

    pids = normalize_presupuesto_ids(
        raw.get("presupuesto_ids") or item.get("presupuesto_ids"),
        raw.get("presupuesto_id") or item.get("presupuesto_id"),
    )
    if not pids:
        item["presupuesto_ids"] = []
        item["repartos"] = []
        return

    item["presupuesto_id"] = pids[0]
    item["presupuesto_ids"] = pids
    if len(pids) == 1:
        item["repartos"] = [{
            "presupuesto_id": pids[0],
            "cantidad": _to_float(item.get("cantidad")),
        }]
        return

    pk = (item.get("pk_id") or raw.get("pk_id") or "").strip()
    cap = (item.get("capitulo") or "").strip()
    item_n = (item.get("item") or "").strip()
    if not (pk and cap and item_n):
        raise ValueError("Seleccione capítulo, ítem y PK-ID para el reparto de presupuesto.")

    data = list_presupuesto_registros(
        contrato_id,
        cap,
        item_n,
        pk,
        exclude_solicitud_id=exclude_solicitud_id,
        insumo_id=item.get("insumo_id"),
    )
    by_id = {int(r["presupuesto_id"]): r for r in (data.get("registros") or [])}
    selected = []
    for pid in pids:
        reg = by_id.get(int(pid))
        if not reg:
            raise ValueError(
                f"El registro de presupuesto {pid} no coincide con capítulo, ítem y PK-ID."
            )
        selected.append(reg)

    cant = _to_float(item.get("cantidad"))
    if _coerce_es_principal(item.get("es_principal"), default=True):
        shares = repartir_cantidad_proporcional(cant, selected)
    else:
        shares = [{"presupuesto_id": int(r["presupuesto_id"]), "cantidad": 0.0} for r in selected]

    item["repartos"] = [
        {"presupuesto_id": int(s["presupuesto_id"]), "cantidad": _to_float(s["cantidad"])}
        for s in shares
        if _to_float(s.get("cantidad")) > 0
    ]
    item["cant_presupuestada"] = sum(_to_float(r.get("cant_total")) for r in selected)
    # Contexto combinado para flags / UI.
    saldo_combo = total_saldo_registros(selected)
    if _coerce_es_principal(item.get("es_principal"), default=True):
        item["supera_presupuesto"] = (saldo_combo - cant) < -0.0001
    item["contexto_presupuesto"] = {
        **(item.get("contexto_presupuesto") or {}),
        "presupuesto_id": pids[0],
        "presupuesto_ids": pids,
        "pk_id": pk,
        "cant_presupuestada": item["cant_presupuestada"],
        "cant_presupuestada_combo": item["cant_presupuestada"],
        "registros_combo_count": len(pids),
        "saldo_disponible_despues": saldo_combo - (
            cant if _coerce_es_principal(item.get("es_principal"), default=True) else 0
        ),
        "supera_presupuesto": item.get("supera_presupuesto", False),
        "repartos": item["repartos"],
    }


def _sync_solicitud_item_repartos(
    sb,
    solicitud_id: int,
    items: List[dict],
    congelados: Optional[set] = None,
) -> None:
    """Persiste filas de reparto proporcional; omite si la tabla aún no existe."""
    db_items = list(
        sb.table("almacen_solicitud_item")
        .select("id, numero_linea, presupuesto_id")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )
    db_items.sort(key=lambda r: (int(r.get("numero_linea") or 0), int(r.get("id") or 0)))
    by_id = {int(r["id"]): r for r in db_items if r.get("id")}
    by_linea = {}
    for r in db_items:
        try:
            by_linea[int(r.get("numero_linea") or 0)] = r
        except (TypeError, ValueError):
            pass

    congelados = congelados or set()
    objetivos: List[tuple] = []
    for i, it in enumerate(items, start=1):
        iid = None
        if it.get("id") is not None:
            try:
                cand = int(it["id"])
            except (TypeError, ValueError):
                cand = None
            if cand and cand in by_id:
                iid = cand
        if iid is None:
            try:
                numero = int(it.get("numero_linea") or 0)
            except (TypeError, ValueError):
                numero = 0
            row = by_linea.get(numero) if numero else None
            if row is None:
                row = by_linea.get(i)
            if row and row.get("id"):
                iid = int(row["id"])
        if not iid or iid in congelados:
            continue

        repartos = it.get("repartos") or []
        pids = it.get("presupuesto_ids") or []
        rows = []
        # Una sola selección: se limpia la tabla (el acumulado usa presupuesto_id de la línea).
        if not (len(pids) <= 1 and len(repartos) <= 1):
            for r in repartos:
                try:
                    pid = int(r.get("presupuesto_id"))
                except (TypeError, ValueError):
                    continue
                cant = _to_float(r.get("cantidad"))
                if pid <= 0 or cant <= 0:
                    continue
                rows.append({
                    "solicitud_item_id": iid,
                    "presupuesto_id": pid,
                    "cantidad": cant,
                })
        objetivos.append((iid, rows))

    if not objetivos:
        return
    ids = [iid for iid, _rows in objetivos]
    try:
        for i in range(0, len(ids), 80):
            sb.table("almacen_solicitud_item_reparto").delete().in_(
                "solicitud_item_id", ids[i:i + 80],
            ).execute()
    except Exception as exc:
        low = str(exc).lower()
        if "almacen_solicitud_item_reparto" in low and any(
            tok in low for tok in ("does not exist", "pgrst205", "schema cache", "could not find")
        ):
            return
        raise ValueError(_humanize_solicitud_db_error(exc)) from exc
    inserts = []
    for _iid, rows in objetivos:
        inserts.extend(rows)
    if not inserts:
        return
    try:
        for i in range(0, len(inserts), 80):
            sb.table("almacen_solicitud_item_reparto").insert(inserts[i:i + 80]).execute()
    except Exception as exc:
        raise ValueError(_humanize_solicitud_db_error(exc)) from exc


def _attach_repartos_to_items(sb, items: List[dict]) -> None:
    """Adjunta presupuesto_ids / repartos a ítems ya cargados (lectura)."""
    ids = [int(it["id"]) for it in items if it.get("id")]
    if not ids:
        for it in items:
            pid = it.get("presupuesto_id")
            it["presupuesto_ids"] = [int(pid)] if pid else []
            it["repartos"] = []
        return
    try:
        rows = (
            sb.table("almacen_solicitud_item_reparto")
            .select("solicitud_item_id, presupuesto_id, cantidad")
            .in_("solicitud_item_id", ids)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        low = str(exc).lower()
        if "almacen_solicitud_item_reparto" in low and any(
            tok in low for tok in ("does not exist", "pgrst205", "schema cache", "could not find")
        ):
            for it in items:
                pid = it.get("presupuesto_id")
                it["presupuesto_ids"] = [int(pid)] if pid else []
                it["repartos"] = []
            return
        raise
    by_item: Dict[int, List[dict]] = {}
    for r in rows:
        try:
            iid = int(r["solicitud_item_id"])
            pid = int(r["presupuesto_id"])
        except (TypeError, ValueError, KeyError):
            continue
        by_item.setdefault(iid, []).append({
            "presupuesto_id": pid,
            "cantidad": _to_float(r.get("cantidad")),
        })
    for it in items:
        iid = int(it["id"]) if it.get("id") else None
        reps = by_item.get(iid or -1) or []
        if reps:
            # Primario = presupuesto_id de la línea; resto en orden de id.
            primary = int(it["presupuesto_id"]) if it.get("presupuesto_id") else None
            ordered = sorted(
                reps,
                key=lambda x: (0 if primary and x["presupuesto_id"] == primary else 1, x["presupuesto_id"]),
            )
            it["repartos"] = ordered
            it["presupuesto_ids"] = [r["presupuesto_id"] for r in ordered]
        else:
            pid = it.get("presupuesto_id")
            it["presupuesto_ids"] = [int(pid)] if pid else []
            it["repartos"] = (
                [{"presupuesto_id": int(pid), "cantidad": _to_float(it.get("cantidad"))}]
                if pid else []
            )


# Columnas críticas: si faltan en el esquema, NO omitir en silencio (rompe funcionalidad).
_SOLICITUD_ITEM_CRITICAL_COLUMNS = frozenset({
    "es_principal",
})


def _insert_solicitud_items_batch(sb, rows: List[dict], chunk_size: int = 80) -> None:
    """Inserta ítems; si PostgREST reporta columna ausente no crítica, la omite y reintenta.

    ``es_principal`` y otras columnas críticas NO se omiten: fallan con mensaje de migración.
    """
    if not rows:
        return
    omitted: set[str] = set()
    for i in range(0, len(rows), chunk_size):
        chunk = [{k: v for k, v in row.items() if k not in omitted} for row in rows[i : i + chunk_size]]
        strips = 0
        while strips <= 16:
            try:
                sb.table("almacen_solicitud_item").insert(chunk).execute()
                break
            except Exception as exc:
                col = _pgrst_unknown_column(exc)
                if not col or col in omitted:
                    raise ValueError(_humanize_solicitud_db_error(exc)) from exc
                if col in _SOLICITUD_ITEM_CRITICAL_COLUMNS:
                    raise ValueError(_humanize_solicitud_db_error(exc)) from exc
                omitted.add(col)
                _log.warning(
                    "almacen_solicitud_item: omitiendo columna ausente %s al insertar (migración pendiente)",
                    col,
                )
                chunk = [{k: v for k, v in row.items() if k not in omitted} for row in chunk]
                strips += 1
        else:
            raise ValueError(
                "No se pudieron insertar los ítems de la solicitud: demasiadas columnas ausentes en el esquema."
            )


def _update_solicitud_item_row(sb, item_id: int, row: dict) -> None:
    """Actualiza una línea; omite columnas ausentes no críticas; falla si falta es_principal."""
    payload = dict(row)
    omitted: set[str] = set()
    strips = 0
    while strips <= 16:
        try:
            body = {k: v for k, v in payload.items() if k not in omitted}
            sb.table("almacen_solicitud_item").update(body).eq("id", int(item_id)).execute()
            return
        except Exception as exc:
            col = _pgrst_unknown_column(exc)
            if not col or col in omitted:
                raise ValueError(_humanize_solicitud_db_error(exc)) from exc
            if col in _SOLICITUD_ITEM_CRITICAL_COLUMNS:
                raise ValueError(_humanize_solicitud_db_error(exc)) from exc
            omitted.add(col)
            _log.warning(
                "almacen_solicitud_item: omitiendo columna ausente %s al actualizar (migración pendiente)",
                col,
            )
            strips += 1
    raise ValueError(
        "No se pudo actualizar el ítem de la solicitud: demasiadas columnas ausentes en el esquema."
    )


def _patch_solicitud_items_by_id(sb, rows: List[dict]) -> None:
    """UPDATE parcial de líneas existentes con UPDATE por id (nunca upsert).

    El upsert de PostgREST intenta INSERT primero: si el patch no trae todas las
    columnas NOT NULL (solicitud_id, numero_linea, …), falla aunque la fila exista.
    Aquí solo se actualizan campos enviados; identidad y número no se tocan.
    """
    if not rows:
        return
    for row in rows:
        if row.get("id") in (None, ""):
            raise ValueError(
                "No se puede actualizar una línea sin su identidad. "
                "Recargue la solicitud e intente de nuevo."
            )
        iid = int(row["id"])
        body = {
            k: v
            for k, v in row.items()
            if k not in ("id", "solicitado_por", "solicitud_id", "numero_linea")
        }
        if not body:
            continue
        _update_solicitud_item_row(sb, iid, body)


def _update_solicitud_items_batch(sb, rows: List[dict], chunk_size: int = 80) -> None:
    """Actualiza muchas líneas en pocos upserts. Sin upsert, cae al update de a una.

    Para filas ya existentes con patch parcial (p. ej. mapear en bloque) use
    ``_patch_solicitud_items_by_id``: el upsert exige todas las columnas NOT NULL.

    Cada fila de upsert debe traer ``id``, ``solicitud_id`` y ``numero_linea``.
    """
    if not rows:
        return
    for row in rows:
        if row.get("id") in (None, ""):
            raise ValueError(
                "No se puede actualizar una línea sin su identidad. "
                "Recargue la solicitud e intente de nuevo."
            )
        if row.get("solicitud_id") in (None, ""):
            raise ValueError(
                "No se puede guardar una línea sin su solicitud. "
                "Recargue la solicitud e intente de nuevo; si el problema continúa, avise a soporte."
            )
        if row.get("numero_linea") in (None, ""):
            raise ValueError(
                "No se puede guardar una línea sin su número. "
                "Recargue la solicitud e intente de nuevo."
            )
    probe = sb.table("almacen_solicitud_item")
    upsert = getattr(probe, "upsert", None)
    if not callable(upsert):
        for row in rows:
            iid = int(row["id"])
            body = {k: v for k, v in row.items() if k != "id" and k != "solicitado_por"}
            _update_solicitud_item_row(sb, iid, body)
        return
    omitted: set[str] = set()
    for i in range(0, len(rows), chunk_size):
        chunk = [
            {k: v for k, v in row.items() if k not in omitted and k != "solicitado_por"}
            for row in rows[i:i + chunk_size]
        ]
        strips = 0
        while strips <= 16:
            try:
                sb.table("almacen_solicitud_item").upsert(chunk, on_conflict="id").execute()
                break
            except Exception as exc:
                col = _pgrst_unknown_column(exc)
                if not col or col in omitted:
                    raise ValueError(_humanize_solicitud_db_error(exc)) from exc
                if col in _SOLICITUD_ITEM_CRITICAL_COLUMNS:
                    raise ValueError(_humanize_solicitud_db_error(exc)) from exc
                omitted.add(col)
                chunk = [
                    {k: v for k, v in row.items() if k not in omitted and k != "solicitado_por"}
                    for row in chunk
                ]
                strips += 1
        else:
            raise ValueError(
                "No se pudieron actualizar los ítems de la solicitud: demasiadas columnas ausentes en el esquema."
            )


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


def _attach_valor_compra_linea(it: dict, cat_map: Optional[Dict[int, dict]] = None) -> None:
    """Cantidad × oferta del proveedor elegido (o la ganadora si aún no hay elección)."""
    cant = _to_float(it.get("cantidad"))
    unit = _to_float(it.get("valor_compra_unitario"))
    if unit <= 0 and it.get("insumo_id") and cat_map:
        cat = cat_map.get(int(it["insumo_id"])) or {}
        unit = _to_float(cat.get("valor_compra_referencia"))
    if cant > 0 and unit > 0:
        it["valor_compra_linea"] = producto(cant, unit)
    else:
        it["valor_compra_linea"] = None


def _strip_economics_item(it: dict) -> None:
    it.pop("analisis_valor", None)
    it.pop("analisis_rentabilidad", None)
    it.pop("valor_compra_unitario", None)
    it.pop("valor_compra_linea", None)
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
    precios_fijados: Optional[set] = None,
    diferir_secundarios: bool = False,
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
    # Antes de la OC la cotización vigente manda: se persiste para que la grilla
    # no siga mostrando el precio con el que se creó la línea.
    # Al guardar, esto corre después de responder (no hace falta para confirmar el alta).
    if not diferir_secundarios:
        try:
            oc_rows_precio = _fetch_ocs_de_solicitud(sb, int(sol["contrato_id"]), int(sid))
            ids_oc = (
                _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in oc_rows_precio if o.get("id")])
                if oc_rows_precio
                else set()
            )
            sincronizar_precios_sin_oc(sb, items, ids_oc, omitir_ids=precios_fijados)
        except Exception:
            _log.exception("No se pudo sincronizar el precio vigente de la solicitud %s", sid)
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
        # Descripción del ítem de cobro (barata): necesaria en Revisión de línea
        # aunque el GET sea ligero (mapear/validar también devuelven ligera).
        ppto_ids_lig = [int(it["presupuesto_id"]) for it in items if it.get("presupuesto_id")]
        ppto_map_lig = _fetch_ppto_rows_batch(ppto_ids_lig, int(sol["contrato_id"]))
        for it in items:
            iid = it.get("insumo_id")
            if iid and int(iid) in insumo_codigos:
                it["insumo_codigo"] = insumo_codigos[int(iid)]
            pid = it.get("presupuesto_id")
            if pid and int(pid) in ppto_map_lig:
                pr = ppto_map_lig[int(pid)]
                desc = (pr.get("descripcion") or "").strip()
                if desc:
                    it["item_descripcion"] = desc
                if not it.get("capitulo"):
                    it["capitulo"] = pr.get("capitulo")
                if not it.get("item"):
                    it["item"] = pr.get("item")
            _attach_valor_compra_linea(it)
            if not ver_economicos:
                _strip_economics_item(it)
        _attach_repartos_to_items(sb, items)
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

        _attach_repartos_to_items(sb, items)
        ppto_ids = []
        for it in items:
            for pid in (it.get("presupuesto_ids") or (
                [it["presupuesto_id"]] if it.get("presupuesto_id") else []
            )):
                if pid:
                    ppto_ids.append(int(pid))
        ppto_map = _fetch_ppto_rows_batch(ppto_ids, int(sol["contrato_id"]))
        for it in items:
            pids = it.get("presupuesto_ids") or (
                [it["presupuesto_id"]] if it.get("presupuesto_id") else []
            )
            pids = [int(p) for p in pids if p]
            if len(pids) > 1:
                tot = 0.0
                for pid in pids:
                    pr = ppto_map.get(pid)
                    if pr:
                        tot += _to_float(pr.get("cant_total"))
                if tot > 0:
                    it["cant_presupuestada"] = tot
            pid = it.get("presupuesto_id")
            if pid and int(pid) in ppto_map:
                pr = ppto_map[int(pid)]
                if it.get("cant_presupuestada") is None:
                    it["cant_presupuestada"] = _to_float(pr.get("cant_total"))
                if not it.get("capitulo"):
                    it["capitulo"] = pr.get("capitulo")
                if not it.get("item"):
                    it["item"] = pr.get("item")
                desc = (pr.get("descripcion") or "").strip()
                if desc:
                    it["item_descripcion"] = desc
                    it.setdefault("descripcion_item", desc)

        apply_saldo_flags_batch(
            int(sol["contrato_id"]),
            items,
            exclude_solicitud_id=None,
            descontar_linea_actual=False,
            # Si hay líneas mapeadas sin cobro usable, reconsultar listado (caché TTL).
            refresh_listado=any(
                it.get("insumo_id")
                and (it.get("es_principal") is not False)
                and _to_float(it.get("vlr_unitario_cobro")) <= 0
                for it in items
            ),
        )

        # Persistir cobros sanados (p. ej. NP-01 con mismatch de capítulo) para no repetir el fallo.
        for it in items:
            iid = it.get("id")
            if not iid or not it.get("insumo_id"):
                continue
            if it.get("es_principal") is False:
                continue
            vlr = _to_float(it.get("vlr_unitario_cobro"))
            if vlr <= 0:
                continue
            # Solo actualizar si venía vacío/cero en BD y ahora hay valor.
            # apply_saldo_flags_batch muta in-place; marcamos con flag interno.
            if it.pop("_cobro_sanado", None):
                try:
                    sb.table("almacen_solicitud_item").update({
                        "vlr_unitario_cobro": vlr,
                    }).eq("id", int(iid)).execute()
                except Exception:
                    pass

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
            motivo = it.get("cobro_motivo") if vlr <= 0 else None
            if vlr <= 0 and it.get("es_principal") is False:
                motivo = "insumo_asociado"
            it["analisis_valor"] = _build_analisis_valor(
                cant,
                vc if vc > 0 else None,
                vlr,
                cobro_motivo=motivo,
            )
            _attach_valor_compra_linea(it, cot_map)
            if not ver_economicos:
                _strip_economics_item(it)

        # Una tabla de rentabilidad por ítem de presupuesto (agrega principal + asociados).
        rent_cache: Dict[str, dict] = {}
        if include_rentabilidad and ver_economicos:
            for it in items:
                if not it.get("id"):
                    continue
                pid = it.get("presupuesto_id")
                cache_key = (
                    f"p:{int(pid)}"
                    if pid
                    else f"c:{(it.get('capitulo') or '').strip()}|{(it.get('item') or '').strip()}"
                )
                if cache_key in rent_cache:
                    it["analisis_rentabilidad"] = rent_cache[cache_key]
                    continue
                try:
                    vc = _to_float(it.get("valor_compra_unitario"))
                    vlr = _to_float(it.get("vlr_unitario_cobro"))
                    cant = _to_float(it.get("cantidad"))
                    ar = get_analisis_rentabilidad_por_oc(
                        int(sol["contrato_id"]),
                        solicitud_item_id=int(it["id"]),
                        solicitud_id=int(sid),
                        insumo_id=int(it["insumo_id"]) if it.get("insumo_id") else None,
                        capitulo=it.get("capitulo") or "",
                        item_cobro=it.get("item") or "",
                        cantidad_presente=cant,
                        valor_compra_unitario=vc if vc > 0 else None,
                        valor_cobro_unitario=vlr,
                        solicitud_consecutivo=sol.get("consecutivo"),
                        presupuesto_id=int(pid) if pid else None,
                        pk_id=it.get("pk_id"),
                        pk_id_id=int(it["pk_id_id"]) if it.get("pk_id_id") is not None else None,
                    )
                    rent_cache[cache_key] = ar
                    it["analisis_rentabilidad"] = ar
                except Exception:
                    pass
        sol["items"] = items

    oc_rows = _fetch_ocs_de_solicitud(sb, int(sol["contrato_id"]), sid)
    if oc_rows:
        for oc_row in oc_rows:
            oc_row["tiene_pdf_oc"] = bool(oc_row.get("pdf_blob_path"))
        sol["ordenes_compra"] = oc_rows
        sol["orden_compra"] = oc_rows[0]
        sol["tiene_orden_compra"] = True
        oc_item_ids = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in oc_rows])
        for it in sol["items"]:
            if int(it.get("id") or 0) in oc_item_ids:
                it["en_orden_compra"] = True
                it["estado_validacion"] = "aprobado"
        fuera = lineas_fuera_de_oc(sol.get("items") or [], oc_item_ids)
        sol["oc_parcial"] = bool(fuera)
        if fuera and sol.get("estado") == "aprobada":
            sb.table("almacen_solicitud").update({
                "estado": "enviada",
            }).eq("id", sid).execute()
            sol["estado"] = "enviada"
        elif not fuera and sol.get("estado") not in ("aprobada", "rechazada", "borrador"):
            sb.table("almacen_solicitud").update({
                "estado": "aprobada",
            }).eq("id", sid).execute()
            sol["estado"] = "aprobada"
    else:
        sol["ordenes_compra"] = []
        sol["orden_compra"] = None
        sol["tiene_orden_compra"] = False
        sol["oc_parcial"] = False

    # Flag de corrección post-OC: disponible si alguna OC con líneas aún no tiene entradas.
    if sol.get("ordenes_compra"):
        alguna_sin_entrada = False
        for oc_row in sol["ordenes_compra"]:
            oc_id = int(oc_row["id"])
            ent = (
                sb.table("almacen_entrada")
                .select("id")
                .eq("orden_compra_id", oc_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            oc_row["tiene_entradas"] = bool(ent)
            if not ent:
                alguna_sin_entrada = True
        if sol.get("orden_compra"):
            sol["orden_compra"]["tiene_entradas"] = bool(sol["ordenes_compra"][0].get("tiene_entradas"))
        sol["puede_corregir_insumo_post_oc"] = alguna_sin_entrada
    else:
        sol["puede_corregir_insumo_post_oc"] = False

    # Ligera: no resolver validadores (N+1); el detalle completo sí puede.
    vpend = [] if ligera else validadores_pendientes
    sol = _enrich_solicitud_usuarios(sb, sol, vpend)
    _attach_proveedor_lineas(
        sb, sol.get("items") or [], persistir=not diferir_secundarios,
    )
    sol["resumen_proveedores"] = _resumen_proveedores_solicitud(sol.get("items") or [])
    _attach_justificacion_visible(sol)
    _attach_parentesco_solicitud(sb, sol)
    _attach_solicitante_linea(sb, sol)
    return sol


def _attach_parentesco_solicitud(sb, sol: dict) -> None:
    """La solicitud original y el grupo derivado se ven el uno al otro."""
    origen_id = sol.get("solicitud_origen_id")
    if origen_id:
        try:
            rows = (
                sb.table("almacen_solicitud")
                .select("id, consecutivo, titulo, estado")
                .eq("id", int(origen_id))
                .limit(1)
                .execute()
                .data
                or []
            )
            if rows:
                sol["solicitud_origen"] = {
                    "id": rows[0].get("id"),
                    "consecutivo": rows[0].get("consecutivo"),
                    "titulo": rows[0].get("titulo"),
                    "estado": rows[0].get("estado"),
                }
        except Exception:
            _log.exception("No se pudo leer la solicitud de origen %s", origen_id)
    try:
        hijas = (
            sb.table("almacen_solicitud")
            .select("id, consecutivo, titulo, estado")
            .eq("solicitud_origen_id", int(sol["id"]))
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if _pgrst_unknown_column(exc):
            hijas = []
        else:
            _log.exception("No se pudieron leer los grupos derivados de %s", sol.get("id"))
            hijas = []
    sol["solicitudes_derivadas"] = [
        {
            "id": h.get("id"),
            "consecutivo": h.get("consecutivo"),
            "titulo": h.get("titulo"),
            "estado": h.get("estado"),
        }
        for h in hijas
    ]
    if hijas and (sol.get("items") or []) and not sol.get("tiene_orden_compra"):
        sol["oc_parcial"] = True


def _attach_solicitante_linea(sb, sol: dict) -> None:
    from almacen_linea_partida import resumen_solicitantes_linea

    ids = []
    for it in sol.get("items") or []:
        if it.get("solicitado_por"):
            try:
                ids.append(int(it["solicitado_por"]))
            except (TypeError, ValueError):
                pass
    nombres = _map_usuario_nombres(sb, ids) if ids else {}
    de_linea = []
    for it in sol.get("items") or []:
        uid = it.get("solicitado_por")
        try:
            uid_int = int(uid) if uid not in (None, "") else None
        except (TypeError, ValueError):
            uid_int = None
        if uid_int and nombres.get(uid_int):
            it["solicitado_por_nombre"] = nombres[uid_int]
            it["solicitante_linea"] = "linea"
            de_linea.append(nombres[uid_int])
        else:
            it["solicitado_por_nombre"] = None
            it["solicitante_linea"] = "sin_registro"
    sol["solicitud_de_nombre"] = sol.get("solicitante_nombre")
    sol["solicitantes_linea_resumen"] = resumen_solicitantes_linea(
        de_linea, sol.get("solicitante_nombre"),
    )


def _solicitud_tiene_orden_compra(sol: dict) -> bool:
    """True si la solicitud ya tiene OC (orden_compra puede ser null explícito)."""
    if sol.get("tiene_orden_compra"):
        return True
    if isinstance(sol.get("ordenes_compra"), list) and any(
        isinstance(o, dict) and o.get("id") for o in sol["ordenes_compra"]
    ):
        return True
    oc = sol.get("orden_compra")
    return bool(isinstance(oc, dict) and oc.get("id"))


# Columnas mínimas para la grilla (evita payload * con observaciones/motivos).
_SOLICITUD_LIST_SELECT = (
    "id, contrato_id, consecutivo, titulo, estado, created_at, created_by, "
    "validada_by, validada_at, enviada_at"
)


def list_solicitudes(
    contrato_id: int,
    estado: Optional[str] = None,
    *,
    ver_economicos: bool = True,
    resumen: bool = True,
    limit: Optional[int] = 80,
    offset: int = 0,
) -> List[dict]:
    """Lista solicitudes. Por defecto ``resumen=True`` (rápido para grilla).

    ``limit`` acota filas (None = sin tope, solo para usos internos/admin).
    """
    sb = _sb()
    select_cols = _SOLICITUD_LIST_SELECT if resumen else "*"
    q = sb.table("almacen_solicitud").select(select_cols).eq("contrato_id", contrato_id)
    if estado:
        q = q.eq("estado", estado)
    q = q.order("created_at", desc=True)
    if limit is not None:
        lim = max(1, min(int(limit), 200))
        off = max(0, int(offset or 0))
        q = q.range(off, off + lim - 1)
    rows = q.execute().data or []
    if resumen:
        return _list_solicitudes_resumen(
            sb, rows, contrato_id, ver_economicos=ver_economicos,
        )
    validadores_pendientes = _nombres_validadores_pendientes(sb, contrato_id)
    out = []
    for r in rows:
        out.append(_enrich_solicitud(
            sb, dict(r),
            validadores_pendientes=validadores_pendientes,
            ver_economicos=ver_economicos,
        ))
    return out


def list_solicitudes_pagina(
    contrato_id: int,
    estado: Optional[str] = None,
    *,
    ver_economicos: bool = True,
    resumen: bool = True,
    limit: Optional[int] = 80,
    offset: int = 0,
    q: Optional[str] = None,
) -> dict:
    """Página de la grilla. Con ``q`` el total y las filas son solo las coincidencias."""
    from almacen_solicitud_busqueda import coincidencias_solicitudes, tokens_busqueda

    tokens = tokens_busqueda(q)
    if not tokens:
        items = list_solicitudes(
            contrato_id,
            estado,
            ver_economicos=ver_economicos,
            resumen=resumen,
            limit=limit,
            offset=offset,
        )
        return {"items": items, "total": count_solicitudes(contrato_id, estado)}

    sb = _sb()
    hits = coincidencias_solicitudes(sb, contrato_id, tokens, estado=estado)
    total = len(hits)
    lim = max(1, min(int(limit if limit is not None else 80), 200))
    off = max(0, int(offset or 0))
    page = hits[off:off + lim]
    donde = {
        int(h["solicitud"]["id"]): h.get("donde") or ""
        for h in page
        if h.get("solicitud") and h["solicitud"].get("id")
    }
    list_keys = [c.strip() for c in _SOLICITUD_LIST_SELECT.split(",")]
    rows = [
        {k: h["solicitud"].get(k) for k in list_keys}
        for h in page
        if h.get("solicitud")
    ]
    if resumen:
        items = _list_solicitudes_resumen(
            sb, rows, contrato_id, ver_economicos=ver_economicos,
        )
    else:
        ids = [int(r["id"]) for r in rows if r.get("id")]
        full = (
            sb.table("almacen_solicitud").select("*").in_("id", ids).execute().data or []
        ) if ids else []
        by_id = {int(r["id"]): r for r in full if r.get("id")}
        ordered = [by_id[i] for i in ids if i in by_id]
        validadores_pendientes = _nombres_validadores_pendientes(sb, contrato_id)
        items = [
            _enrich_solicitud(
                sb, dict(r),
                validadores_pendientes=validadores_pendientes,
                ver_economicos=ver_economicos,
            )
            for r in ordered
        ]
    for it in items:
        if isinstance(it, dict) and it.get("id") is not None:
            it["busqueda_donde"] = donde.get(int(it["id"]), "")
    return {"items": items, "total": total}


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


def valor_unitario_linea_proveedor(it: dict, ofertas: Optional[List[dict]] = None) -> float:
    """Precio unitario con IVA del proveedor elegido, o de la cotización ganadora."""
    unit = 0.0
    if ofertas:
        sel = elegir_oferta_proveedor(
            ofertas,
            proveedor_id=it.get("proveedor_seleccionado_id"),
            nombre=it.get("proveedor_seleccionado_nombre"),
            numero=it.get("cotizacion_numero_seleccionada"),
        )
        if sel:
            unit = _to_float(sel.get("valor"))
    if unit <= 0:
        unit = _to_float(it.get("valor_compra_unitario"))
    return unit


def valor_linea_proveedor(it: dict, ofertas: Optional[List[dict]] = None) -> Optional[float]:
    """Cantidad × valor con IVA del proveedor elegido (o de la ganadora)."""
    cant = _to_float(it.get("cantidad"))
    unit = valor_unitario_linea_proveedor(it, ofertas)
    if cant <= 0 or unit <= 0:
        return None
    return producto(cant, unit)


def valor_listado_linea(it: dict, ofertas: Optional[List[dict]] = None) -> Optional[float]:
    """Total de una línea en la grilla. Misma fuente que el popup.

    Si la línea ya tiene valor_compra_unitario, ese es el precio comprometido
    (y el que copió la OC). La oferta vigente del catálogo solo cubre una línea
    que todavía no tiene precio guardado.
    """
    if _to_float(it.get("valor_compra_unitario")) > 0:
        return valor_linea_proveedor(it, None)
    return valor_linea_proveedor(it, ofertas)


def _fetch_solicitud_items_resumen(sb, ids: List[int], *, ver_economicos: bool) -> List[dict]:
    """Ítems del listado. Con visibilidad económica trae lo necesario para el total."""
    if not ids:
        return []
    selects = (
        [
            "id, solicitud_id, estado_validacion, cantidad, valor_compra_unitario, insumo_id, "
            "proveedor_seleccionado_id, proveedor_seleccionado_nombre, "
            "cotizacion_numero_seleccionada, cotizacion_seleccionada_id, solicitado_por",
            "id, solicitud_id, estado_validacion, cantidad, valor_compra_unitario, insumo_id, "
            "cotizacion_seleccionada_id",
            "id, solicitud_id, estado_validacion, cantidad, valor_compra_unitario, insumo_id",
        ]
        if ver_economicos
        else [
            "id, solicitud_id, estado_validacion, insumo_id",
            "id, solicitud_id, estado_validacion",
            "id, solicitud_id",
        ]
    )
    last_exc: Optional[Exception] = None
    for select in selects:
        try:
            return (
                sb.table("almacen_solicitud_item")
                .select(select)
                .in_("solicitud_id", ids)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            last_exc = exc
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudieron leer los ítems del listado: %s", exc)
                return []
    if last_exc:
        _log.warning("Ítems del listado sin columnas de valor: %s", last_exc)
    return []


def _ofertas_insumos_batch(sb, insumo_ids: List[int]) -> Dict[int, List[dict]]:
    """Cotizaciones (con IVA) de los insumos del listado, una consulta."""
    ids = sorted({int(x) for x in insumo_ids if x})
    if not ids:
        return {}
    selects = [
        "id, cotizaciones_detalle, cotizacion_numero, costo_base, proveedor_id, "
        "valor_compra_referencia, tributos, tipo_impuesto, impuesto_porcentaje, impuestos",
        "id, cotizaciones_detalle, cotizacion_numero, costo_base, proveedor_id, "
        "valor_compra_referencia",
        "id, cotizacion_numero, costo_base, proveedor_id, valor_compra_referencia",
    ]
    rows: List[dict] = []
    for select in selects:
        try:
            rows = (
                sb.table("almacen_insumo")
                .select(select)
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudieron leer las cotizaciones del listado: %s", exc)
                return {}
    out: Dict[int, List[dict]] = {}
    for row in rows:
        if not row.get("id"):
            continue
        try:
            out[int(row["id"])] = ofertas_proveedor_desde_row(row)
        except Exception:
            _log.exception("Cotización ilegible del insumo %s", row.get("id"))
    return out


def _valores_por_solicitud(sb, items: List[dict]) -> Dict[int, Optional[float]]:
    """Total de cada solicitud, con la misma fuente que el total del popup."""
    try:
        _hidratar_proveedor_desde_cotizacion(sb, items)
    except Exception:
        _log.exception("No se pudo hidratar el proveedor para el valor del listado")
    insumo_ids = [int(it["insumo_id"]) for it in items if it.get("insumo_id")]
    ofertas_map = _ofertas_insumos_batch(sb, insumo_ids) if insumo_ids else {}
    totals: Dict[int, float] = {}
    vistos: set = set()
    for it in items:
        try:
            sid = int(it.get("solicitud_id") or 0)
        except (TypeError, ValueError):
            continue
        if not sid:
            continue
        vistos.add(sid)
        iid = it.get("insumo_id")
        ofertas = None
        if iid:
            try:
                ofertas = ofertas_map.get(int(iid))
            except (TypeError, ValueError):
                ofertas = None
        valor = valor_listado_linea(it, ofertas)
        if valor is None:
            continue
        totals[sid] = float(a_decimal(totals.get(sid, 0.0)) + a_decimal(valor))
    return {sid: totals.get(sid) for sid in vistos}


def _list_solicitudes_resumen(
    sb,
    rows: List[dict],
    contrato_id: int,
    *,
    ver_economicos: bool = False,
) -> List[dict]:
    """Enriquecimiento mínimo para la grilla: conteo de ítems, OC, nombres y, si aplica, valor."""
    if not rows:
        return []
    ids = [int(r["id"]) for r in rows if r.get("id")]
    item_counts: Dict[int, int] = {i: 0 for i in ids}
    item_rows: List[dict] = []
    valores: Dict[int, Optional[float]] = {}
    if ids:
        item_rows = _fetch_solicitud_items_resumen(sb, ids, ver_economicos=ver_economicos)
        for it in item_rows:
            sid = int(it.get("solicitud_id") or 0)
            if sid in item_counts:
                item_counts[sid] += 1
        if ver_economicos:
            valores = _valores_por_solicitud(sb, item_rows)

    oc_by_sol: Dict[int, List[dict]] = {}
    if ids:
        oc_rows = (
            sb.table("almacen_orden_compra")
            .select("*")
            .in_("solicitud_id", ids)
            .order("numero_oc")
            .execute()
            .data
            or []
        )
        for oc in oc_rows:
            sid = int(oc.get("solicitud_id") or 0)
            if not sid:
                continue
            oc = dict(oc)
            oc["tiene_pdf_oc"] = bool(oc.get("pdf_blob_path"))
            oc_by_sol.setdefault(sid, []).append(oc)

    flat_ocs = [oc for lst in oc_by_sol.values() for oc in lst]
    en_item_por_sol: Dict[int, set] = {}
    if flat_ocs:
        _enriquecer_ocs_estado_entrada_salida(sb, flat_ocs)
        oc_id_to_sol = {
            int(oc["id"]): int(oc["solicitud_id"])
            for oc in flat_ocs
            if oc.get("id") and oc.get("solicitud_id")
        }
        if oc_id_to_sol:
            oci_rows = (
                sb.table("almacen_orden_compra_item")
                .select("orden_compra_id, solicitud_item_id")
                .in_("orden_compra_id", list(oc_id_to_sol))
                .execute()
                .data
                or []
            )
            for r in oci_rows:
                sid_oc = oc_id_to_sol.get(int(r.get("orden_compra_id") or 0))
                iid = r.get("solicitud_item_id")
                if sid_oc and iid:
                    en_item_por_sol.setdefault(sid_oc, set()).add(int(iid))
    items_por_sol: Dict[int, List[dict]] = {}
    for it in item_rows:
        sid_it = int(it.get("solicitud_id") or 0)
        if sid_it:
            items_por_sol.setdefault(sid_it, []).append(it)

    user_ids = []
    for r in rows:
        if r.get("created_by"):
            user_ids.append(int(r["created_by"]))
        if r.get("validada_by"):
            user_ids.append(int(r["validada_by"]))
    for it in item_rows:
        if it.get("solicitado_por"):
            try:
                user_ids.append(int(it["solicitado_por"]))
            except (TypeError, ValueError):
                pass
    derivadas_por: Dict[int, List[dict]] = {}
    if ids:
        try:
            hijas = (
                sb.table("almacen_solicitud")
                .select("id, consecutivo, titulo, estado, solicitud_origen_id")
                .in_("solicitud_origen_id", ids)
                .execute()
                .data
                or []
            )
            for h in hijas:
                origen = int(h.get("solicitud_origen_id") or 0)
                if origen:
                    derivadas_por.setdefault(origen, []).append(h)
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudieron leer solicitudes derivadas: %s", exc)
    names = _map_usuario_nombres(sb, user_ids)
    sols_por_id = {int(r["id"]): r for r in rows if r.get("id")}
    padre_de: Dict[int, dict] = {}
    for origen, hijas_origen in derivadas_por.items():
        padre = sols_por_id.get(origen) or {}
        for h in hijas_origen:
            if not h.get("id"):
                continue
            padre_de[int(h["id"])] = {
                "id": origen,
                "consecutivo": padre.get("consecutivo"),
                "titulo": padre.get("titulo"),
                "estado": padre.get("estado"),
            }
    # No resolver validadores aquí: _destinatarios_validadores_almacen hace N+1
    # por usuario y ralentiza la grilla incluso con pocas solicitudes.
    # El detalle (GET) sí carga la lista completa para trazabilidad.

    out: List[dict] = []
    for r in rows:
        sol = dict(r)
        sid = int(sol["id"])
        sol["items_count"] = item_counts.get(sid, 0)
        sol["lineas_sin_insumo"] = _contar_lineas_sin_insumo(items_por_sol.get(sid) or [])
        sol["items"] = []  # grilla usa items_count; detalle carga enrich completo
        if ver_economicos:
            sol["valor_solicitud"] = valores.get(sid)
        oc_list = oc_by_sol.get(sid) or []
        if oc_list:
            sol["ordenes_compra"] = oc_list
            sol["orden_compra"] = oc_list[0]
            sol["tiene_orden_compra"] = True
            sol["estado_entrada"] = _rollup_estados_parcial_total(
                [oc.get("estado_entrada") for oc in oc_list]
            )
            sol["estado_salida"] = _rollup_estados_parcial_total(
                [oc.get("estado_salida") for oc in oc_list]
            )
            enlazados = en_item_por_sol.get(sid) or set()
            parcial = bool(enlazados) and bool(lineas_fuera_de_oc(
                items_por_sol.get(sid) or [],
                enlazados,
            ))
            sol["oc_parcial"] = parcial
            if not parcial and sol.get("estado") != "rechazada":
                sol["estado"] = "aprobada"
        else:
            sol["ordenes_compra"] = []
            sol["orden_compra"] = None
            sol["tiene_orden_compra"] = False
            sol["oc_parcial"] = False
            sol["estado_entrada"] = None
            sol["estado_salida"] = None
        if sol.get("created_by"):
            sol["solicitante_nombre"] = names.get(int(sol["created_by"]))
        if sol.get("validada_by"):
            sol["validador_nombre"] = names.get(int(sol["validada_by"]))
        if sol.get("estado") == "enviada":
            sol["validadores_pendientes"] = []
        hijas = derivadas_por.get(sid) or []
        sol["solicitudes_derivadas"] = [
            {
                "id": h.get("id"),
                "consecutivo": h.get("consecutivo"),
                "titulo": h.get("titulo"),
                "estado": h.get("estado"),
            }
            for h in hijas
        ]
        if hijas and sol.get("items_count") and not sol.get("tiene_orden_compra"):
            sol["oc_parcial"] = True
        if sid in padre_de:
            sol["solicitud_origen"] = padre_de[sid]
        from almacen_linea_partida import resumen_solicitantes_linea

        de_linea = []
        for it in items_por_sol.get(sid) or []:
            uid = it.get("solicitado_por")
            try:
                uid_int = int(uid) if uid not in (None, "") else None
            except (TypeError, ValueError):
                uid_int = None
            if uid_int and names.get(uid_int):
                de_linea.append(names[uid_int])
        sol["solicitantes_linea_resumen"] = resumen_solicitantes_linea(
            de_linea, sol.get("solicitante_nombre"),
        )
        out.append(sol)
    return out


def get_solicitud(
    contrato_id: int,
    solicitud_id: int,
    *,
    ver_economicos: bool = True,
    ligera: bool = False,
    include_rentabilidad: bool = False,
    precios_fijados: Optional[set] = None,
    diferir_secundarios: bool = False,
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
    row = rows[0]
    if not isinstance(row.get("tareas_fondo"), dict):
        from almacen_solicitud_tareas import estado_en_memoria
        mem = estado_en_memoria(row.get("id"))
        if mem:
            row["tareas_fondo"] = mem
    fondo = row.get("tareas_fondo")
    if isinstance(fondo, dict) and "log" in fondo:
        row["tareas_fondo"] = {k: v for k, v in fondo.items() if k != "log"}
    return _enrich_solicitud(
        sb,
        row,
        ver_economicos=ver_economicos,
        ligera=ligera,
        include_rentabilidad=include_rentabilidad,
        precios_fijados=precios_fijados,
        diferir_secundarios=diferir_secundarios,
    )


def _validate_items_payload(items: List[dict], contrato_id: int, user_id: int = 0, exclude_solicitud_id: Optional[int] = None) -> List[dict]:
    if not items:
        raise ValueError("Debe incluir al menos un material en la solicitud.")
    from almacen_insumos_service import (
        apply_saldo_flags_batch,
        prefetch_insumos_para_solicitud,
        resolve_insumo_for_solicitud,
    )

    # Presupuesto e insumos de todo el pedido, en lote. No uno por línea.
    from almacen_presupuesto_reparto import normalize_presupuesto_ids as _norm_pids_prefetch
    ppto_ids_prefetch = []
    insumo_ids_prefetch = []
    for raw in items:
        for pid in _norm_pids_prefetch(raw.get("presupuesto_ids"), raw.get("presupuesto_id")):
            ppto_ids_prefetch.append(pid)
        if raw.get("insumo_id"):
            try:
                insumo_ids_prefetch.append(int(raw["insumo_id"]))
            except (TypeError, ValueError):
                pass
    ppto_cache = _fetch_ppto_rows_batch(ppto_ids_prefetch, contrato_id)
    insumos_cache = (
        prefetch_insumos_para_solicitud(contrato_id, insumo_ids_prefetch)
        if insumo_ids_prefetch else None
    )

    out = []
    for raw in items:
        raw = dict(raw)
        if raw.get("exclude_solicitud_id") is None and exclude_solicitud_id:
            raw["exclude_solicitud_id"] = exclude_solicitud_id
        # Flujo nuevo: Contratista describe en texto libre (sin insumo).
        # Solo resuelve catálogo si llega insumo_id/listado (legado o mapeo Gerencial vía PATCH).
        desc_sol = (raw.get("descripcion_solicitada") or "").strip()
        cap_in = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or "").strip()
        item_in = (raw.get("presupuesto_item") or raw.get("item") or "").strip()
        es_aiu = is_administracion_aiu(cap_in, item_in)

        if es_aiu and desc_sol and not raw.get("insumo_id") and not raw.get("listado_precio_id"):
            cant = _to_float(raw.get("cantidad"))
            if cant <= 0:
                raise ValueError("La cantidad debe ser mayor a cero.")
            if len(desc_sol) < 3:
                raise ValueError("Describa el material solicitado (mínimo 3 caracteres).")
            # Administración (AIU): la ubicación es opcional. No bloquea guardar ni enviar.
            pk = (raw.get("pk_id") or "").strip()
            out.append({
                "presupuesto_id": None,
                "pk_id": pk or None,
                "pk_id_id": raw.get("pk_id_id"),
                "capitulo": CAPITULO_ADMINISTRACION_AIU,
                "item": CAPITULO_ADMINISTRACION_AIU,
                "descripcion_solicitada": desc_sol,
                "material_descripcion": desc_sol,
                "unidad": (raw.get("unidad") or "UND").strip(),
                "cantidad": cant,
                "es_recurrente": bool(raw.get("es_recurrente")),
                "es_principal": _coerce_es_principal(raw.get("es_principal"), default=True),
                "cant_presupuestada": None,
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

        if desc_sol and not raw.get("insumo_id") and not raw.get("listado_precio_id"):
            from almacen_presupuesto_reparto import normalize_presupuesto_ids as _norm_pids
            pids_raw = _norm_pids(raw.get("presupuesto_ids"), raw.get("presupuesto_id"))
            if not pids_raw:
                raise ValueError("Seleccione al menos un registro de presupuesto en la grilla.")
            pid = pids_raw[0]
            ppto = ppto_cache.get(pid) or _fetch_ppto_row(pid, contrato_id)
            cant = _to_float(raw.get("cantidad"))
            if cant <= 0:
                raise ValueError("La cantidad debe ser mayor a cero.")
            if len(desc_sol) < 3:
                raise ValueError("Describa el material solicitado (mínimo 3 caracteres).")
            pk = (raw.get("pk_id") or ppto.get("pk_id") or "").strip()
            if not pk:
                raise ValueError("Seleccione la ubicación PK-ID en el mapa.")
            cap_cobro = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or ppto.get("capitulo") or "").strip()
            item_cobro = (raw.get("presupuesto_item") or raw.get("item") or ppto.get("item") or "").strip()
            out.append({
                "presupuesto_id": pid,
                "presupuesto_ids": pids_raw,
                "pk_id": pk or None,
                "pk_id_id": raw.get("pk_id_id"),
                "capitulo": cap_cobro or ppto.get("capitulo"),
                "item": item_cobro or ppto.get("item"),
                "descripcion_solicitada": desc_sol,
                "material_descripcion": desc_sol,
                "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
                "cantidad": cant,
                "es_recurrente": bool(raw.get("es_recurrente")),
                "es_principal": _coerce_es_principal(raw.get("es_principal"), default=True),
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
                contrato_id,
                user_id,
                raw,
                skip_context=True,
                skip_listado=True,
                defer_reparto=True,
                insumos_cache=insumos_cache,
                ppto_por_id=ppto_cache,
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
        from almacen_presupuesto_reparto import normalize_presupuesto_ids as _norm_pids2
        pids_raw = _norm_pids2(raw.get("presupuesto_ids"), raw.get("presupuesto_id"))
        if not pids_raw:
            raise ValueError("Seleccione al menos un registro de presupuesto en la grilla.")
        pid = pids_raw[0]
        ppto = ppto_cache.get(pid) or _fetch_ppto_row(pid, contrato_id)
        cant = _to_float(raw.get("cantidad"))
        if cant <= 0:
            raise ValueError("La cantidad debe ser mayor a cero.")
        mat = (raw.get("material_descripcion") or desc_sol or ppto.get("descripcion") or "").strip()
        if not mat:
            raise ValueError("Cada material debe tener descripción.")
        pk = (raw.get("pk_id") or ppto.get("pk_id") or "").strip()
        if not pk:
            raise ValueError("Seleccione la ubicación PK-ID en el mapa.")
        cap_cobro = (raw.get("presupuesto_capitulo") or raw.get("capitulo") or ppto.get("capitulo") or "").strip()
        item_cobro = (raw.get("presupuesto_item") or raw.get("item") or ppto.get("item") or "").strip()
        out.append({
            "presupuesto_id": pid,
            "presupuesto_ids": pids_raw,
            "pk_id": pk or None,
            "capitulo": cap_cobro or ppto.get("capitulo"),
            "item": item_cobro or ppto.get("item"),
            "descripcion_solicitada": desc_sol or mat,
            "material_descripcion": mat,
            "unidad": (raw.get("unidad") or ppto.get("und") or "UND").strip(),
            "cantidad": cant,
            "es_recurrente": bool(raw.get("es_recurrente")),
            "es_principal": _coerce_es_principal(raw.get("es_principal"), default=True),
            "cant_presupuestada": _to_float(ppto.get("cant_total")),
            "valor_compra_unitario": _to_float(raw.get("valor_compra_unitario")) or None,
            "vlr_unitario_cobro": 0,
            "supera_presupuesto": False,
        })
    # Multi-registro: un solo listado de registros por capítulo/ítem/PK, no uno por línea.
    _attach_repartos_en_lote(
        contrato_id,
        list(zip(items, out)),
        exclude_solicitud_id=exclude_solicitud_id,
    )
    if out:
        # Borrador/guardar: no escanear listado_precios (cobro se define al mapear Gerencial).
        # Solo acumulados + flags de sobrepresupuesto — evita 5–40s de full-scan.
        # Líneas AIU no tienen presupuesto_id: apply_saldo_flags las omite.
        apply_saldo_flags_batch(
            contrato_id,
            out,
            exclude_solicitud_id=exclude_solicitud_id,
            descontar_linea_actual=True,
            refresh_listado=False,
        )
    # Conservar id de línea (upsert) y estado_validacion si vienen del cliente.
    for src, dst in zip(items, out):
        if src.get("id") is not None:
            try:
                dst["id"] = int(src["id"])
            except (TypeError, ValueError):
                pass
        if src.get("estado_validacion") and not dst.get("estado_validacion"):
            dst["estado_validacion"] = src.get("estado_validacion")
        grupo = str(src.get("grupo_seleccion") or "").strip()
        if grupo:
            dst["grupo_seleccion"] = grupo[:80]
        etiqueta = str(src.get("grupo_etiqueta") or "").strip()
        if etiqueta:
            dst["grupo_etiqueta"] = etiqueta[:160]
    _require_justificacion_sobrepresupuesto(out)
    return out


_MIN_JUSTIFICACION_SUPERA_PPTO = 15


def _require_justificacion_sobrepresupuesto(items: List[dict]) -> None:
    """Exige comentario cuando la línea principal supera el presupuesto del PK-ID.

    Un asociado no descuenta saldo: se apaga el aviso aunque el cliente lo envíe.
    """
    faltantes = []
    for it in items or []:
        if not _coerce_es_principal(it.get("es_principal"), default=True):
            it["supera_presupuesto"] = False
            ctx = it.get("contexto_presupuesto")
            if isinstance(ctx, dict):
                ctx["supera_presupuesto"] = False
            continue
        if not it.get("supera_presupuesto"):
            continue
        obs = (it.get("observacion_residente") or "").strip()
        if len(obs) < _MIN_JUSTIFICACION_SUPERA_PPTO:
            cap = it.get("capitulo") or "—"
            item_n = it.get("item") or "—"
            faltantes.append(f"{cap} · {item_n} (PK {it.get('pk_id') or '—'})")
    if faltantes:
        detalle = "; ".join(faltantes[:5])
        extra = f" y {len(faltantes) - 5} más" if len(faltantes) > 5 else ""
        raise ValueError(
            "Debe justificar el desfase cuando la cantidad supera el presupuesto del PK-ID "
            f"(mínimo {_MIN_JUSTIFICACION_SUPERA_PPTO} caracteres en la observación/justificación). "
            f"Líneas sin justificación: {detalle}{extra}."
        )


def _mismo_insumo_linea(existing: dict, insumo_id) -> bool:
    try:
        return int(existing.get("insumo_id") or 0) == int(insumo_id)
    except (TypeError, ValueError):
        return False


def _costo_al_mapear(body: dict, existing: dict, resolved: dict, insumo_id, oferta_valor=None):
    """
    Costo enviado gana. Si el cliente no lo manda (no ve cifras) y el insumo no cambia,
    se conserva el costo ya guardado. Si el insumo cambia, se usa el del catálogo.

    Si llega la cotización vigente y el cliente reenvía el precio ya guardado (o no
    manda cifra), se usa esa cotización. Un costo escrito a mano, distinto del de la
    línea, se conserva.
    """
    oferta = _to_float(oferta_valor) if oferta_valor not in (None, "") else 0.0
    enviado = body.get("valor_compra_unitario")
    if oferta > 0:
        if enviado is None:
            return oferta
        guardado = existing.get("valor_compra_unitario")
        if guardado not in (None, "") and abs(_to_float(enviado) - _to_float(guardado)) <= 0.009:
            return oferta
        return _to_float(enviado)
    if enviado is not None:
        return _to_float(enviado)
    if _mismo_insumo_linea(existing, insumo_id) and existing.get("valor_compra_unitario") not in (None, ""):
        return existing.get("valor_compra_unitario")
    return resolved.get("valor_compra_unitario")


def ofertas_proveedor_desde_row(row: dict, prov_nombres: Optional[Dict[int, str]] = None) -> List[dict]:
    """
    Proveedores con cotización para un insumo.
    ``valor`` es el precio unitario con IVA/AIU incluido.
    """
    from catalogo_insumos_service import (
        _valor_oferta_despues_impuesto,
        cotizaciones_detalle_from_row,
    )

    prov_nombres = prov_nombres or {}
    detalle = cotizaciones_detalle_from_row(row or {})
    if (
        len(detalle) == 1
        and detalle[0].get("id") == "legacy-ganadora"
        and not detalle[0].get("proveedor_id")
        and row.get("proveedor_id") not in (None, "")
    ):
        try:
            detalle[0]["proveedor_id"] = int(row["proveedor_id"])
        except (TypeError, ValueError):
            pass
    ofertas: List[dict] = []
    for c in detalle:
        if (c.get("tipo") or "insumo") != "insumo":
            continue
        pid = c.get("proveedor_id")
        try:
            pid_i = int(pid) if pid not in (None, "") else None
        except (TypeError, ValueError):
            pid_i = None
        nombre = (c.get("proveedor") or "").strip()
        if pid_i and not nombre:
            nombre = (prov_nombres.get(pid_i) or "").strip()
        base = c.get("valor")
        if base in (None, "") and c.get("es_ganadora") and row.get("valor_compra_referencia") not in (None, ""):
            valor = _to_float(row.get("valor_compra_referencia"))
        else:
            valor = _valor_oferta_despues_impuesto(
                base,
                impuesto_lado=c.get("impuesto"),
                tributos_row=row.get("tributos"),
                tipo_impuesto=row.get("tipo_impuesto"),
                impuesto_porcentaje=row.get("impuesto_porcentaje"),
                impuestos=row.get("impuestos"),
            )
        if not nombre and pid_i is None and not c.get("numero") and valor <= 0:
            continue
        ofertas.append({
            "proveedor_id": pid_i,
            "proveedor_nombre": nombre or (f"Proveedor {pid_i}" if pid_i else "Proveedor"),
            "numero": (c.get("numero") or "").strip() or None,
            "es_ganadora": bool(c.get("es_ganadora")),
            "valor": valor,
        })
    _completar_oferta_con_proveedor_columna(ofertas, row, prov_nombres)
    if ofertas and not any(o.get("es_ganadora") for o in ofertas):
        ofertas[0]["es_ganadora"] = True
    return ofertas


def _oferta_tiene_proveedor_util(oferta: dict) -> bool:
    if not oferta:
        return False
    if oferta.get("proveedor_id") not in (None, ""):
        return True
    nombre = (oferta.get("proveedor_nombre") or "").strip().casefold()
    if not nombre:
        return False
    return nombre not in {
        "proveedor",
        "proveedor catálogo",
        "proveedor catalogo",
        "sin proveedor",
        "sin proveedor seleccionado",
        "sin proveedor asignado",
        "varios proveedores",
    }


def _completar_oferta_con_proveedor_columna(ofertas: List[dict], row: dict, prov_nombres: Dict[int, str]) -> None:
    """El proveedor_id del insumo es el mismo que muestra Prov. cuando la cotización no lo trae."""
    if row.get("proveedor_id") in (None, ""):
        return
    try:
        pid_i = int(row["proveedor_id"])
    except (TypeError, ValueError):
        return
    nombre_col = (prov_nombres.get(pid_i) or "").strip()
    if any(_oferta_tiene_proveedor_util(o) for o in ofertas):
        for oferta in ofertas:
            if oferta.get("proveedor_id") not in (None, ""):
                continue
            nombre_of = (oferta.get("proveedor_nombre") or "").strip()
            if nombre_col and nombre_of.casefold() == nombre_col.casefold():
                oferta["proveedor_id"] = pid_i
                oferta["proveedor_nombre"] = nombre_col
        return
    valor = _to_float(row.get("valor_compra_referencia"))
    if valor <= 0:
        valor = _to_float(row.get("costo_base"))
    ofertas.append({
        "proveedor_id": pid_i,
        "proveedor_nombre": nombre_col or f"Proveedor {pid_i}",
        "numero": (row.get("cotizacion_numero") or "").strip() or None,
        "es_ganadora": True,
        "valor": valor,
    })


def oferta_ganadora(ofertas: List[dict]) -> Optional[dict]:
    for o in ofertas or []:
        if o.get("es_ganadora"):
            return o
    return ofertas[0] if ofertas else None


_NOMBRES_SIN_PROVEEDOR_GUARDADO = {
    "proveedor",
    "proveedor catálogo",
    "proveedor catalogo",
    "sin proveedor",
    "sin proveedor seleccionado",
    "sin proveedor asignado",
    "varios proveedores",
}


def _nombre_proveedor_util(nombre: str) -> bool:
    return (nombre or "").strip().casefold() not in _NOMBRES_SIN_PROVEEDOR_GUARDADO and bool((nombre or "").strip())


def linea_sin_proveedor_guardado(it: dict) -> bool:
    """Tiene insumo y todavía no tiene un proveedor escrito en la línea."""
    if not it or not it.get("insumo_id") or it.get("es_recurrente"):
        return False
    if it.get("id") in (None, ""):
        return False
    if it.get("proveedor_seleccionado_id") not in (None, ""):
        return False
    return not _nombre_proveedor_util(it.get("proveedor_seleccionado_nombre") or "")


def _valor_oferta_de_linea(it: dict, ofertas: List[dict]) -> Optional[float]:
    """Precio vigente de la cotización elegida, o de la única/ganadora si no hay elección."""
    if not ofertas:
        return None
    oferta = None
    if (
        it.get("proveedor_seleccionado_id") not in (None, "")
        or (it.get("proveedor_seleccionado_nombre") or "").strip()
        or (it.get("cotizacion_numero_seleccionada") or "").strip()
    ):
        oferta = elegir_oferta_proveedor(
            ofertas,
            proveedor_id=it.get("proveedor_seleccionado_id"),
            nombre=it.get("proveedor_seleccionado_nombre"),
            numero=it.get("cotizacion_numero_seleccionada"),
        )
    if oferta is None:
        oferta = _oferta_por_defecto(ofertas)
    if not oferta:
        return None
    valor = _to_float(oferta.get("valor"))
    return valor if valor > 0 else None


def sincronizar_precios_sin_oc(sb, items: List[dict], ids_en_oc: set, omitir_ids: Optional[set] = None) -> int:
    """
    Mientras la línea no esté en una OC, el precio sigue la cotización vigente.
    Las líneas ya compradas, las recurrentes y un costo recién escrito a mano no se tocan.
    """
    oc = set()
    for raw in ids_en_oc or set():
        try:
            oc.add(int(raw))
        except (TypeError, ValueError):
            continue
    omitir = set()
    for raw in omitir_ids or set():
        try:
            omitir.add(int(raw))
        except (TypeError, ValueError):
            continue
    candidatos = []
    for it in items or []:
        if it.get("es_recurrente"):
            continue
        if not it.get("id") or not it.get("insumo_id"):
            continue
        try:
            item_id = int(it["id"])
        except (TypeError, ValueError):
            continue
        if item_id in oc or item_id in omitir:
            continue
        candidatos.append(it)
    if not candidatos:
        return 0
    try:
        rows = _filas_insumo_para_ofertas(sb, [int(it["insumo_id"]) for it in candidatos])
    except Exception:
        _log.exception("No se pudo leer el precio vigente de los insumos")
        return 0
    by_id: Dict[int, dict] = {}
    prov_ids: List[int] = []
    for row in rows:
        try:
            by_id[int(row["id"])] = row
        except (TypeError, ValueError, KeyError):
            continue
        if row.get("proveedor_id") not in (None, ""):
            try:
                prov_ids.append(int(row["proveedor_id"]))
            except (TypeError, ValueError):
                pass
    nombres: Dict[int, str] = {}
    if prov_ids:
        try:
            nombres = _nombres_proveedor(sb, prov_ids)
        except Exception:
            nombres = {}
    n = 0
    for it in candidatos:
        try:
            row = by_id.get(int(it["insumo_id"]))
        except (TypeError, ValueError):
            continue
        if not row:
            continue
        valor = _valor_oferta_de_linea(it, ofertas_proveedor_desde_row(row, nombres))
        if valor is None or valor <= 0:
            continue
        if abs(_to_float(it.get("valor_compra_unitario")) - valor) <= 0.009:
            continue
        try:
            sb.table("almacen_solicitud_item").update({
                "valor_compra_unitario": valor,
            }).eq("id", int(it["id"])).execute()
        except Exception:
            _log.exception("No se pudo actualizar el precio de la línea %s", it.get("id"))
            continue
        it["valor_compra_unitario"] = valor
        n += 1
    return n


def _oferta_por_defecto(ofertas: List[dict]) -> Optional[dict]:
    """Una sola cotización, o la ganadora si hay varias."""
    utiles = [
        o for o in (ofertas or [])
        if o.get("proveedor_id") not in (None, "") or _nombre_proveedor_util(o.get("proveedor_nombre") or "")
    ]
    if not utiles:
        return None
    if len(utiles) == 1:
        return utiles[0]
    return oferta_ganadora(utiles)


def _filas_insumo_para_ofertas(sb, insumo_ids: List[int]) -> List[dict]:
    ids = sorted({int(x) for x in insumo_ids if x})
    if not ids:
        return []
    selects = (
        "id, cotizaciones_detalle, cotizacion_numero, costo_base, proveedor_id, "
        "valor_compra_referencia, tributos, tipo_impuesto, impuesto_porcentaje, impuestos",
        "id, cotizaciones_detalle, cotizacion_numero, costo_base, proveedor_id, valor_compra_referencia",
        "id, cotizacion_numero, costo_base, proveedor_id, valor_compra_referencia",
        "id, proveedor_id",
    )
    ultimo = None
    for select in selects:
        try:
            rows: List[dict] = []
            for i in range(0, len(ids), 120):
                chunk = ids[i:i + 120]
                rows.extend(
                    sb.table("almacen_insumo")
                    .select(select)
                    .in_("id", chunk)
                    .execute()
                    .data
                    or []
                )
            return rows
        except Exception as exc:
            ultimo = exc
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudieron leer las cotizaciones para guardar el proveedor: %s", exc)
                return []
    if ultimo:
        _log.warning("Cotizaciones de insumo sin columnas esperadas: %s", ultimo)
    return []


def _nombres_proveedor(sb, ids: List[int]) -> Dict[int, str]:
    limpios = sorted({int(x) for x in ids if x})
    nombres: Dict[int, str] = {}
    for i in range(0, len(limpios), 120):
        chunk = limpios[i:i + 120]
        for row in (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", chunk)
            .execute()
            .data
            or []
        ):
            try:
                nombres[int(row["id"])] = (row.get("razon_social") or "").strip()
            except (TypeError, ValueError, KeyError):
                continue
    return nombres


def _payload_proveedor_guardado(it: dict) -> dict:
    return {
        "id": int(it["id"]),
        "proveedor_seleccionado_id": it.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": (it.get("proveedor_seleccionado_nombre") or "").strip() or None,
        "cotizacion_numero_seleccionada": it.get("cotizacion_numero_seleccionada"),
    }


def completar_proveedor_guardado(sb, items: List[dict]) -> int:
    """Escribe en la línea la cotización única o la ganadora.

    Solo toca líneas con insumo y sin proveedor guardado. La segunda pasada no escribe.
    Si la línea ya tenía una cotización elegida, se conserva esa y no la ganadora.
    """
    candidatos = [it for it in (items or []) if linea_sin_proveedor_guardado(it)]
    if not candidatos:
        return 0
    try:
        _hidratar_proveedor_desde_cotizacion(sb, candidatos)
    except Exception:
        _log.exception("No se pudo leer la cotización ya elegida en la línea")
    desde_cotizacion = []
    pendientes = []
    for it in candidatos:
        if linea_sin_proveedor_guardado(it):
            pendientes.append(it)
        else:
            desde_cotizacion.append(_payload_proveedor_guardado(it))
    if not pendientes and not desde_cotizacion:
        return 0
    if not pendientes:
        _upsert_proveedor_guardado(sb, desde_cotizacion)
        return len(desde_cotizacion)
    insumo_ids = []
    for it in pendientes:
        try:
            insumo_ids.append(int(it["insumo_id"]))
        except (TypeError, ValueError):
            continue
    filas = _filas_insumo_para_ofertas(sb, insumo_ids)
    por_insumo = {}
    pids = []
    for row in filas:
        try:
            por_insumo[int(row["id"])] = row
        except (TypeError, ValueError, KeyError):
            continue
        if row.get("proveedor_id") not in (None, ""):
            try:
                pids.append(int(row["proveedor_id"]))
            except (TypeError, ValueError):
                pass
    nombres = _nombres_proveedor(sb, pids) if pids else {}
    ofertas_por_insumo: Dict[int, List[dict]] = {}
    faltan = []
    for iid, row in por_insumo.items():
        ofs = ofertas_proveedor_desde_row(row, nombres)
        ofertas_por_insumo[iid] = ofs
        for oferta in ofs:
            pid = oferta.get("proveedor_id")
            if pid and not _nombre_proveedor_util(oferta.get("proveedor_nombre") or ""):
                try:
                    faltan.append(int(pid))
                except (TypeError, ValueError):
                    pass
    if faltan:
        nombres.update(_nombres_proveedor(sb, faltan))
        for iid, row in por_insumo.items():
            ofertas_por_insumo[iid] = ofertas_proveedor_desde_row(row, nombres)

    cambios = []
    for it in pendientes:
        try:
            iid = int(it["insumo_id"])
            payload_id = int(it["id"])
        except (TypeError, ValueError):
            continue
        if payload_id <= 0:
            continue
        oferta = _oferta_por_defecto(ofertas_por_insumo.get(iid) or [])
        if not oferta:
            continue
        pid = oferta.get("proveedor_id")
        nombre = (oferta.get("proveedor_nombre") or "").strip()
        if pid in (None, "") and not _nombre_proveedor_util(nombre):
            continue
        it["proveedor_seleccionado_id"] = pid
        it["proveedor_seleccionado_nombre"] = nombre
        it["cotizacion_numero_seleccionada"] = oferta.get("numero")
        payload = _payload_proveedor_guardado(it)
        if _to_float(it.get("valor_compra_unitario")) <= 0 and _to_float(oferta.get("valor")) > 0:
            it["valor_compra_unitario"] = oferta.get("valor")
            payload["valor_compra_unitario"] = oferta.get("valor")
        cambios.append(payload)
    cambios = desde_cotizacion + cambios
    if not cambios:
        return 0
    _upsert_proveedor_guardado(sb, cambios)
    return len(cambios)


def _upsert_proveedor_guardado(sb, cambios: List[dict]) -> None:
    """Actualiza la línea que ya existe.

    Un upsert solo con el proveedor arma un INSERT incompleto. Postgres exige
    solicitud, presupuesto, descripción, unidad y cantidad, y rechaza la fila
    antes de llegar al conflicto por id. Por eso Agrupar decía que no pudo
    guardar el proveedor y no movía nada.
    """
    for cambio in cambios or []:
        item_id = cambio.get("id")
        if item_id in (None, ""):
            continue
        payload = {k: v for k, v in cambio.items() if k != "id"}
        if not payload:
            continue
        (
            sb.table("almacen_solicitud_item")
            .update(payload)
            .eq("id", int(item_id))
            .execute()
        )


def elegir_oferta_proveedor(
    ofertas: List[dict],
    *,
    proveedor_id=None,
    nombre: Optional[str] = None,
    numero: Optional[str] = None,
) -> Optional[dict]:
    """La cotización pedida, o la ganadora si no hay coincidencia."""
    if not ofertas:
        return None
    num = (numero or "").strip()
    nom = (nombre or "").strip().casefold()
    pid = None
    if proveedor_id not in (None, ""):
        try:
            pid = int(proveedor_id)
        except (TypeError, ValueError):
            pid = None
    if pid is None and not nom and not num:
        return oferta_ganadora(ofertas)

    def _score(o: dict) -> int:
        s = 0
        if num and (o.get("numero") or "") == num:
            s += 4
        if pid is not None and o.get("proveedor_id") == pid:
            s += 2
        if nom and (o.get("proveedor_nombre") or "").strip().casefold() == nom:
            s += 1
        return s

    ranked = sorted(ofertas, key=_score, reverse=True)
    if _score(ranked[0]) > 0:
        return ranked[0]
    return oferta_ganadora(ofertas)


def _fila_insumo_para_ofertas(sb, insumo_id: int) -> Optional[dict]:
    selects = [
        "id, contrato_id, cotizaciones_detalle, cotizacion_numero, cotizacion_fecha, "
        "cotizacion_vigencia, costo_base, proveedor_id, valor_compra_referencia, "
        "tributos, tipo_impuesto, impuesto_porcentaje, impuestos",
        "id, contrato_id, cotizaciones_detalle, cotizacion_numero, costo_base, "
        "proveedor_id, valor_compra_referencia",
        "id, contrato_id, cotizacion_numero, costo_base, proveedor_id, valor_compra_referencia",
    ]
    last_exc: Optional[Exception] = None
    for select in selects:
        try:
            rows = (
                sb.table("almacen_insumo")
                .select(select)
                .eq("id", int(insumo_id))
                .limit(1)
                .execute()
                .data
                or []
            )
            return rows[0] if rows else None
        except Exception as exc:
            last_exc = exc
            col = _pgrst_unknown_column(exc)
            if not col:
                break
    if last_exc:
        _log.warning("No se pudieron leer las cotizaciones del insumo %s: %s", insumo_id, last_exc)
    return None


def listar_ofertas_proveedor_insumo(
    contrato_id: int,
    insumo_id: int,
    *,
    ver_economicos: bool = False,
) -> List[dict]:
    """Cotizaciones del insumo. Sin visibilidad económica se omiten las cifras."""
    sb = _sb()
    row = _fila_insumo_para_ofertas(sb, insumo_id)
    if not row or int(row.get("contrato_id") or 0) != int(contrato_id):
        raise ValueError("Insumo no encontrado.")
    ofertas = ofertas_proveedor_desde_row(row)
    faltan = [
        int(o["proveedor_id"])
        for o in ofertas
        if o.get("proveedor_id") and str(o.get("proveedor_nombre") or "").startswith("Proveedor ")
    ]
    if faltan:
        nombres: Dict[int, str] = {}
        for r in (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", sorted(set(faltan)))
            .execute()
            .data
            or []
        ):
            nombres[int(r["id"])] = (r.get("razon_social") or "").strip()
        if nombres:
            ofertas = ofertas_proveedor_desde_row(row, nombres)
    out: List[dict] = []
    for o in ofertas:
        item = {
            "proveedor_id": o.get("proveedor_id"),
            "proveedor_nombre": o.get("proveedor_nombre"),
            "numero": o.get("numero"),
            "es_ganadora": bool(o.get("es_ganadora")),
        }
        if ver_economicos:
            item["valor"] = o.get("valor")
        out.append(item)
    return out


def _resolver_proveedor_mapeo(sb, body: dict, existing: dict, insumo_id) -> dict:
    """
    Proveedor a guardar en la línea.
    Si cambia el insumo o no hay selección, queda la cotización ganadora.
    El costo de esa oferta se aplica cuando el cliente no envía cifra.
    """
    row = _fila_insumo_para_ofertas(sb, int(insumo_id)) or {}
    ofertas = ofertas_proveedor_desde_row(row)
    pide = any(
        body.get(k) not in (None, "")
        for k in (
            "proveedor_seleccionado_id",
            "proveedor_seleccionado_nombre",
            "cotizacion_numero_seleccionada",
        )
    )
    insumo_cambio = not _mismo_insumo_linea(existing, insumo_id)
    tenia = bool(
        existing.get("proveedor_seleccionado_id")
        or (existing.get("proveedor_seleccionado_nombre") or "").strip()
    )
    if pide:
        oferta = elegir_oferta_proveedor(
            ofertas,
            proveedor_id=body.get("proveedor_seleccionado_id"),
            nombre=body.get("proveedor_seleccionado_nombre"),
            numero=body.get("cotizacion_numero_seleccionada"),
        )
    elif insumo_cambio or not tenia:
        oferta = oferta_ganadora(ofertas)
    else:
        oferta = None
    if not oferta:
        return {"aplicar": False}
    prev_id = existing.get("proveedor_seleccionado_id")
    prev_num = (existing.get("cotizacion_numero_seleccionada") or "").strip()
    prev_nom = (existing.get("proveedor_seleccionado_nombre") or "").strip().casefold()
    nuevo_id = oferta.get("proveedor_id")
    nuevo_num = (oferta.get("numero") or "").strip()
    nuevo_nom = (oferta.get("proveedor_nombre") or "").strip().casefold()
    distinta = insumo_cambio or not tenia
    if not distinta:
        if (prev_id or None) != (nuevo_id or None):
            distinta = True
        elif prev_num != nuevo_num or prev_nom != nuevo_nom:
            distinta = True
    return {
        "aplicar": True,
        "proveedor_seleccionado_id": nuevo_id,
        "proveedor_seleccionado_nombre": oferta.get("proveedor_nombre"),
        "cotizacion_numero_seleccionada": oferta.get("numero"),
        "valor": oferta.get("valor"),
        "forzar_costo": body.get("valor_compra_unitario") is None and (pide or insumo_cambio or not tenia) and distinta,
    }


def _persistir_cotizacion_elegida(sb, item_id: int, existing: dict, sel: dict) -> Optional[int]:
    """
    Guarda el proveedor elegido en almacen_cotizacion (tabla ya existente)
    y devuelve su id para cotizacion_seleccionada_id.
    """
    if not sel.get("aplicar"):
        return None
    nombre = (sel.get("proveedor_seleccionado_nombre") or "").strip() or "Proveedor"
    valor = max(_to_float(sel.get("valor")), 0.0)
    numero = (sel.get("cotizacion_numero_seleccionada") or "").strip() or None
    payload = {
        "proveedor_nombre": nombre,
        "valor_unitario": valor,
        "observaciones": numero,
    }
    pid = sel.get("proveedor_seleccionado_id")
    if pid not in (None, ""):
        try:
            payload["proveedor_id"] = int(pid)
        except (TypeError, ValueError):
            pass
    prev = existing.get("cotizacion_seleccionada_id")
    if prev:
        data = dict(payload)
        for _ in range(4):
            try:
                sb.table("almacen_cotizacion").update(data).eq("id", int(prev)).eq(
                    "solicitud_item_id", int(item_id)
                ).execute()
                return int(prev)
            except Exception as exc:
                col = _pgrst_unknown_column(exc)
                if col and col in data:
                    data.pop(col, None)
                    continue
                _log.warning("No se pudo actualizar la cotización elegida %s: %s", prev, exc)
                break
    row = {"solicitud_item_id": int(item_id), **payload}
    for _ in range(4):
        try:
            ins = sb.table("almacen_cotizacion").insert(row).execute().data or []
            if ins and ins[0].get("id"):
                return int(ins[0]["id"])
            return None
        except Exception as exc:
            col = _pgrst_unknown_column(exc)
            if col and col in row and col != "solicitud_item_id":
                row.pop(col, None)
                continue
            _log.warning("No se pudo crear la cotización elegida de la línea %s: %s", item_id, exc)
            return None
    return None


def _hidratar_proveedor_desde_cotizacion(sb, items: List[dict]) -> None:
    """Si el esquema aún no tiene las columnas nuevas, el nombre sale de la cotización elegida."""
    need = [
        it for it in items or []
        if it.get("cotizacion_seleccionada_id")
        and not (it.get("proveedor_seleccionado_nombre") or "").strip()
    ]
    if not need:
        return
    ids = sorted({int(it["cotizacion_seleccionada_id"]) for it in need})
    rows: List[dict] = []
    selects = [
        "id, proveedor_id, proveedor_nombre, observaciones",
        "id, proveedor_nombre, observaciones",
    ]
    for select in selects:
        try:
            rows = (
                sb.table("almacen_cotizacion")
                .select(select)
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            break
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudo leer la cotización elegida: %s", exc)
                return
    by_id = {int(r["id"]): r for r in rows if r.get("id")}
    for it in need:
        cot = by_id.get(int(it["cotizacion_seleccionada_id"]))
        if not cot:
            continue
        nombre = (cot.get("proveedor_nombre") or "").strip()
        if nombre:
            it["proveedor_seleccionado_nombre"] = nombre
        if cot.get("proveedor_id") and not it.get("proveedor_seleccionado_id"):
            it["proveedor_seleccionado_id"] = cot.get("proveedor_id")
        if cot.get("observaciones") and not it.get("cotizacion_numero_seleccionada"):
            it["cotizacion_numero_seleccionada"] = cot.get("observaciones")


def _cobro_al_mapear(override_cobro, existing: dict, resolved: dict, insumo_id):
    if override_cobro is not None and override_cobro > 0:
        return override_cobro
    if _mismo_insumo_linea(existing, insumo_id):
        prev = existing.get("vlr_unitario_cobro")
        if prev not in (None, "") and _to_float(prev) > 0:
            return prev
    return resolved.get("vlr_unitario_cobro")


def mapear_item_solicitud_gerencial(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    body: dict,
    *,
    return_solicitud: bool = True,
) -> dict:
    """
    Asocia el insumo del catálogo y ajusta cantidad/costo/cobro.
    Quien llama debe tener Almacén · editar. Conserva descripcion_solicitada inmutable.
    """
    from almacen_insumos_service import apply_saldo_flags_batch, resolve_insumo_for_solicitud

    sb = _sb()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "borrador", "rechazada", "aprobada"):
        raise ValueError("No se puede mapear ítems en el estado actual de la solicitud.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if ocs and sol["estado"] == "aprobada":
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs])
        if int(item_id) in en_oc:
            raise ValueError(
                "Esta línea ya forma parte de la Orden de Compra y no se puede remapear. "
                "Use la corrección de insumo post-OC si aplica."
            )
    elif ocs and sol["estado"] != "aprobada":
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
        "es_principal": (
            _coerce_es_principal(existing.get("es_principal"), default=True)
        ),
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

    # Solo un VU cobro > 0 enviado explícitamente cuenta como override manual.
    # Enviar 0 (típico del draft con cobro vacío) NO debe bloquear la resolución del listado.
    body_cobro = body.get("vlr_unitario_cobro", None)
    override_cobro = None
    if body_cobro is not None and body_cobro != "":
        try:
            override_cobro = float(body_cobro)
        except (TypeError, ValueError):
            override_cobro = None
    if override_cobro is not None and override_cobro > 0:
        resolved["vlr_unitario_cobro"] = override_cobro
        resolved["cobro_motivo"] = None

    apply_saldo_flags_batch(
        contrato_id,
        [resolved],
        exclude_solicitud_id=solicitud_id,
        descontar_linea_actual=True,
        # Siempre reintentar listado/presupuesto si el cobro quedó en 0/None.
        refresh_listado=_to_float(resolved.get("vlr_unitario_cobro")) <= 0,
    )

    sel = _resolver_proveedor_mapeo(sb, body, existing, insumo_id)
    costo_body = dict(body)
    if sel.get("forzar_costo") and _to_float(sel.get("valor")) > 0:
        costo_body["valor_compra_unitario"] = sel.get("valor")
    cot_sel_id = _persistir_cotizacion_elegida(sb, int(item_id), existing, sel)
    patch = {
        "insumo_id": resolved.get("insumo_id"),
        "listado_precio_id": resolved.get("listado_precio_id"),
        "material_descripcion": resolved.get("material_descripcion"),
        "descripcion_solicitada": desc_sol or resolved.get("material_descripcion"),
        "unidad": resolved.get("unidad") or existing.get("unidad"),
        "cantidad": cantidad,
        "valor_compra_unitario": _costo_al_mapear(
            costo_body,
            existing,
            resolved,
            insumo_id,
            oferta_valor=sel.get("valor") if sel.get("aplicar") else None,
        ),
        "vlr_unitario_cobro": _cobro_al_mapear(override_cobro, existing, resolved, insumo_id),
        "supera_presupuesto": resolved.get("supera_presupuesto", False),
        "supera_negociado": resolved.get("supera_negociado", False),
        "es_recurrente": bool(body.get("es_recurrente", existing.get("es_recurrente"))),
        "es_principal": _coerce_es_principal(
            resolved.get("es_principal", existing.get("es_principal")),
            default=True,
        ),
    }
    if sel.get("aplicar"):
        patch["proveedor_seleccionado_id"] = sel.get("proveedor_seleccionado_id")
        patch["proveedor_seleccionado_nombre"] = sel.get("proveedor_seleccionado_nombre")
        patch["cotizacion_numero_seleccionada"] = sel.get("cotizacion_numero_seleccionada")
    if cot_sel_id:
        patch["cotizacion_seleccionada_id"] = cot_sel_id
    if patch["valor_compra_unitario"] is not None and _to_float(patch["valor_compra_unitario"]) < 0:
        raise ValueError("El costo de compra no puede ser negativo.")
    if patch["vlr_unitario_cobro"] is not None and _to_float(patch["vlr_unitario_cobro"]) < 0:
        raise ValueError("El valor de cobro no puede ser negativo.")

    _update_solicitud_item_row(sb, int(item_id), patch)
    if not return_solicitud:
        return {"ok": True, "item_id": int(item_id)}
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    # Un costo escrito a mano, distinto de la cotización, no se pisa en esta respuesta.
    oferta = sel.get("valor") if sel.get("aplicar") else None
    fijados = None
    if (
        oferta not in (None, "")
        and _to_float(oferta) > 0
        and abs(_to_float(patch["valor_compra_unitario"]) - _to_float(oferta)) > 0.009
    ):
        fijados = {int(item_id)}
    return get_solicitud(contrato_id, solicitud_id, ligera=True, precios_fijados=fijados)


def cambiar_proveedor_linea_aprobada(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    body: dict,
    *,
    ver_economicos: bool = False,
) -> tuple:
    """Cambia el proveedor de una línea aprobada. No vuelve a pedir aprobación ni toca el insumo."""
    sb = _sb()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol.get("estado") not in ("enviada", "borrador", "rechazada", "aprobada"):
        raise ValueError("No se puede cambiar el proveedor en el estado actual de la solicitud.")

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
    if (existing.get("estado_validacion") or "") != "aprobado":
        raise ValueError("Solo se puede cambiar el proveedor de una línea que ya está aprobada.")
    if not existing.get("insumo_id"):
        raise ValueError("Esta línea no tiene insumo. Asigne el insumo antes de elegir proveedor.")

    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if ocs:
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if int(item_id) in en_oc:
            raise ValueError(
                "Esta línea ya hace parte de una orden de compra generada. "
                "El proveedor no se puede cambiar."
            )

    sel = _resolver_proveedor_mapeo(sb, body, existing, existing.get("insumo_id"))
    if not sel.get("aplicar"):
        raise ValueError("Elija un proveedor de la lista de este insumo.")

    antes = {
        "proveedor_seleccionado_id": existing.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": existing.get("proveedor_seleccionado_nombre"),
        "cotizacion_numero_seleccionada": existing.get("cotizacion_numero_seleccionada"),
        "valor_compra_unitario": existing.get("valor_compra_unitario"),
        "estado_validacion": existing.get("estado_validacion"),
    }
    despues = {
        "proveedor_seleccionado_id": sel.get("proveedor_seleccionado_id"),
        "proveedor_seleccionado_nombre": sel.get("proveedor_seleccionado_nombre"),
        "cotizacion_numero_seleccionada": sel.get("cotizacion_numero_seleccionada"),
        "valor_compra_unitario": sel.get("valor") if sel.get("valor") not in (None, "") else existing.get("valor_compra_unitario"),
        "estado_validacion": "aprobado",
    }
    mismo = (
        (antes.get("proveedor_seleccionado_id") or None) == (despues.get("proveedor_seleccionado_id") or None)
        and (antes.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        == (despues.get("proveedor_seleccionado_nombre") or "").strip().casefold()
        and (antes.get("cotizacion_numero_seleccionada") or "").strip()
        == (despues.get("cotizacion_numero_seleccionada") or "").strip()
    )
    valor_nuevo = _to_float(sel.get("valor")) if sel.get("valor") not in (None, "") else 0.0
    precio_cambio = (
        valor_nuevo > 0
        and abs(valor_nuevo - _to_float(antes.get("valor_compra_unitario"))) > 0.009
    )
    if mismo and not precio_cambio:
        return get_solicitud(contrato_id, solicitud_id, ver_economicos=ver_economicos, ligera=True), {
            "cambio": False,
            "antes": antes,
            "despues": despues,
        }

    cot_sel_id = _persistir_cotizacion_elegida(sb, int(item_id), existing, sel)
    patch = {
        "proveedor_seleccionado_id": despues["proveedor_seleccionado_id"],
        "proveedor_seleccionado_nombre": despues["proveedor_seleccionado_nombre"],
        "cotizacion_numero_seleccionada": despues["cotizacion_numero_seleccionada"],
        "valor_compra_unitario": despues["valor_compra_unitario"],
    }
    if cot_sel_id:
        patch["cotizacion_seleccionada_id"] = cot_sel_id
    if patch["valor_compra_unitario"] is not None and _to_float(patch["valor_compra_unitario"]) < 0:
        raise ValueError("El costo de compra no puede ser negativo.")
    _update_solicitud_item_row(sb, int(item_id), patch)
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return get_solicitud(contrato_id, solicitud_id, ver_economicos=ver_economicos, ligera=True), {
        "cambio": True,
        "antes": antes,
        "despues": despues,
    }


def _persistir_cotizaciones_bloque(
    sb,
    lineas: List[dict],
    sel: dict,
) -> Dict[int, int]:
    """
    Una sola inserción de cotizaciones para el bloque.
    Devuelve item_id -> cotizacion_seleccionada_id.
    """
    if not sel.get("aplicar") or not lineas:
        return {}
    nombre = (sel.get("proveedor_seleccionado_nombre") or "").strip() or "Proveedor"
    valor = max(_to_float(sel.get("valor")), 0.0)
    numero = (sel.get("cotizacion_numero_seleccionada") or "").strip() or None
    base = {
        "proveedor_nombre": nombre,
        "valor_unitario": valor,
        "observaciones": numero,
    }
    pid = sel.get("proveedor_seleccionado_id")
    if pid not in (None, ""):
        try:
            base["proveedor_id"] = int(pid)
        except (TypeError, ValueError):
            pass
    rows = [{"solicitud_item_id": int(it["id"]), **base} for it in lineas]
    omitted: set = set()
    for _ in range(6):
        payload = [
            {k: v for k, v in row.items() if k not in omitted}
            for row in rows
        ]
        try:
            inserted = sb.table("almacen_cotizacion").insert(payload).execute().data or []
            out: Dict[int, int] = {}
            for row in inserted:
                iid = row.get("solicitud_item_id")
                cid = row.get("id")
                if iid and cid:
                    out[int(iid)] = int(cid)
            if len(out) == len(lineas):
                return out
            # Si el insert no devolvió representación, no bloqueamos la asignación.
            if not inserted:
                _log.warning(
                    "Inserción de cotizaciones en bloque sin representación; se continúa sin cotizacion_seleccionada_id"
                )
                return {}
            return out
        except Exception as exc:
            col = _pgrst_unknown_column(exc)
            if col and col in base and col != "solicitud_item_id":
                omitted.add(col)
                base.pop(col, None)
                continue
            _log.warning("No se pudieron crear las cotizaciones del bloque: %s", exc)
            return {}
    return {}


def mapear_items_bloque(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    item_ids: List[int],
    body: dict,
) -> dict:
    """
    Asigna el mismo insumo (y proveedor elegido) a varias líneas en lote.
    Todo o nada: si alguna línea no se puede mapear, no se escribe ninguna.
    """
    from almacen_insumos_service import (
        apply_saldo_flags_batch,
        prefetch_insumos_para_solicitud,
        resolve_insumo_for_solicitud,
    )

    t0 = time.perf_counter()
    etapas: Dict[str, float] = {}

    def _marca(nombre: str, t_prev: float) -> float:
        ahora = time.perf_counter()
        etapas[nombre] = round(ahora - t_prev, 4)
        return ahora

    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    ids: List[int] = []
    seen = set()
    for raw in item_ids or []:
        try:
            iid = int(raw)
        except (TypeError, ValueError):
            continue
        if iid in seen:
            continue
        seen.add(iid)
        ids.append(iid)
    if not ids:
        raise ValueError("Seleccione al menos una línea.")

    insumo_id = body.get("insumo_id")
    if not insumo_id:
        raise ValueError("Seleccione el insumo del catálogo.")
    try:
        insumo_id = int(insumo_id)
    except (TypeError, ValueError) as exc:
        raise ValueError("Seleccione el insumo del catálogo.") from exc

    t = _marca("validacion_ids", t0)

    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "borrador", "rechazada", "aprobada"):
        raise ValueError("No se puede mapear ítems en el estado actual de la solicitud.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc: set = set()
    if ocs and sol["estado"] == "aprobada":
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
    elif ocs and sol["estado"] != "aprobada":
        raise ValueError("Esta solicitud ya tiene Orden de Compra generada.")
    t = _marca("cabecera_y_ocs", t)

    rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", int(solicitud_id))
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    by_id = {int(r["id"]): r for r in rows if r.get("id")}
    faltan = [iid for iid in ids if iid not in by_id]
    if faltan:
        raise ValueError("Una o más líneas no pertenecen a esta solicitud.")
    lineas = [by_id[iid] for iid in ids]
    if body.get("requerir_mismo_insumo"):
        insumos_previos = set()
        for existing in lineas:
            raw_ins = existing.get("insumo_id")
            if raw_ins in (None, ""):
                raise ValueError(
                    "La edición masiva solo admite líneas del mismo insumo. "
                    "Alguna línea aún no tiene insumo asignado."
                )
            try:
                insumos_previos.add(int(raw_ins))
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    "La edición masiva solo admite líneas del mismo insumo."
                ) from exc
        if len(insumos_previos) > 1:
            raise ValueError(
                "La edición masiva solo puede incluir filas del mismo insumo. "
                "Seleccione sectores de un solo insumo."
            )
    cant_bloque = body.get("cantidad")
    cant_bloque_f = None
    if cant_bloque not in (None, ""):
        try:
            cant_bloque_f = float(cant_bloque)
        except (TypeError, ValueError):
            cant_bloque_f = None
        if cant_bloque_f is not None and cant_bloque_f <= 0:
            raise ValueError("La cantidad debe ser mayor a cero.")
    for existing in lineas:
        iid = int(existing["id"])
        if iid in en_oc:
            raise ValueError(
                f"La línea #{existing.get('numero_linea') or iid} ya forma parte de la Orden de Compra "
                "y no se puede remapear."
            )
        cantidad = cant_bloque_f if cant_bloque_f is not None else _to_float(existing.get("cantidad"))
        if cantidad <= 0:
            raise ValueError(
                f"La línea #{existing.get('numero_linea') or iid} tiene cantidad inválida."
            )
    t = _marca("lectura_lineas", t)

    insumos_cache = prefetch_insumos_para_solicitud(contrato_id, [insumo_id])
    if insumo_id not in insumos_cache:
        raise ValueError("Insumo no encontrado.")
    t = _marca("prefetch_insumo", t)

    # Proveedor una sola vez para todo el bloque (ganadora si no se envía).
    sel_proto = _resolver_proveedor_mapeo(sb, body, {"insumo_id": None}, insumo_id)
    if not sel_proto.get("aplicar"):
        # Sin cotizaciones: se asigna el insumo sin proveedor.
        sel_proto = {"aplicar": False}
    t = _marca("resolver_proveedor", t)

    body_cobro = body.get("vlr_unitario_cobro", None)
    override_cobro = None
    if body_cobro is not None and body_cobro != "":
        try:
            override_cobro = float(body_cobro)
        except (TypeError, ValueError):
            override_cobro = None
    if override_cobro is not None and override_cobro <= 0:
        override_cobro = None

    resolved_list: List[dict] = []
    meta: List[dict] = []
    for existing in lineas:
        cantidad = (
            cant_bloque_f
            if cant_bloque_f is not None
            else _to_float(existing.get("cantidad"))
        )
        raw = {
            "insumo_id": insumo_id,
            "presupuesto_id": existing.get("presupuesto_id"),
            "presupuesto_capitulo": existing.get("capitulo"),
            "presupuesto_item": existing.get("item"),
            "pk_id": existing.get("pk_id"),
            "pk_id_id": existing.get("pk_id_id"),
            "cantidad": cantidad,
            "es_recurrente": bool(existing.get("es_recurrente")),
            "es_principal": _coerce_es_principal(existing.get("es_principal"), default=True),
            "exclude_solicitud_id": solicitud_id,
            "tramo": existing.get("tramo"),
            "costado": existing.get("costado"),
            "abscisa_inicial": existing.get("abscisa_inicial"),
            "abscisa_final": existing.get("abscisa_final"),
            "observacion_residente": existing.get("observacion_residente"),
        }
        if body.get("valor_compra_unitario") is not None:
            raw["valor_compra_unitario"] = body.get("valor_compra_unitario")
        resolved = resolve_insumo_for_solicitud(
            contrato_id,
            user_id,
            raw,
            skip_context=True,
            skip_listado=True,
            defer_reparto=True,
            insumos_cache=insumos_cache,
        )
        if override_cobro is not None:
            resolved["vlr_unitario_cobro"] = override_cobro
            resolved["cobro_motivo"] = None
        resolved_list.append(resolved)
        meta.append({"existing": existing, "cantidad": cantidad})

    apply_saldo_flags_batch(
        contrato_id,
        resolved_list,
        exclude_solicitud_id=solicitud_id,
        descontar_linea_actual=True,
        refresh_listado=any(_to_float(r.get("vlr_unitario_cobro")) <= 0 for r in resolved_list),
    )
    t = _marca("resolver_y_saldos", t)

    costo_body = dict(body)
    if sel_proto.get("forzar_costo") and _to_float(sel_proto.get("valor")) > 0:
        costo_body["valor_compra_unitario"] = sel_proto.get("valor")
    # Si el cliente eligió proveedor y no mandó costo, usar el de esa oferta.
    pide_prov = any(
        body.get(k) not in (None, "")
        for k in (
            "proveedor_seleccionado_id",
            "proveedor_seleccionado_nombre",
            "cotizacion_numero_seleccionada",
        )
    )
    if (
        pide_prov
        and body.get("valor_compra_unitario") is None
        and _to_float(sel_proto.get("valor")) > 0
    ):
        costo_body["valor_compra_unitario"] = sel_proto.get("valor")

    patches: List[dict] = []
    for existing, resolved, m in zip(lineas, resolved_list, meta):
        iid = int(existing["id"])
        desc_sol = (
            existing.get("descripcion_solicitada")
            or existing.get("material_descripcion")
            or ""
        ).strip()
        patch = {
            "id": iid,
            "insumo_id": resolved.get("insumo_id"),
            "listado_precio_id": resolved.get("listado_precio_id"),
            "material_descripcion": resolved.get("material_descripcion"),
            "descripcion_solicitada": desc_sol or resolved.get("material_descripcion"),
            "unidad": resolved.get("unidad") or existing.get("unidad"),
            "cantidad": m["cantidad"],
            "valor_compra_unitario": _costo_al_mapear(
                costo_body,
                existing,
                resolved,
                insumo_id,
                oferta_valor=sel_proto.get("valor") if sel_proto.get("aplicar") else None,
            ),
            "vlr_unitario_cobro": _cobro_al_mapear(
                override_cobro, existing, resolved, insumo_id,
            ),
            "supera_presupuesto": resolved.get("supera_presupuesto", False),
            "supera_negociado": resolved.get("supera_negociado", False),
            "es_recurrente": bool(existing.get("es_recurrente")),
            "es_principal": _coerce_es_principal(
                resolved.get("es_principal", existing.get("es_principal")),
                default=True,
            ),
        }
        if sel_proto.get("aplicar"):
            patch["proveedor_seleccionado_id"] = sel_proto.get("proveedor_seleccionado_id")
            patch["proveedor_seleccionado_nombre"] = sel_proto.get("proveedor_seleccionado_nombre")
            patch["cotizacion_numero_seleccionada"] = sel_proto.get("cotizacion_numero_seleccionada")
        if patch["valor_compra_unitario"] is not None and _to_float(patch["valor_compra_unitario"]) < 0:
            raise ValueError("El costo de compra no puede ser negativo.")
        if patch["vlr_unitario_cobro"] is not None and _to_float(patch["vlr_unitario_cobro"]) < 0:
            raise ValueError("El valor de cobro no puede ser negativo.")
        patches.append(patch)

    # UPDATE por id (no upsert): no reinserta la fila ni exige numero_linea/solicitud_id.
    _patch_solicitud_items_by_id(sb, patches)
    t = _marca("update_lineas_batch", t)

    cot_ids = _persistir_cotizaciones_bloque(sb, lineas, sel_proto)
    if cot_ids:
        cot_patches = [
            {"id": iid, "cotizacion_seleccionada_id": cid}
            for iid, cid in cot_ids.items()
        ]
        _patch_solicitud_items_by_id(sb, cot_patches)
    t = _marca("cotizaciones_bloque", t)

    _sincronizar_titulo_solicitud(sb, solicitud_id)
    t = _marca("titulo", t)

    solicitud = get_solicitud(contrato_id, solicitud_id, ligera=True)
    t = _marca("get_solicitud", t)
    total = round(time.perf_counter() - t0, 4)
    _log.info(
        "mapear_items_bloque contrato=%s solicitud=%s n=%s total=%.3fs etapas=%s",
        contrato_id, solicitud_id, len(ids), total, etapas,
    )

    resultados = [
        {
            "item_id": int(existing["id"]),
            "numero_linea": existing.get("numero_linea"),
            "ok": True,
        }
        for existing in lineas
    ]
    return {
        "solicitud": solicitud,
        "resultados": resultados,
        "timing": {"total_s": total, "etapas_s": etapas, "lineas": len(ids)},
    }


def aprobar_items_bloque(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    item_ids: List[int],
) -> dict:
    """
    Aprueba las líneas que cumplen las condiciones vigentes.
    Las que no, quedan sin aprobar y se listan con el motivo.
    """
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "aprobada"):
        raise ValueError("Solo se pueden aprobar ítems de solicitudes enviadas o reabiertas.")
    ids: List[int] = []
    for raw in item_ids or []:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    if not ids:
        raise ValueError("Seleccione al menos una línea.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs]) if ocs else set()
    rows = (
        sb.table("almacen_solicitud_item")
        .select(
            "id, numero_linea, insumo_id, es_recurrente, valor_compra_unitario, estado_validacion"
        )
        .eq("solicitud_id", int(solicitud_id))
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    by_id = {int(r["id"]): r for r in rows if r.get("id")}
    ok_ids: List[int] = []
    resultados = []
    for iid in ids:
        row = by_id.get(iid)
        if not row:
            resultados.append({
                "item_id": iid,
                "numero_linea": None,
                "ok": False,
                "error": "Ítem de solicitud no encontrado.",
            })
            continue
        numero = row.get("numero_linea")
        if iid in en_oc:
            resultados.append({
                "item_id": iid,
                "numero_linea": numero,
                "ok": False,
                "error": "Ya forma parte de la Orden de Compra.",
            })
            continue
        if (row.get("estado_validacion") or "") == "aprobado":
            resultados.append({
                "item_id": iid,
                "numero_linea": numero,
                "ok": False,
                "error": "Ya está aprobada.",
            })
            continue
        if not row.get("es_recurrente") and not row.get("insumo_id"):
            resultados.append({
                "item_id": iid,
                "numero_linea": numero,
                "ok": False,
                "error": "Falta asignar el insumo del catálogo.",
            })
            continue
        if not row.get("es_recurrente") and _to_float(row.get("valor_compra_unitario")) <= 0:
            resultados.append({
                "item_id": iid,
                "numero_linea": numero,
                "ok": False,
                "error": "Falta el costo de compra unitario.",
            })
            continue
        ok_ids.append(iid)
        resultados.append({
            "item_id": iid,
            "numero_linea": numero,
            "ok": True,
        })
    if ok_ids:
        sb.table("almacen_solicitud_item").update({
            "estado_validacion": "aprobado",
        }).in_("id", ok_ids).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return {
        "solicitud": get_solicitud(contrato_id, solicitud_id, ligera=True),
        "resultados": resultados,
    }


def corregir_insumo_item_post_oc(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    user_id: int,
    body: dict,
) -> dict:
    """Excepción: corregir insumo de un ítem ya en OC, solo si la OC no tiene entradas."""
    from almacen_insumos_service import apply_saldo_flags_batch, resolve_insumo_for_solicitud

    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] != "aprobada":
        raise ValueError("Solo se pueden corregir insumos de solicitudes aprobadas con OC.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if not ocs:
        raise ValueError("No hay Orden de Compra asociada a esta solicitud.")

    # Localizar la OC que contiene esta línea (puede haber varias por proveedor).
    oc_id = None
    for oc in ocs:
        en = _solicitud_item_ids_en_oc(sb, int(oc["id"]))
        if int(item_id) in en:
            oc_id = int(oc["id"])
            break
    if oc_id is None:
        raise ValueError("Esta línea no forma parte de ninguna Orden de Compra de la solicitud.")

    entradas = (
        sb.table("almacen_entrada")
        .select("id")
        .eq("orden_compra_id", oc_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if entradas:
        raise ValueError(
            "No se puede corregir el insumo: ya existe una entrada registrada contra esta Orden de Compra."
        )

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
        "es_principal": _coerce_es_principal(existing.get("es_principal"), default=True),
        "exclude_solicitud_id": solicitud_id,
        "tramo": existing.get("tramo"),
        "costado": existing.get("costado"),
        "abscisa_inicial": existing.get("abscisa_inicial"),
        "abscisa_final": existing.get("abscisa_final"),
        "observacion_residente": existing.get("observacion_residente"),
    }
    if body.get("valor_compra_unitario") is not None:
        raw["valor_compra_unitario"] = body.get("valor_compra_unitario")

    resolved = resolve_insumo_for_solicitud(contrato_id, user_id, raw, skip_context=True)
    desc_sol = (existing.get("descripcion_solicitada") or existing.get("material_descripcion") or "").strip()
    body_cobro = body.get("vlr_unitario_cobro", None)
    override_cobro = None
    if body_cobro is not None and body_cobro != "":
        try:
            override_cobro = float(body_cobro)
        except (TypeError, ValueError):
            override_cobro = None
    if override_cobro is not None and override_cobro > 0:
        resolved["vlr_unitario_cobro"] = override_cobro
        resolved["cobro_motivo"] = None
    apply_saldo_flags_batch(
        contrato_id,
        [resolved],
        exclude_solicitud_id=solicitud_id,
        descontar_linea_actual=True,
        refresh_listado=_to_float(resolved.get("vlr_unitario_cobro")) <= 0,
    )

    sel = _resolver_proveedor_mapeo(sb, body, existing, insumo_id)
    costo_body = dict(body)
    if sel.get("forzar_costo") and _to_float(sel.get("valor")) > 0:
        costo_body["valor_compra_unitario"] = sel.get("valor")
    cot_sel_id = _persistir_cotizacion_elegida(sb, int(item_id), existing, sel)
    vu = _costo_al_mapear(costo_body, existing, resolved, insumo_id)
    if vu is None or _to_float(vu) <= 0:
        raise ValueError("Defina el costo de compra unitario del insumo corregido.")

    patch = {
        "insumo_id": resolved.get("insumo_id"),
        "listado_precio_id": resolved.get("listado_precio_id"),
        "material_descripcion": resolved.get("material_descripcion"),
        "descripcion_solicitada": desc_sol or resolved.get("material_descripcion"),
        "unidad": resolved.get("unidad") or existing.get("unidad"),
        "cantidad": cantidad,
        "valor_compra_unitario": vu,
        "vlr_unitario_cobro": _cobro_al_mapear(override_cobro, existing, resolved, insumo_id),
        "supera_presupuesto": resolved.get("supera_presupuesto", False),
        "supera_negociado": resolved.get("supera_negociado", False),
        "es_principal": _coerce_es_principal(
            resolved.get("es_principal", existing.get("es_principal")),
            default=True,
        ),
        # Conservar aprobación: quien corrige tiene autoridad de aprobar.
        "estado_validacion": existing.get("estado_validacion") or "aprobado",
    }
    if sel.get("aplicar"):
        patch["proveedor_seleccionado_id"] = sel.get("proveedor_seleccionado_id")
        patch["proveedor_seleccionado_nombre"] = sel.get("proveedor_seleccionado_nombre")
        patch["cotizacion_numero_seleccionada"] = sel.get("cotizacion_numero_seleccionada")
    if cot_sel_id:
        patch["cotizacion_seleccionada_id"] = cot_sel_id
    _update_solicitud_item_row(sb, int(item_id), patch)

    oci = (
        sb.table("almacen_orden_compra_item")
        .select("id, proveedor_nombre")
        .eq("orden_compra_id", oc_id)
        .eq("solicitud_item_id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if oci:
        proveedor = (
            (patch.get("proveedor_seleccionado_nombre") or "").strip()
            or oci[0].get("proveedor_nombre")
            or "Proveedor catálogo"
        )
        if not patch.get("proveedor_seleccionado_nombre") and resolved.get("insumo_id"):
            cat = _cotizaciones_catalogo_insumo(sb, int(resolved["insumo_id"])) or {}
            if cat.get("proveedor_id"):
                prow = (
                    sb.table("almacen_proveedor")
                    .select("razon_social")
                    .eq("id", int(cat["proveedor_id"]))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if prow and prow[0].get("razon_social"):
                    proveedor = prow[0]["razon_social"]
        sb.table("almacen_orden_compra_item").update({
            "material_descripcion": patch["material_descripcion"],
            "unidad": patch["unidad"],
            "cantidad": cantidad,
            "valor_unitario": _to_float(vu),
            "proveedor_nombre": proveedor,
        }).eq("id", int(oci[0]["id"])).execute()

    try:
        oc_full = get_orden_compra(contrato_id, oc_id)
        sol_pdf = get_solicitud(contrato_id, solicitud_id, ligera=True)
        generar_y_guardar_pdf_oc(contrato_id, oc_id, oc_full, sol_pdf, user_id)
    except Exception:
        _log.exception("No se pudo regenerar PDF de OC %s tras corrección de insumo", oc_id)

    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def _tiempos_guardado(t0: float, t_val: float, t_per: float, t_fin: float, lineas: int) -> dict:
    return {
        "validar": round((t_val - t0) * 1000, 1),
        "persistir": round((t_per - t_val) * 1000, 1),
        "responder": round((t_fin - t_per) * 1000, 1),
        "total": round((t_fin - t0) * 1000, 1),
        "lineas": int(lineas),
    }


def create_solicitud(contrato_id: int, user_id: int, body: dict) -> dict:
    t0 = time.perf_counter()
    sb = _sb()
    items = _validate_items_payload(body.get("items") or [], contrato_id, user_id)
    t_val = time.perf_counter()
    consecutivo = _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")
    sol_row = {
        "contrato_id": contrato_id,
        "consecutivo": consecutivo,
        "estado": "borrador",
        # Título automático (consecutivo + fecha Bogotá); no es editable por el usuario.
        "titulo": format_solicitud_titulo(consecutivo),
        "observaciones": (body.get("observaciones") or "").strip() or None,
        "created_by": user_id,
    }
    try:
        ins = sb.table("almacen_solicitud").insert(sol_row).execute().data
    except Exception as exc:
        # Si falta titulo en esquema antiguo, reintentar sin esa columna.
        col = _pgrst_unknown_column(exc)
        if col and col in sol_row:
            sol_row.pop(col, None)
            _log.warning("almacen_solicitud: omitiendo columna ausente %s al crear", col)
            try:
                ins = sb.table("almacen_solicitud").insert(sol_row).execute().data
            except Exception as exc2:
                raise ValueError(_humanize_solicitud_db_error(exc2)) from exc2
        else:
            raise ValueError(_humanize_solicitud_db_error(exc)) from exc
    if not ins:
        raise ValueError("No se pudo crear la solicitud.")
    sid = ins[0]["id"]
    # Alinear título con created_at real de la BD (Bogotá).
    try:
        titulo_final = format_solicitud_titulo(consecutivo, ins[0].get("created_at"))
        if titulo_final != sol_row.get("titulo"):
            sb.table("almacen_solicitud").update({"titulo": titulo_final}).eq("id", sid).execute()
    except Exception:
        _log.exception("No se pudo alinear título automático de solicitud %s", sid)
    autor = ""
    if any((it.get("observacion_residente") or "").strip() for it in items):
        autor = _nombre_usuario_id(sb, user_id)
    rows = []
    for i, it in enumerate(items, start=1):
        row = _item_for_db_insert(it)
        row["solicitud_id"] = sid
        row["numero_linea"] = i
        from almacen_linea_partida import sellar_solicitado_por

        sellar_solicitado_por(row, user_id)
        if "observacion_residente" in it:
            _aplicar_sello_justificacion(row, None, user_id, autor)
        rows.append(row)
    try:
        _insert_solicitud_items_batch(sb, rows)
        _sync_solicitud_item_repartos(sb, sid, items)
    except ValueError:
        # Cabecera huérfana: limpiar para no dejar borradores vacíos.
        try:
            sb.table("almacen_solicitud").delete().eq("id", sid).execute()
        except Exception:
            _log.exception("No se pudo revertir solicitud %s tras fallo de ítems", sid)
        raise
    t_per = time.perf_counter()
    # El nombre, el precio vigente, el proveedor y el log siguen, pero no bloquean la respuesta.
    sol = get_solicitud(contrato_id, sid, ligera=True, diferir_secundarios=True)
    t_fin = time.perf_counter()
    sol["tiempos_guardado_ms"] = _tiempos_guardado(t0, t_val, t_per, t_fin, len(items))
    _log.info(
        "almacen guardar crear lineas=%s validar_ms=%s persistir_ms=%s responder_ms=%s total_ms=%s",
        len(items),
        sol["tiempos_guardado_ms"]["validar"],
        sol["tiempos_guardado_ms"]["persistir"],
        sol["tiempos_guardado_ms"]["responder"],
        sol["tiempos_guardado_ms"]["total"],
    )
    return sol


def _solicitud_item_ids_en_oc(sb, oc_id: int) -> set:
    rows = (
        sb.table("almacen_orden_compra_item")
        .select("solicitud_item_id")
        .eq("orden_compra_id", int(oc_id))
        .execute()
        .data
        or []
    )
    return {int(r["solicitud_item_id"]) for r in rows if r.get("solicitud_item_id")}


def _solicitud_item_ids_en_ocs(sb, oc_ids: List[int]) -> set:
    ids = [int(x) for x in oc_ids if x]
    if not ids:
        return set()
    rows = (
        sb.table("almacen_orden_compra_item")
        .select("solicitud_item_id")
        .in_("orden_compra_id", ids)
        .execute()
        .data
        or []
    )
    return {int(r["solicitud_item_id"]) for r in rows if r.get("solicitud_item_id")}


def _fetch_ocs_de_solicitud(sb, contrato_id: int, solicitud_id: int) -> List[dict]:
    rows = (
        sb.table("almacen_orden_compra")
        .select("*")
        .eq("solicitud_id", int(solicitud_id))
        .eq("contrato_id", int(contrato_id))
        .order("numero_oc")
        .execute()
        .data
        or []
    )
    out = []
    for r in rows:
        row = dict(r)
        row["tiene_pdf_oc"] = bool(row.get("pdf_blob_path"))
        out.append(row)
    return out


def _fetch_oc_de_solicitud(sb, contrato_id: int, solicitud_id: int) -> Optional[dict]:
    """Compat: primera OC de la solicitud (orden por numero_oc)."""
    rows = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    return rows[0] if rows else None


def _proveedor_meta_batch(
    sb,
    items: List[dict],
) -> tuple[Dict[int, dict], Dict[int, str]]:
    """Catálogo + nombres de proveedor para un lote de ítems de solicitud."""
    insumo_ids = sorted({
        int(it["insumo_id"]) for it in items
        if it.get("insumo_id") and not it.get("es_recurrente")
    })
    cat_map = _cotizaciones_catalogo_batch(sb, insumo_ids)
    prov_ids: set = set()
    for cat in cat_map.values():
        if cat.get("proveedor_id"):
            prov_ids.add(int(cat["proveedor_id"]))
    for it in items:
        cat = it.get("cotizaciones_catalogo") or {}
        if cat.get("proveedor_id"):
            prov_ids.add(int(cat["proveedor_id"]))
        if it.get("proveedor_seleccionado_id"):
            try:
                prov_ids.add(int(it["proveedor_seleccionado_id"]))
            except (TypeError, ValueError):
                pass
    prov_nombres: Dict[int, str] = {}
    if prov_ids:
        for r in (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .in_("id", list(prov_ids))
            .execute()
            .data
            or []
        ):
            prov_nombres[int(r["id"])] = (r.get("razon_social") or "").strip()
    return cat_map, prov_nombres


def _proveedor_de_item(
    it: dict,
    cat_map: Dict[int, dict],
    prov_nombres: Dict[int, str],
) -> tuple[str, Optional[int], str]:
    """
    Clave de agrupación + id + nombre de proveedor para un ítem de solicitud.
    Una OC = un proveedor; recurrentes van juntos bajo clave 'recurrente'.
    """
    sel_nom = (it.get("proveedor_seleccionado_nombre") or "").strip()
    sel_id = it.get("proveedor_seleccionado_id")
    if sel_id not in (None, "") or _nombre_proveedor_util(sel_nom):
        try:
            pid_i = int(sel_id) if sel_id not in (None, "") else None
        except (TypeError, ValueError):
            pid_i = None
        if pid_i:
            nombre = prov_nombres.get(pid_i) or sel_nom or f"Proveedor {pid_i}"
            return f"id:{pid_i}", pid_i, nombre
        if _nombre_proveedor_util(sel_nom):
            return f"nombre:{sel_nom.casefold()}", None, sel_nom
    if it.get("es_recurrente"):
        return "recurrente", None, "Compra recurrente"
    return "sin_proveedor", None, ""


def _clasificar_proveedor_linea(
    it: dict,
    cat_map: Dict[int, dict],
    prov_nombres: Dict[int, str],
) -> dict:
    """Nombre de proveedor de la línea. Solo el dato guardado en la línea."""
    _key, pid, nombre = _proveedor_de_item(it, cat_map, prov_nombres)
    if _key not in ("sin_proveedor", "recurrente"):
        return {
            "proveedor_nombre": nombre or None,
            "proveedor_id": pid,
            "proveedor_asignado": True,
            "sin_insumo": False,
        }
    if _key == "recurrente":
        return {
            "proveedor_nombre": "Compra recurrente",
            "proveedor_id": None,
            "proveedor_asignado": True,
            "sin_insumo": False,
        }
    if not it.get("insumo_id"):
        return {
            "proveedor_nombre": None,
            "proveedor_id": None,
            "proveedor_asignado": False,
            "sin_insumo": True,
        }
    return {
        "proveedor_nombre": None,
        "proveedor_id": None,
        "proveedor_asignado": False,
        "sin_insumo": False,
    }


def _attach_proveedor_lineas(sb, items: List[dict], *, persistir: bool = True) -> None:
    """Proveedor por línea en el detalle (también en la carga ligera)."""
    if not items:
        return
    try:
        _hidratar_proveedor_desde_cotizacion(sb, items)
    except Exception:
        _log.exception("No se pudo hidratar el proveedor elegido")
    if persistir:
        try:
            completar_proveedor_guardado(sb, items)
        except Exception:
            _log.exception("No se pudo guardar el proveedor de las líneas que ya tenían insumo")
    cat_map, prov_nombres = {}, {}
    for it in items:
        info = _clasificar_proveedor_linea(it, cat_map, prov_nombres)
        it["proveedor_nombre"] = info["proveedor_nombre"]
        it["proveedor_id"] = info["proveedor_id"]
        it["proveedor_asignado"] = info["proveedor_asignado"]
        it["sin_insumo"] = info["sin_insumo"]


def _resumen_proveedores_solicitud(items: List[dict]) -> dict:
    vistos: List[str] = []
    keys: set = set()
    sin = 0
    for it in items or []:
        if it.get("sin_insumo"):
            sin += 1
            continue
        key = str(it.get("proveedor_id") if it.get("proveedor_id") is not None else (it.get("proveedor_nombre") or ""))
        if not key or key in keys:
            continue
        keys.add(key)
        vistos.append(it.get("proveedor_nombre") or "Proveedor")
    return {
        "proveedores": vistos,
        "ocs_previstas": len(vistos),
        "lineas_sin_insumo": sin,
    }


def _attach_justificacion_visible(sol: dict) -> None:
    """Si el texto existe y aún no hay sello, usa al solicitante y la fecha de envío."""
    autor = (sol.get("solicitante_nombre") or "").strip()
    cuando = sol.get("enviada_at") or sol.get("created_at")
    for it in sol.get("items") or []:
        obs = (it.get("observacion_residente") or "").strip()
        if not obs:
            continue
        if not (it.get("justificacion_autor_nombre") or "").strip() and autor:
            it["justificacion_autor_nombre"] = autor
        if not it.get("justificacion_at") and cuando:
            it["justificacion_at"] = cuando


def _agrupar_items_por_proveedor(
    sb,
    items: List[dict],
) -> List[dict]:
    """
    Agrupa ítems aprobados por proveedor.
    Retorna lista de {key, proveedor_id, proveedor_nombre, items}.
    """
    if not items:
        return []
    try:
        completar_proveedor_guardado(sb, items)
    except Exception:
        _log.exception("No se pudo guardar el proveedor antes de armar la orden de compra")
    cat_map, prov_nombres = {}, {}
    grupos: Dict[str, dict] = {}
    orden: List[str] = []
    for it in items:
        key, pid, nombre = _proveedor_de_item(it, cat_map, prov_nombres)
        if key not in grupos:
            grupos[key] = {
                "key": key,
                "proveedor_id": pid,
                "proveedor_nombre": nombre,
                "items": [],
                "_cat_map": cat_map,
                "_prov_nombres": prov_nombres,
            }
            orden.append(key)
        grupos[key]["items"].append(it)
    return [grupos[k] for k in orden]


def _oc_match_proveedor(oc: dict, key: str, proveedor_id: Optional[int], proveedor_nombre: str) -> bool:
    """True si la OC existente corresponde al mismo proveedor del grupo."""
    oc_pid = oc.get("proveedor_id")
    if proveedor_id is not None and oc_pid is not None:
        try:
            return int(oc_pid) == int(proveedor_id)
        except (TypeError, ValueError):
            pass
    oc_nombre = (oc.get("proveedor_nombre") or "").strip()
    if key == "recurrente":
        return oc_nombre.casefold() == "compra recurrente" or oc.get("_key") == "recurrente"
    if oc_pid is None and oc_nombre and proveedor_nombre:
        return oc_nombre.casefold() == proveedor_nombre.casefold()
    if oc.get("_key") and oc.get("_key") == key:
        return True
    return False


def _enrich_oc_proveedor_keys(sb, ocs: List[dict]) -> List[dict]:
    """Deriva clave de proveedor en OCs legacy sin proveedor_id en encabezado."""
    if not ocs:
        return []
    need = [oc for oc in ocs if oc.get("proveedor_id") is None and not (oc.get("proveedor_nombre") or "").strip()]
    if not need:
        for oc in ocs:
            pid = oc.get("proveedor_id")
            if pid is not None:
                oc["_key"] = f"id:{int(pid)}"
            else:
                nom = (oc.get("proveedor_nombre") or "").strip()
                if nom.casefold() == "compra recurrente":
                    oc["_key"] = "recurrente"
                elif nom:
                    oc["_key"] = f"nombre:{nom.casefold()}"
        return ocs

    oc_ids = [int(oc["id"]) for oc in need]
    item_rows = (
        sb.table("almacen_orden_compra_item")
        .select("orden_compra_id, proveedor_nombre, solicitud_item_id")
        .in_("orden_compra_id", oc_ids)
        .execute()
        .data
        or []
    )
    by_oc: Dict[int, List[dict]] = {}
    for r in item_rows:
        by_oc.setdefault(int(r["orden_compra_id"]), []).append(r)

    for oc in ocs:
        pid = oc.get("proveedor_id")
        if pid is not None:
            oc["_key"] = f"id:{int(pid)}"
            continue
        nom = (oc.get("proveedor_nombre") or "").strip()
        if not nom:
            rows = by_oc.get(int(oc["id"])) or []
            if rows:
                nom = (rows[0].get("proveedor_nombre") or "").strip()
                if nom and not oc.get("proveedor_nombre"):
                    oc["proveedor_nombre"] = nom
        if nom.casefold() == "compra recurrente":
            oc["_key"] = "recurrente"
        elif nom:
            oc["_key"] = f"nombre:{nom.casefold()}"
    return ocs


def _insertar_items_en_oc(
    sb,
    contrato_id: int,
    oc_id: int,
    items_aprobados: List[dict],
    *,
    cat_map: Optional[Dict[int, dict]] = None,
    prov_nombres: Optional[Dict[int, str]] = None,
) -> None:
    """Inserta líneas de solicitud ya aprobadas como ítems de una OC existente o nueva."""
    if cat_map is None or prov_nombres is None:
        cat_map, prov_nombres = _proveedor_meta_batch(sb, items_aprobados)

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
            _key, _pid, proveedor = _proveedor_de_item(it, cat_map, prov_nombres)
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
            "presupuesto_id": it.get("presupuesto_id"),
        }).execute()


def _update_orden_compra_proveedor(sb, oc_id: int, patch: dict) -> None:
    """Actualiza proveedor en OC; omite columnas ausentes en el esquema PostgREST."""
    data = dict(patch or {})
    for _ in range(4):
        if not data:
            return
        try:
            sb.table("almacen_orden_compra").update(data).eq("id", int(oc_id)).execute()
            return
        except Exception as exc:
            col = _pgrst_unknown_column(exc)
            if col and col in data:
                data.pop(col, None)
                continue
            raise


def _exc_text_for_humanize(exc: BaseException) -> str:
    """Junta message/details/args de PostgREST APIError y excepciones normales."""
    parts: List[str] = [str(exc or "")]
    for attr in ("message", "details", "detail", "code", "hint"):
        val = getattr(exc, attr, None)
        if val is not None:
            parts.append(str(val))
    for arg in getattr(exc, "args", ()) or ():
        if isinstance(arg, dict):
            parts.append(str(arg))
            for key in ("message", "details", "detail", "code", "hint"):
                if arg.get(key) is not None:
                    parts.append(str(arg.get(key)))
        elif arg is not None:
            parts.append(str(arg))
    return " ".join(parts)


def _humanize_oc_db_error(exc: BaseException) -> Optional[str]:
    """Mensaje claro (no técnico) ante UNIQUE u otros fallos al crear la OC."""
    text = _exc_text_for_humanize(exc).strip()
    low = text.lower()
    if not text:
        return None
    # Restricción legacy: una sola OC por solicitud.
    if (
        "almacen_orden_compra_solicitud_id_key" in low
        or (
            "solicitud_id" in low
            and ("23505" in low or "duplicate key" in low or "unique" in low)
            and "proveedor" not in low
            and "numero_oc" not in low
        )
    ):
        return (
            "No se pudieron generar las órdenes de compra: la base aún permite "
            "solo una OC por solicitud, y esta solicitud ya tiene una registrada. "
            "No quedó ninguna OC nueva a medias. Hay que ejecutar en Supabase el "
            "script backend/sql/almacen_oc_ARREGLAR_multi_proveedor.sql y volver a generar."
        )
    # Ya existe OC del mismo proveedor en la solicitud.
    if (
        "idx_almacen_oc_solicitud_proveedor" in low
        or (
            ("proveedor_id" in low or "proveedor_nombre" in low)
            and ("23505" in low or "duplicate key" in low or "unique" in low)
        )
    ):
        return (
            "Ya existe una orden de compra de ese proveedor en esta solicitud. "
            "No se creó una OC duplicada. Recargue la solicitud y genere solo "
            "los proveedores o líneas que aún falten."
        )
    if "23505" in low or "duplicate key" in low:
        return (
            "No se pudo generar la orden de compra por un conflicto de datos "
            "en la base. No quedó ninguna OC nueva a medias. Recargue e intente "
            "de nuevo; si el problema continúa, contacte a soporte."
        )
    return None


def _insert_orden_compra_row(sb, oc_row: dict) -> List[dict]:
    """Inserta encabezado de OC; si falta proveedor_id en el esquema, reintenta sin esa columna."""
    try:
        return sb.table("almacen_orden_compra").insert(oc_row).execute().data or []
    except Exception as exc:
        msg = _humanize_oc_db_error(exc)
        if msg:
            raise ValueError(msg) from exc
        col = _pgrst_unknown_column(exc)
        if col == "proveedor_id" and "proveedor_id" in oc_row:
            row2 = {k: v for k, v in oc_row.items() if k != "proveedor_id"}
            return sb.table("almacen_orden_compra").insert(row2).execute().data or []
        if col == "documento_sistema" and "documento_sistema" in oc_row:
            row2 = {k: v for k, v in oc_row.items() if k != "documento_sistema"}
            return _insert_orden_compra_row(sb, row2)
        if col == "proveedor_nombre" and "proveedor_nombre" in oc_row:
            row2 = {k: v for k, v in oc_row.items() if k != "proveedor_nombre"}
            try:
                return sb.table("almacen_orden_compra").insert(row2).execute().data or []
            except Exception as exc2:
                msg2 = _humanize_oc_db_error(exc2)
                if msg2:
                    raise ValueError(msg2) from exc2
                col2 = _pgrst_unknown_column(exc2)
                if col2 == "proveedor_id" and "proveedor_id" in row2:
                    row3 = {k: v for k, v in row2.items() if k != "proveedor_id"}
                    return sb.table("almacen_orden_compra").insert(row3).execute().data or []
                raise
        raise


def _exigir_decision_notificar(notificaciones, grupos: List[dict]) -> None:
    """Cada OC nueva exige Sí o No. Se llama antes de insertar."""
    if not grupos:
        return
    from almacen_oc_email import resolver_notificar_proveedores

    resolver_notificar_proveedores(notificaciones, grupos)


def _crear_oc_con_items(
    sb,
    *,
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    sol: dict,
    body: Optional[dict],
    items: List[dict],
    proveedor_id: Optional[int],
    proveedor_nombre: str,
    cat_map: Optional[Dict[int, dict]] = None,
    prov_nombres: Optional[Dict[int, str]] = None,
    notificaciones=None,
) -> dict:
    """Crea una OC nueva (un proveedor) e inserta sus líneas."""
    numero_oc = _next_consecutivo(contrato_id, "almacen_orden_compra", "numero_oc")
    aprobador_firma = _usuario_firma_url(sb, user_id)
    if not aprobador_firma:
        raise ValueError(
            "Configure la imagen de firma en su perfil de usuario antes de aprobar y generar la Orden de Compra."
        )
    from almacen_oc_email import correo_override_para_grupo, notificar_para_grupo

    notificar = notificar_para_grupo(
        notificaciones,
        proveedor_id=proveedor_id,
        proveedor_nombre=proveedor_nombre,
    )
    correo_override = None
    if notificar:
        correo_override = correo_override_para_grupo(
            notificaciones,
            proveedor_id=proveedor_id,
            proveedor_nombre=proveedor_nombre,
        )
    pidieron = []
    for it in items or []:
        try:
            uid_linea = int(it.get("solicitado_por")) if it.get("solicitado_por") else None
        except (TypeError, ValueError):
            uid_linea = None
        if uid_linea and uid_linea not in pidieron:
            pidieron.append(uid_linea)
    firma_de = pidieron[0] if len(pidieron) == 1 else sol.get("created_by")
    solicitante_firma = _usuario_firma_url(sb, firma_de)
    oc_row = {
        "solicitud_id": solicitud_id,
        "contrato_id": contrato_id,
        "numero_oc": numero_oc,
        "estado": "aprobada",
        "fecha_compromiso": (body or {}).get("fecha_compromiso") if body else None,
        "aprobada_por": user_id,
        "aprobador_firma_imagen_url": aprobador_firma,
        "solicitante_firma_imagen_url": solicitante_firma,
        "proveedor_nombre": proveedor_nombre,
        "documento_sistema": notificar is False,
    }
    if proveedor_id is not None:
        oc_row["proveedor_id"] = int(proveedor_id)
    oc_ins = _insert_orden_compra_row(sb, oc_row)
    if not oc_ins:
        raise ValueError("No se pudo generar la orden de compra.")
    oc_id = int(oc_ins[0]["id"])
    _insertar_items_en_oc(
        sb, contrato_id, oc_id, items,
        cat_map=cat_map, prov_nombres=prov_nombres,
    )
    return {
        "id": oc_id,
        "numero_oc": numero_oc,
        "estado": "aprobada",
        "solicitud_id": solicitud_id,
        "proveedor_id": proveedor_id,
        "proveedor_nombre": proveedor_nombre,
        "tiene_pdf_oc": False,
        "pdf_generando": True,
        "lineas": len(items),
        "notificar": notificar,
        "documento_sistema": notificar is False,
        # Solo en memoria / hilo de envío; no se persiste en la tabla.
        "correo_override": correo_override,
    }


def _envios_oc_respuesta(envios) -> List[dict]:
    return envios if isinstance(envios, list) else []


def _regenerar_pdfs_oc(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    ocs: List[dict],
) -> None:
    """Actualiza el PDF de OC que ya existían (líneas agregadas). No reenvía el correo."""
    if not ocs:
        return
    try:
        sol_pdf = get_solicitud(contrato_id, solicitud_id, ligera=True)
    except Exception as exc:
        _log.warning("PDF de OC existentes, solicitud %s: %s", solicitud_id, exc)
        return
    for oc in ocs:
        oc_id = oc.get("id")
        if not oc_id:
            continue
        try:
            oc_full = get_orden_compra(contrato_id, int(oc_id), incluir_entradas=False)
            generar_y_guardar_pdf_oc(contrato_id, int(oc_id), oc_full, sol_pdf, user_id)
        except Exception as exc:
            _log.warning("PDF OC %s no regenerado: %s", oc_id, exc)


def _resumen_envio_oc_inmediato(oc: dict) -> dict:
    """Lo que ve el usuario al confirmar la OC, antes del PDF y del correo."""
    if oc.get("documento_sistema") or oc.get("notificar") is False:
        return {
            "orden_compra_id": oc.get("id"),
            "numero_oc": oc.get("numero_oc"),
            "proveedor_nombre": oc.get("proveedor_nombre"),
            "resultado": "sistema",
            "detalle": "Documento de sistema. El PDF se prepara en segundo plano y no se envía correo.",
            "destinatarios": [],
            "envio_estado": None,
            "documento_sistema": True,
            "persistido": True,
        }
    return {
        "orden_compra_id": oc.get("id"),
        "numero_oc": oc.get("numero_oc"),
        "proveedor_nombre": oc.get("proveedor_nombre"),
        "resultado": "en_proceso",
        "detalle": "El PDF y el correo al proveedor se preparan en segundo plano.",
        "destinatarios": [],
        "envio_estado": "en_proceso",
        "persistido": True,
    }


def _lanzar_pdfs_oc(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    ocs: List[dict],
    regenerar: Optional[List[dict]] = None,
) -> List[dict]:
    """Confirma la OC al instante. El PDF y el correo siguen después, en otro hilo."""
    pendientes = [_resumen_envio_oc_inmediato(oc) for oc in (ocs or []) if oc.get("id")]
    ocs_nuevas = [oc for oc in (ocs or []) if oc.get("id")]
    ocs_regen = [oc for oc in (regenerar or []) if oc.get("id")]
    if not ocs_nuevas and not ocs_regen:
        return pendientes

    def _trabajo():
        t0 = time.perf_counter()
        try:
            if ocs_regen:
                _regenerar_pdfs_oc(contrato_id, solicitud_id, user_id, ocs_regen)
            if ocs_nuevas:
                from almacen_oc_email import publicar_envios_oc
                publicar_envios_oc(contrato_id, solicitud_id, user_id, ocs_nuevas)
        except Exception:
            _log.exception("PDF o correo de la OC, solicitud %s", solicitud_id)
        else:
            _log.info(
                "almacen oc fondo solicitud=%s nuevas=%s regen=%s ms=%s",
                solicitud_id,
                len(ocs_nuevas),
                len(ocs_regen),
                int((time.perf_counter() - t0) * 1000),
            )

    threading.Thread(
        target=_trabajo,
        name=f"oc-pdf-{solicitud_id}",
        daemon=True,
    ).start()
    return pendientes


def agregar_lineas_post_oc(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    body: dict,
) -> dict:
    """
    Reabrir OC: agrega solo líneas nuevas a una solicitud que ya tiene OC.
    No modifica ni elimina líneas ya incluidas en la Orden de Compra.
    """
    sb = _sb()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol.get("estado") != "aprobada":
        raise ValueError("Solo se pueden agregar líneas a solicitudes con OC generada (aprobadas).")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if not ocs:
        raise ValueError("No hay Orden de Compra asociada a esta solicitud.")

    raw_items = body.get("items") or []
    if not raw_items:
        raise ValueError("Indique al menos una línea nueva para agregar.")

    # Solo líneas sin id (nuevas). Ignorar/bloquear intentos de editar existentes.
    nuevos_raw = [dict(it) for it in raw_items if not it.get("id")]
    if not nuevos_raw:
        raise ValueError(
            "No hay líneas nuevas. Las líneas ya aprobadas en la OC no se pueden modificar aquí."
        )
    for it in nuevos_raw:
        it.pop("estado_validacion", None)

    validated = _validate_items_payload(
        nuevos_raw, contrato_id, user_id, exclude_solicitud_id=solicitud_id,
    )
    # Número de línea a continuación de las existentes.
    max_linea = 0
    existing = (
        sb.table("almacen_solicitud_item")
        .select("numero_linea")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    for r in existing:
        try:
            max_linea = max(max_linea, int(r.get("numero_linea") or 0))
        except (TypeError, ValueError):
            pass

    to_insert: List[dict] = []
    for i, it in enumerate(validated, start=1):
        row = _item_for_db_insert(it)
        row["solicitud_id"] = solicitud_id
        row["numero_linea"] = max_linea + i
        row["estado_validacion"] = "pendiente"
        from almacen_linea_partida import sellar_solicitado_por

        sellar_solicitado_por(row, user_id)
        to_insert.append(row)
    _insert_solicitud_items_batch(sb, to_insert)

    result = get_solicitud(contrato_id, solicitud_id, ligera=True)
    result["lineas_agregadas"] = len(to_insert)
    result["oc_reabierta"] = True
    return result


def _ids_item_seleccion(body: Optional[dict]) -> Optional[set]:
    """None = todas las líneas. Conjunto vacío = el usuario no marcó proveedores."""
    if not body or "item_ids" not in body or body.get("item_ids") is None:
        return None
    out = set()
    for raw in body.get("item_ids") or []:
        try:
            out.add(int(raw))
        except (TypeError, ValueError):
            continue
    return out


def _contar_lineas_sin_insumo(items: List[dict]) -> int:
    """Cero si el listado no trajo insumo_id: no marcar toda la grilla por un esquema viejo."""
    if not items or not any("insumo_id" in it for it in items):
        return 0
    return sum(1 for it in items if not it.get("insumo_id"))


def lineas_fuera_de_oc(items: List[dict], en_oc_ids) -> List[dict]:
    """Líneas que todavía no están en una OC y no fueron rechazadas."""
    en = {int(x) for x in (en_oc_ids or []) if x}
    fuera = []
    for it in items or []:
        iid = it.get("id")
        if not iid:
            continue
        if (it.get("estado_validacion") or "pendiente") == "rechazado":
            continue
        if int(iid) not in en:
            fuera.append(it)
    return fuera


def _aplicar_estado_tras_generar_oc(sb, solicitud_id: int, user_id: int, oc_ids: List[int]) -> str:
    """Aprobada solo cuando no queda ningún proveedor sin OC."""
    items = (
        sb.table("almacen_solicitud_item")
        .select("id, estado_validacion")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    en = _solicitud_item_ids_en_ocs(sb, oc_ids) if oc_ids else set()
    if lineas_fuera_de_oc(items, en):
        sb.table("almacen_solicitud").update({
            "estado": "enviada",
            "motivo_rechazo": None,
        }).eq("id", solicitud_id).execute()
        _sincronizar_titulo_solicitud(sb, solicitud_id)
        return "enviada"
    sb.table("almacen_solicitud").update({
        "estado": "aprobada",
        "validada_at": _now_iso(),
        "validada_by": user_id,
        "motivo_rechazo": None,
    }).eq("id", solicitud_id).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return "aprobada"


def append_aprobados_a_oc(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    *,
    aprobar_pendientes: bool = True,
    item_ids: Optional[List[int]] = None,
    notificaciones=None,
) -> dict:
    """
    Suma líneas aprobadas pendientes a la(s) OC de la solicitud.
    Misma proveedor → misma OC; proveedor distinto → nueva OC.
    """
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    ocs = _enrich_oc_proveedor_keys(sb, _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id))
    if not ocs:
        raise ValueError("No hay Orden de Compra asociada a esta solicitud.")
    oc_ids = [int(o["id"]) for o in ocs]
    en_oc = _solicitud_item_ids_en_ocs(sb, oc_ids)
    seleccion = None if item_ids is None else {int(x) for x in item_ids}
    if seleccion is not None and not seleccion:
        raise ValueError("Seleccione al menos un proveedor para generar la orden de compra.")

    if aprobar_pendientes:
        pending = (
            sb.table("almacen_solicitud_item")
            .select("id")
            .eq("solicitud_id", solicitud_id)
            .eq("estado_validacion", "pendiente")
            .execute()
            .data
            or []
        )
        null_pending = (
            sb.table("almacen_solicitud_item")
            .select("id")
            .eq("solicitud_id", solicitud_id)
            .is_("estado_validacion", "null")
            .execute()
            .data
            or []
        )
        ids_pend = [
            int(r["id"]) for r in (pending + null_pending)
            if int(r["id"]) not in en_oc and (seleccion is None or int(r["id"]) in seleccion)
        ]
        if ids_pend:
            sb.table("almacen_solicitud_item").update({
                "estado_validacion": "aprobado",
            }).in_("id", ids_pend).execute()

    fresh = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    items_nuevos = []
    faltan_insumo = []
    faltan_costo = []
    for it in fresh:
        iid = int(it["id"])
        if iid in en_oc:
            continue
        if seleccion is not None and iid not in seleccion:
            continue
        ev = it.get("estado_validacion") or "pendiente"
        if ev != "aprobado":
            continue
        linea = it.get("numero_linea") or iid
        if not it.get("insumo_id") and not it.get("es_recurrente"):
            faltan_insumo.append(str(linea))
            continue
        vu = _to_float(it.get("valor_compra_unitario"))
        if vu <= 0 and not it.get("es_recurrente"):
            faltan_costo.append(str(linea))
            continue
        items_nuevos.append(it)

    if faltan_insumo:
        detalle = ", ".join(f"#{n}" for n in faltan_insumo[:12])
        raise ValueError(
            "No se pueden agregar a la OC: faltan insumos del catálogo en "
            f"línea(s) {detalle}. Asigne el insumo en la revisión antes de continuar."
        )
    if faltan_costo:
        detalle = ", ".join(f"#{n}" for n in faltan_costo[:12])
        raise ValueError(
            "No se pueden agregar a la OC: falta el costo de compra en "
            f"línea(s) {detalle}."
        )
    if not items_nuevos:
        raise ValueError("No hay líneas nuevas aprobadas pendientes de agregar a la OC.")

    grupos = _agrupar_items_por_proveedor(sb, items_nuevos)
    grupos_nuevos = [
        g for g in grupos
        if not any(
            _oc_match_proveedor(oc, g["key"], g["proveedor_id"], g["proveedor_nombre"])
            for oc in ocs
        )
    ]
    if grupos_nuevos and not _usuario_firma_url(sb, user_id):
        raise ValueError(
            "Configure la imagen de firma en su perfil de usuario antes de aprobar y generar la Orden de Compra."
        )
    _exigir_decision_notificar(notificaciones, grupos_nuevos)
    ocs_afectadas: List[dict] = []
    ocs_creadas: List[dict] = []
    lineas_total = 0

    try:
        for g in grupos:
            key = g["key"]
            pid = g["proveedor_id"]
            pname = g["proveedor_nombre"]
            items_g = g["items"]
            cat_map = g.get("_cat_map")
            prov_nombres = g.get("_prov_nombres")
            match = next(
                (oc for oc in ocs if _oc_match_proveedor(oc, key, pid, pname)),
                None,
            )
            if match:
                _insertar_items_en_oc(
                    sb, contrato_id, int(match["id"]), items_g,
                    cat_map=cat_map, prov_nombres=prov_nombres,
                )
                # Completar encabezado si era legacy sin proveedor.
                if match.get("proveedor_id") is None and pid is not None:
                    _update_orden_compra_proveedor(sb, int(match["id"]), {
                        "proveedor_id": int(pid),
                        "proveedor_nombre": pname,
                    })
                    match["proveedor_id"] = pid
                    match["proveedor_nombre"] = pname
                elif not (match.get("proveedor_nombre") or "").strip() and pname:
                    _update_orden_compra_proveedor(sb, int(match["id"]), {
                        "proveedor_nombre": pname,
                    })
                    match["proveedor_nombre"] = pname
                summary = {
                    "id": int(match["id"]),
                    "numero_oc": match.get("numero_oc"),
                    "estado": match.get("estado") or "aprobada",
                    "solicitud_id": solicitud_id,
                    "proveedor_id": match.get("proveedor_id") or pid,
                    "proveedor_nombre": match.get("proveedor_nombre") or pname,
                    "tiene_pdf_oc": False,
                    "pdf_generando": True,
                    "lineas_agregadas_oc": len(items_g),
                }
                ocs_afectadas.append(summary)
            else:
                created = _crear_oc_con_items(
                    sb,
                    contrato_id=contrato_id,
                    solicitud_id=solicitud_id,
                    user_id=user_id,
                    sol=sol,
                    body=None,
                    items=items_g,
                    proveedor_id=pid,
                    proveedor_nombre=pname,
                    cat_map=cat_map,
                    prov_nombres=prov_nombres,
                    notificaciones=notificaciones,
                )
                created["lineas_agregadas_oc"] = len(items_g)
                ocs_creadas.append(created)
                ocs_afectadas.append(created)
                ocs.append({**created, "_key": key})
            lineas_total += len(items_g)
    except Exception:
        _descartar_ocs_recien_creadas(
            sb, [int(o["id"]) for o in ocs_creadas if o.get("id")],
        )
        raise

    todas = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    _aplicar_estado_tras_generar_oc(
        sb, solicitud_id, user_id, [int(o["id"]) for o in todas],
    )

    result = get_solicitud(contrato_id, solicitud_id, ligera=True, diferir_secundarios=True)
    primaria = ocs_afectadas[0]
    result["orden_compra_generada"] = primaria
    result["ordenes_compra_generadas"] = ocs_afectadas
    result["ocs_creadas"] = ocs_creadas
    result["lineas_agregadas_oc"] = lineas_total

    nuevas = {int(o["id"]) for o in ocs_creadas if o.get("id")}
    result["envios_oc"] = _envios_oc_respuesta(
        _lanzar_pdfs_oc(
            contrato_id,
            solicitud_id,
            user_id,
            ocs_creadas,
            regenerar=[o for o in ocs_afectadas if int(o.get("id") or 0) not in nuevas],
        )
    )
    return result


def _marcar_solicitud_aprobada_y_respuesta_ocs(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    items_aprobados: List[dict],
    ocs_creadas: List[dict],
) -> dict:
    sb = _sb()
    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "aprobado",
    }).eq("solicitud_id", solicitud_id).in_("id", [int(it["id"]) for it in items_aprobados]).execute()

    todas = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    _aplicar_estado_tras_generar_oc(
        sb, solicitud_id, user_id, [int(o["id"]) for o in todas],
    )

    result = get_solicitud(contrato_id, solicitud_id, ligera=True, diferir_secundarios=True)
    primaria = ocs_creadas[0]
    result["orden_compra_generada"] = primaria
    result["ordenes_compra_generadas"] = ocs_creadas
    result["envios_oc"] = _envios_oc_respuesta(
        _lanzar_pdfs_oc(contrato_id, solicitud_id, user_id, ocs_creadas)
    )
    return result


def update_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: dict) -> dict:
    t0 = time.perf_counter()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    head = (
        sb.table("almacen_solicitud")
        .select("id, estado, consecutivo, created_at")
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
            raise ValueError("La solicitud aprobada no permite editar ítems.")
        # El nombre lo arma el grupo (proveedor y estado), no un texto libre.
        _sincronizar_titulo_solicitud(sb, solicitud_id)
        return get_solicitud(contrato_id, solicitud_id, ligera=True)
    if not _solicitud_editable(estado):
        raise ValueError("La solicitud ya fue aprobada y no puede editarse.")
    if "observaciones" in body:
        sb.table("almacen_solicitud").update({
            "observaciones": (body.get("observaciones") or "").strip() or None,
        }).eq("id", solicitud_id).execute()
    n_items = 0
    t_val = t0
    if "items" in body:
        items = _validate_items_payload(body["items"], contrato_id, user_id, exclude_solicitud_id=solicitud_id)
        t_val = time.perf_counter()
        n_items = len(items)
        _sync_solicitud_items(sb, solicitud_id, estado, items, user_id)
    t_per = time.perf_counter()
    sol = get_solicitud(contrato_id, solicitud_id, ligera=True, diferir_secundarios=True)
    t_fin = time.perf_counter()
    sol["tiempos_guardado_ms"] = _tiempos_guardado(t0, t_val, t_per, t_fin, n_items)
    _log.info(
        "almacen guardar editar id=%s lineas=%s validar_ms=%s persistir_ms=%s responder_ms=%s total_ms=%s",
        solicitud_id,
        n_items,
        sol["tiempos_guardado_ms"]["validar"],
        sol["tiempos_guardado_ms"]["persistir"],
        sol["tiempos_guardado_ms"]["responder"],
        sol["tiempos_guardado_ms"]["total"],
    )
    return sol


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
    _exigir_agrupacion_libre(contrato_id, int(item["solicitud_id"]), user_id)
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
        "valor_total": producto(vu, cant),
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
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
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
    _sincronizar_titulo_solicitud(sb, solicitud_id)
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
    """Aprueba o rechaza un ítem individual (incluye líneas nuevas post-OC)."""
    sb = _sb()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "aprobada"):
        raise ValueError("Solo se pueden validar ítems de solicitudes enviadas o reabiertas.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if ocs:
        en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs])
        if int(item_id) in en_oc:
            raise ValueError("Esta línea ya forma parte de la Orden de Compra.")
        if sol["estado"] != "aprobada" and sol["estado"] != "enviada":
            raise ValueError("Estado de solicitud no válido para validar ítems.")
    elif sol["estado"] not in ("enviada", "aprobada"):
        raise ValueError("Solo se pueden validar ítems de solicitudes enviadas.")
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
    if accion == "rechazar":
        upd["motivo_rechazo_linea"] = (motivo or "").strip()
    try:
        sb.table("almacen_solicitud_item").update(upd).eq("id", item_id).execute()
    except Exception as exc:
        if _pgrst_unknown_column(exc) == "motivo_rechazo_linea":
            upd.pop("motivo_rechazo_linea", None)
            sb.table("almacen_solicitud_item").update(upd).eq("id", item_id).execute()
        else:
            raise
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def aprobar_todos_items_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    """Marca como aprobados todos los ítems pendientes (excluye los ya en OC)."""
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if sol["estado"] not in ("enviada", "aprobada"):
        raise ValueError("Solo aplica a solicitudes enviadas o reabiertas.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs]) if ocs else set()

    pending = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .eq("estado_validacion", "pendiente")
        .execute()
        .data
        or []
    )
    nulls = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", solicitud_id)
        .is_("estado_validacion", "null")
        .execute()
        .data
        or []
    )
    ids = [int(r["id"]) for r in (pending + nulls) if int(r["id"]) not in en_oc]
    if ids:
        sb.table("almacen_solicitud_item").update({
            "estado_validacion": "aprobado",
        }).in_("id", ids).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def _insertar_solicitud_derivada(sb, contrato_id: int, user_id: int, origen: dict) -> dict:
    """Solicitud nueva que recibe solo las líneas elegidas para la OC."""
    from almacen_datetime import format_solicitud_titulo

    consecutivo = _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")
    created_at = _now_iso()
    # El documento derivado sigue siendo de quien pidió la solicitud original.
    # Quien genera la OC queda como validador, no reemplaza al solicitante.
    creador = origen.get("created_by") or user_id
    row = {
        "contrato_id": int(contrato_id),
        "consecutivo": consecutivo,
        "estado": "enviada",
        "titulo": format_solicitud_titulo(consecutivo, created_at),
        "created_by": int(creador),
        "created_at": created_at,
        "enviada_at": created_at,
        "solicitud_origen_id": int(origen["id"]),
    }
    try:
        ins = sb.table("almacen_solicitud").insert(row).execute().data or []
    except Exception as exc:
        col = _pgrst_unknown_column(exc)
        if col == "solicitud_origen_id":
            row.pop("solicitud_origen_id", None)
            ins = sb.table("almacen_solicitud").insert(row).execute().data or []
        else:
            raise
    if not ins:
        raise ValueError("No se pudo crear el grupo derivado de la solicitud.")
    creada = dict(ins[0])
    creada.setdefault("consecutivo", consecutivo)
    creada.setdefault("estado", "enviada")
    creada.setdefault("titulo", row["titulo"])
    creada.setdefault("created_by", int(creador))
    return creada


def _borrar_solicitud_si_vacia(sb, solicitud_id: int) -> None:
    lineas = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", int(solicitud_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if lineas:
        return
    sb.table("almacen_solicitud").delete().eq("id", int(solicitud_id)).execute()


def _descartar_ocs_recien_creadas(sb, oc_ids: List[int]) -> None:
    for oc_id in oc_ids or []:
        try:
            sb.table("almacen_orden_compra_item").delete().eq("orden_compra_id", int(oc_id)).execute()
        except Exception:
            _log.exception("No se pudo retirar las líneas de la OC %s", oc_id)
        try:
            sb.table("almacen_orden_compra").delete().eq("id", int(oc_id)).execute()
        except Exception:
            _log.exception("No se pudo retirar la OC %s", oc_id)


def _abrir_solicitud_derivada_y_mover(
    sb, contrato_id: int, user_id: int, origen: dict, items: List[dict], item_ids: List[int],
) -> dict:
    from almacen_agrupar import _mover_lineas_bloque, _reasignar_mensajes_bloque
    from almacen_linea_partida import filas_para_mover

    hija = _insertar_solicitud_derivada(sb, contrato_id, user_id, origen)
    filas = filas_para_mover(items, item_ids, int(hija["id"]))
    if len(filas) != len({int(x) for x in item_ids}):
        _borrar_solicitud_si_vacia(sb, int(hija["id"]))
        raise ValueError("No se pudieron identificar todas las líneas elegidas. No se movió ninguna.")
    try:
        _mover_lineas_bloque(sb, filas)
        _reasignar_mensajes_bloque(sb, filas)
    except Exception:
        try:
            _revertir_separacion_oc(sb, {"solicitud_id": int(hija["id"]), "filas": filas}, [])
        except Exception:
            _log.exception("No se pudo devolver las líneas a la solicitud %s", origen.get("id"))
        raise
    return {"solicitud_id": int(hija["id"]), "solicitud": hija, "filas": filas}


def _revertir_separacion_oc(sb, separacion: dict, oc_ids: List[int]) -> None:
    from almacen_agrupar import _mover_lineas_bloque, _reasignar_mensajes_bloque
    from almacen_linea_partida import filas_para_devolver

    _descartar_ocs_recien_creadas(sb, oc_ids)
    vuelta = filas_para_devolver(separacion.get("filas") or [])
    if vuelta:
        _mover_lineas_bloque(sb, vuelta)
        _reasignar_mensajes_bloque(sb, vuelta)
    _borrar_solicitud_si_vacia(sb, int(separacion["solicitud_id"]))


def aprobar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, body: Optional[dict] = None) -> dict:
    t_oc = time.perf_counter()
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    body = body or {}
    sol = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    existing_ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    seleccion = _ids_item_seleccion(body)
    if seleccion is not None and not seleccion:
        raise ValueError("Seleccione al menos un proveedor para generar la orden de compra.")

    from almacen_linea_partida import destino_oc, marcar_en_oc

    en_oc_ids = (
        _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in existing_ocs if o.get("id")])
        if existing_ocs else set()
    )
    decision_rows = (
        sb.table("almacen_solicitud_item")
        .select("id, estado_validacion, numero_linea, solicitud_id")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    modo = destino_oc(marcar_en_oc(decision_rows, en_oc_ids), seleccion, bool(existing_ocs))

    # Reapertura: ya hay OC y se incluyen todas las líneas que todavía faltan.
    # Una parte de esas líneas no se agrega aquí: pasa a una solicitud derivada.
    if existing_ocs and modo != "derivada":
        if sol["estado"] not in ("enviada", "aprobada"):
            raise ValueError("Solo se pueden agregar líneas a la OC en solicitudes enviadas o aprobadas.")
        return append_aprobados_a_oc(
            contrato_id,
            solicitud_id,
            user_id,
            aprobar_pendientes=bool(body.get("aprobar_todos_pendientes", True)),
            item_ids=None if seleccion is None else list(seleccion),
            notificaciones=body.get("notificar_proveedores"),
        )

    if sol["estado"] not in ("enviada", "aprobada"):
        raise ValueError("Solo se pueden aprobar solicitudes enviadas.")

    if body.get("aprobar_todos_pendientes", True):
        q_pend = (
            sb.table("almacen_solicitud_item").update({
                "estado_validacion": "aprobado",
            }).eq("solicitud_id", solicitud_id).eq("estado_validacion", "pendiente")
        )
        q_null = (
            sb.table("almacen_solicitud_item").update({
                "estado_validacion": "aprobado",
            }).eq("solicitud_id", solicitud_id).is_("estado_validacion", "null")
        )
        if seleccion is not None:
            q_pend = q_pend.in_("id", list(seleccion))
            q_null = q_null.in_("id", list(seleccion))
        q_pend.execute()
        q_null.execute()

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
    faltan_insumo = []
    faltan_costo = []
    for it in fresh_items:
        ev = it.get("estado_validacion") or "pendiente"
        if ev != "aprobado":
            continue
        if seleccion is not None and int(it["id"]) not in seleccion:
            continue
        merged = dict(it)
        linea = merged.get("numero_linea") or merged.get("id")
        if not merged.get("insumo_id") and not merged.get("es_recurrente"):
            faltan_insumo.append(str(linea))
            continue
        vu = _to_float(merged.get("valor_compra_unitario"))
        if vu <= 0 and not merged.get("es_recurrente"):
            faltan_costo.append(str(linea))
            continue
        items_aprobados.append(merged)
    if faltan_insumo:
        detalle = ", ".join(f"#{n}" for n in faltan_insumo[:12])
        extra = f" (+{len(faltan_insumo) - 12} más)" if len(faltan_insumo) > 12 else ""
        raise ValueError(
            "No se puede generar la Orden de Compra: faltan insumos del catálogo en "
            f"{len(faltan_insumo)} línea(s) ({detalle}{extra}). "
            "Asigne el insumo en la revisión de cada línea antes de aprobar."
        )
    if faltan_costo:
        detalle = ", ".join(f"#{n}" for n in faltan_costo[:12])
        raise ValueError(
            "No se puede generar la Orden de Compra: falta el costo de compra unitario en "
            f"línea(s) {detalle}. Defínalo en la revisión de línea antes de aprobar."
        )
    if not items_aprobados:
        raise ValueError("Debe aprobar al menos un ítem antes de generar la Orden de Compra.")

    # Una OC independiente por proveedor involucrado.
    grupos = _agrupar_items_por_proveedor(sb, items_aprobados)
    if not _usuario_firma_url(sb, user_id):
        raise ValueError(
            "Configure la imagen de firma en su perfil de usuario antes de aprobar y generar la Orden de Compra."
        )
    _exigir_decision_notificar(body.get("notificar_proveedores"), grupos)
    separacion = None
    solicitud_oc_id = solicitud_id
    sol_oc = sol
    if modo == "derivada":
        items_aprobados = [it for it in items_aprobados if int(it["id"]) not in en_oc_ids]
        if not items_aprobados:
            raise ValueError("Las líneas elegidas ya están en una orden de compra.")
        grupos = _agrupar_items_por_proveedor(sb, items_aprobados)
        separacion = _abrir_solicitud_derivada_y_mover(
            sb, contrato_id, user_id, sol, fresh_items,
            [int(it["id"]) for it in items_aprobados],
        )
        solicitud_oc_id = int(separacion["solicitud_id"])
        sol_oc = separacion["solicitud"]
        nuevos = {int(f["item_id"]): f["numero_linea"] for f in separacion["filas"]}
        for it in items_aprobados:
            iid = int(it["id"])
            if iid in nuevos:
                it["numero_linea"] = nuevos[iid]
                it["solicitud_id"] = solicitud_oc_id
    ocs_creadas: List[dict] = []
    try:
        for g in grupos:
            created = _crear_oc_con_items(
                sb,
                contrato_id=contrato_id,
                solicitud_id=solicitud_oc_id,
                user_id=user_id,
                sol=sol_oc,
                body=body,
                items=g["items"],
                proveedor_id=g["proveedor_id"],
                proveedor_nombre=g["proveedor_nombre"],
                cat_map=g.get("_cat_map"),
                prov_nombres=g.get("_prov_nombres"),
                notificaciones=body.get("notificar_proveedores"),
            )
            ocs_creadas.append(created)
    except Exception:
        creadas_ids = [int(o["id"]) for o in ocs_creadas if o.get("id")]
        if separacion:
            _revertir_separacion_oc(sb, separacion, creadas_ids)
        else:
            # Todo o nada: si falla la 2.ª OC, no queda la 1.ª a medias.
            _descartar_ocs_recien_creadas(sb, creadas_ids)
        raise

    if not separacion:
        result = _marcar_solicitud_aprobada_y_respuesta_ocs(
            contrato_id, solicitud_id, user_id, items_aprobados, ocs_creadas,
        )
        result["movimientos_linea"] = []
        result["tiempos_oc_ms"] = {"confirmar": int((time.perf_counter() - t_oc) * 1000)}
        _log.info(
            "almacen oc confirmar solicitud=%s lineas=%s ms=%s fondo=pdf_correo",
            solicitud_id, len(items_aprobados), result["tiempos_oc_ms"]["confirmar"],
        )
        return result

    result = _marcar_solicitud_aprobada_y_respuesta_ocs(
        contrato_id, solicitud_oc_id, user_id, items_aprobados, ocs_creadas,
    )
    try:
        _aplicar_estado_tras_generar_oc(
            sb, solicitud_id, user_id, [int(o["id"]) for o in existing_ocs if o.get("id")],
        )
        padre = get_solicitud(contrato_id, solicitud_id, ligera=True, diferir_secundarios=True)
        result["solicitud_origen"] = padre
        result["solicitud_origen_resultado"] = {
            "id": padre.get("id"),
            "consecutivo": padre.get("consecutivo"),
            "estado": padre.get("estado"),
            "oc_parcial": padre.get("oc_parcial"),
            "items_count": len(padre.get("items") or []),
        }
    except Exception:
        _log.exception("La OC quedó creada; no se pudo refrescar la solicitud de origen %s", solicitud_id)
        result["solicitud_origen_resultado"] = {
            "id": solicitud_id,
            "consecutivo": sol.get("consecutivo"),
        }
    result["movimientos_linea"] = [
        {
            "item_id": fila["item_id"],
            "antes": {
                **(fila.get("antes") or {}),
                "consecutivo": sol.get("consecutivo"),
            },
            "despues": {
                "solicitud_id": solicitud_oc_id,
                "numero_linea": fila["numero_linea"],
                "consecutivo": sol_oc.get("consecutivo"),
            },
        }
        for fila in separacion["filas"]
    ]
    result["tiempos_oc_ms"] = {"confirmar": int((time.perf_counter() - t_oc) * 1000)}
    _log.info(
        "almacen oc confirmar solicitud=%s parcial=1 lineas=%s ms=%s fondo=pdf_correo",
        solicitud_id, len(items_aprobados), result["tiempos_oc_ms"]["confirmar"],
    )
    return result


def rechazar_solicitud(contrato_id: int, solicitud_id: int, user_id: int, motivo: str) -> dict:
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
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
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    return get_solicitud(contrato_id, solicitud_id, ligera=True)


def rechazar_lineas_seleccion(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    item_ids: List[int],
    motivo: str,
) -> dict:
    """Rechaza solo las líneas indicadas. La solicitud completa se rechaza aparte."""
    from almacen_linea_partida import estado_si_toda_la_solicitud_rechazada

    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    head = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if head.get("estado") not in ("enviada", "aprobada"):
        raise ValueError("Solo se pueden rechazar líneas de una solicitud enviada o aprobada.")
    motivo = (motivo or "").strip()
    if not motivo:
        raise ValueError("Indique el motivo del rechazo.")
    ids = []
    for raw in item_ids or []:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise ValueError("Seleccione al menos una línea.")

    items = (
        sb.table("almacen_solicitud_item")
        .select("id, estado_validacion, numero_linea")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    por_id = {int(it["id"]): it for it in items if it.get("id")}
    ajenas = [i for i in ids if i not in por_id]
    if ajenas:
        raise ValueError("Hay líneas seleccionadas que no pertenecen a esta solicitud. No se rechazó ninguna.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")]) if ocs else set()
    en_orden = [i for i in ids if i in en_oc]
    if en_orden:
        raise ValueError("Hay líneas seleccionadas que ya están en una orden de compra. No se rechazó ninguna.")

    upd = {"estado_validacion": "rechazado", "motivo_rechazo_linea": motivo}
    try:
        sb.table("almacen_solicitud_item").update(upd).in_("id", ids).execute()
    except Exception as exc:
        if _pgrst_unknown_column(exc) == "motivo_rechazo_linea":
            upd.pop("motivo_rechazo_linea", None)
            sb.table("almacen_solicitud_item").update(upd).in_("id", ids).execute()
        else:
            raise

    despues = (
        sb.table("almacen_solicitud_item")
        .select("id, estado_validacion")
        .eq("solicitud_id", solicitud_id)
        .execute()
        .data
        or []
    )
    paso = estado_si_toda_la_solicitud_rechazada(despues)
    if paso == "rechazada":
        sb.table("almacen_solicitud").update({
            "estado": "rechazada",
            "validada_at": _now_iso(),
            "validada_by": user_id,
            "motivo_rechazo": motivo,
        }).eq("id", solicitud_id).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    sol = get_solicitud(contrato_id, solicitud_id, ligera=True)
    sol["lineas_rechazadas"] = ids
    sol["lineas_sin_cambio"] = [int(it["id"]) for it in despues if int(it["id"]) not in set(ids)]
    sol["solicitud_paso_a_rechazada"] = paso == "rechazada"
    return sol


def revocar_aprobacion_lineas(
    contrato_id: int,
    solicitud_id: int,
    user_id: int,
    item_ids: List[int],
    *,
    confirmar: bool = False,
) -> dict:
    """
    Devuelve a pendiente las líneas aprobadas seleccionadas.
    Todo o nada. No toca líneas que ya están en una OC.
    """
    if not confirmar:
        raise ValueError("Confirme antes de revocar la aprobación de las líneas.")
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    head = dict(_fetch_solicitud_head(contrato_id, solicitud_id))
    if head.get("estado") not in ("enviada", "aprobada"):
        raise ValueError(
            "Solo se puede revocar la aprobación en solicitudes enviadas o reabiertas."
        )
    ids: List[int] = []
    for raw in item_ids or []:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise ValueError("Seleccione al menos una línea aprobada.")

    items = (
        sb.table("almacen_solicitud_item")
        .select("id, estado_validacion, numero_linea")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )
    por_id = {int(it["id"]): it for it in items if it.get("id")}
    ajenas = [i for i in ids if i not in por_id]
    if ajenas:
        raise ValueError(
            "Hay líneas seleccionadas que no pertenecen a esta solicitud. "
            "No se revocó ninguna."
        )
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    en_oc = (
        _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
        if ocs else set()
    )
    en_orden = [i for i in ids if i in en_oc]
    if en_orden:
        nums = []
        for i in en_orden[:5]:
            n = (por_id.get(i) or {}).get("numero_linea")
            nums.append(str(n if n is not None else i))
        detalle = ", ".join(nums)
        mas = f" y {len(en_orden) - 5} más" if len(en_orden) > 5 else ""
        raise ValueError(
            "No se puede revocar la aprobación: hay líneas seleccionadas que ya "
            f"están en una orden de compra (línea(s) {detalle}{mas}). "
            "No se revocó ninguna."
        )

    no_aprobadas = []
    for i in ids:
        ev = ((por_id.get(i) or {}).get("estado_validacion") or "pendiente").strip().lower()
        if ev != "aprobado":
            no_aprobadas.append(i)
    if no_aprobadas:
        raise ValueError(
            "Solo se puede revocar la aprobación de líneas ya aprobadas. "
            f"{len(no_aprobadas)} de la selección no está(n) aprobada(s). "
            "No se revocó ninguna."
        )

    snapshots = [
        {
            "item_id": i,
            "numero_linea": (por_id.get(i) or {}).get("numero_linea"),
            "estado_validacion": "aprobado",
        }
        for i in ids
    ]
    sb.table("almacen_solicitud_item").update({
        "estado_validacion": "pendiente",
    }).in_("id", ids).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
    sol = get_solicitud(contrato_id, solicitud_id, ligera=True)
    return {
        "solicitud": sol,
        "lineas_revocadas": ids,
        "lineas": len(ids),
        "antes": snapshots,
    }


def _trozos_ids(ids: List[int], size: int = 80):
    for i in range(0, len(ids), size):
        yield ids[i:i + size]


def trazabilidad_linea(item_id: int, *, ver_economicos: bool = True) -> dict:
    """Ficha e historial de una línea, solo de esa línea."""
    from almacen_linea_partida import (
        evento_es_de_esta_linea,
        eventos_sinteticos,
        ficha_linea,
        presentar_evento,
    )

    sb = _sb()
    rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Línea de solicitud no encontrada.")
    item = dict(rows[0])
    try:
        sols = (
            sb.table("almacen_solicitud")
            .select("id, contrato_id, consecutivo, titulo, created_by, estado, solicitud_origen_id")
            .eq("id", int(item["solicitud_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        if not _pgrst_unknown_column(exc):
            raise
        sols = (
            sb.table("almacen_solicitud")
            .select("id, contrato_id, consecutivo, titulo, created_by, estado")
            .eq("id", int(item["solicitud_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
    if not sols:
        raise ValueError("Solicitud de la línea no encontrada.")
    sol = dict(sols[0])
    insumo = {}
    if item.get("insumo_id"):
        ins_rows = (
            sb.table("almacen_insumo")
            .select("id, codigo, descripcion")
            .eq("id", int(item["insumo_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        if ins_rows:
            insumo = dict(ins_rows[0])
    nombres = _map_usuario_nombres(sb, [item.get("solicitado_por"), sol.get("created_by")])
    ficha = ficha_linea(item, sol, insumo, nombres=nombres, ver_economicos=ver_economicos)

    logs: List[dict] = []
    for tipo in ("solicitud_item", "almacen_solicitud_item"):
        try:
            logs.extend(
                sb.table("logs")
                .select("*")
                .eq("entidad_tipo", tipo)
                .eq("entidad_id", str(item_id))
                .execute()
                .data
                or []
            )
        except Exception:
            _log.exception("No se pudo leer el log %s de la línea %s", tipo, item_id)
    try:
        de_solicitud = (
            sb.table("logs")
            .select("*")
            .eq("entidad_tipo", "solicitud")
            .eq("entidad_id", str(sol["id"]))
            .execute()
            .data
            or []
        )
    except Exception:
        de_solicitud = []
    vistos = {row.get("id") for row in logs if row.get("id") is not None}
    for row in de_solicitud:
        if row.get("id") in vistos:
            continue
        if evento_es_de_esta_linea(row, int(item_id)):
            logs.append(row)

    oc_items = (
        sb.table("almacen_orden_compra_item")
        .select("id, orden_compra_id, solicitud_item_id, cantidad, valor_unitario")
        .eq("solicitud_item_id", int(item_id))
        .execute()
        .data
        or []
    )
    oc_ids = sorted({int(r["orden_compra_id"]) for r in oc_items if r.get("orden_compra_id")})
    ordenes = []
    if oc_ids:
        ordenes = (
            sb.table("almacen_orden_compra")
            .select("id, numero_oc, created_at, estado")
            .in_("id", oc_ids)
            .execute()
            .data
            or []
        )
    entrada_items: List[dict] = []
    entradas: List[dict] = []
    salidas: List[dict] = []
    oci_ids = [int(r["id"]) for r in oc_items if r.get("id")]
    if oci_ids:
        try:
            entrada_items = (
                sb.table("almacen_entrada_item")
                .select("id, entrada_id, orden_compra_item_id, cantidad_recibida")
                .in_("orden_compra_item_id", oci_ids)
                .execute()
                .data
                or []
            )
        except Exception:
            entrada_items = []
        ent_ids = sorted({int(r["entrada_id"]) for r in entrada_items if r.get("entrada_id")})
        if ent_ids:
            try:
                entradas = (
                    sb.table("almacen_entrada")
                    .select("id, fecha_entrada, created_at")
                    .in_("id", ent_ids)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                entradas = []
        ei_ids = [int(r["id"]) for r in entrada_items if r.get("id")]
        if ei_ids:
            try:
                salidas = (
                    sb.table("almacen_salida")
                    .select("id, numero_salida, entrada_item_id, cantidad_salida, fecha_hora_salida, created_at")
                    .in_("entrada_item_id", ei_ids)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                salidas = []
    sinteticos = eventos_sinteticos(
        int(item_id), oc_items, ordenes, entradas, entrada_items, salidas,
    )
    eventos = [presentar_evento(row, ver_economicos=ver_economicos) for row in logs]
    eventos.extend(presentar_evento(row, ver_economicos=ver_economicos) for row in sinteticos)
    eventos.sort(key=lambda ev: str(ev.get("cuando") or ""))
    return {
        "ficha": ficha,
        "eventos": eventos,
        "contrato_id": sol.get("contrato_id"),
    }


def reporte_autoria_lineas(contrato_id: int) -> dict:
    """Informe de solo lectura. No corrige líneas ni órdenes de compra."""
    from almacen_linea_partida import armar_reporte_autoria

    sb = _sb()
    sols = (
        sb.table("almacen_solicitud")
        .select("id, consecutivo, created_by, titulo")
        .eq("contrato_id", int(contrato_id))
        .execute()
        .data
        or []
    )
    ids = [int(s["id"]) for s in sols if s.get("id")]
    items: List[dict] = []
    selects = (
        "id, solicitud_id, numero_linea, descripcion_solicitada, material_descripcion, solicitado_por",
        "id, solicitud_id, numero_linea, descripcion_solicitada, material_descripcion",
        "id, solicitud_id, numero_linea",
    )
    for select in selects:
        try:
            items = []
            for chunk in _trozos_ids(ids, 80):
                items.extend(
                    sb.table("almacen_solicitud_item")
                    .select(select)
                    .in_("solicitud_id", chunk)
                    .execute()
                    .data
                    or []
                )
            break
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                raise
            items = []
    logs: List[dict] = []
    item_ids = [int(it["id"]) for it in items if it.get("id")]
    for chunk in _trozos_ids(item_ids, 50):
        try:
            logs.extend(
                sb.table("logs")
                .select("id, accion, entidad_tipo, entidad_id, valor_anterior, valor_nuevo, created_at")
                .eq("accion", "AGRUPAR")
                .eq("entidad_tipo", "solicitud_item")
                .in_("entidad_id", [str(i) for i in chunk])
                .execute()
                .data
                or []
            )
        except Exception:
            _log.exception("No se pudo leer Agrupar para el reporte de autoría")
            break
    user_ids = []
    for s in sols:
        if s.get("created_by"):
            user_ids.append(int(s["created_by"]))
    for it in items:
        if it.get("solicitado_por"):
            user_ids.append(int(it["solicitado_por"]))
    nombres = _map_usuario_nombres(sb, user_ids)
    reporte = armar_reporte_autoria(items, sols, logs, nombres)
    reporte["consulta_sql"] = _SQL_REPORTE_AUTORIA
    reporte["oc_emitidas"] = "No se modifican."
    return reporte


_SQL_REPORTE_AUTORIA = """
-- Solo lectura. No corrige solicitantes ni órdenes de compra.
-- Ejecutar después de la migración que agrega almacen_solicitud_item.solicitado_por.
WITH movimientos AS (
  SELECT
    l.entidad_id::bigint AS item_id,
    l.created_at,
    NULLIF(l.valor_anterior->>'solicitud_id', '')::bigint AS origen_id,
    NULLIF(l.valor_nuevo->>'solicitud_id', '')::bigint AS destino_id
  FROM public.logs l
  WHERE l.accion = 'AGRUPAR'
    AND l.entidad_tipo = 'solicitud_item'
    AND l.entidad_id ~ '^[0-9]+$'
),
primero AS (
  SELECT DISTINCT ON (item_id) item_id, created_at, origen_id
  FROM movimientos
  WHERE origen_id IS NOT NULL
  ORDER BY item_id, created_at ASC
)
SELECT
  i.id AS item_id,
  i.solicitud_id AS solicitud_actual_id,
  sa.created_by AS solicitud_actual_de,
  i.solicitado_por,
  p.origen_id,
  so.created_by AS candidato_solicitado_por,
  CASE
    WHEN so.created_by IS NULL THEN 'incierto'
    WHEN i.solicitado_por IS NOT NULL AND i.solicitado_por <> so.created_by THEN 'incierto_conflicto'
    WHEN i.solicitado_por IS NOT NULL AND i.solicitado_por = so.created_by THEN 'ya_correcto'
    WHEN sa.created_by IS NOT DISTINCT FROM so.created_by THEN 'ya_correcto'
    ELSE 'restauraria'
  END AS certeza
FROM primero p
JOIN public.almacen_solicitud_item i ON i.id = p.item_id
JOIN public.almacen_solicitud sa ON sa.id = i.solicitud_id
LEFT JOIN public.almacen_solicitud so ON so.id = p.origen_id
ORDER BY i.id;
""".strip()


def anular_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> dict:
    """Anula una solicitud enviada (marca rechazada). Un borrador se elimina aparte, con permiso Eliminar."""
    _exigir_agrupacion_libre(contrato_id, solicitud_id, user_id)
    sb = _sb()
    head = _fetch_solicitud_head(contrato_id, solicitud_id)
    estado = head.get("estado")
    if estado not in ("borrador", "enviada"):
        raise ValueError("Solo se pueden anular solicitudes en borrador o enviadas.")
    if estado == "borrador":
        raise ValueError(
            "Anular no elimina un borrador. "
            "Eliminar la solicitud requiere el permiso Eliminar."
        )
    sb.table("almacen_solicitud").update({
        "estado": "rechazada",
        "validada_at": _now_iso(),
        "validada_by": user_id,
        "motivo_rechazo": "Anulada por el solicitante.",
    }).eq("id", solicitud_id).execute()
    _sincronizar_titulo_solicitud(sb, solicitud_id)
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


def _borrar_hijos_solicitud(sb, solicitud_id: int) -> None:
    """Mensajes y líneas de esta solicitud. La orden de compra no se toca."""
    for tabla, col in (
        ("almacen_solicitud_mensaje_destinatario", "solicitud_id"),
        ("almacen_solicitud_mensaje", "solicitud_id"),
    ):
        try:
            sb.table(tabla).delete().eq(col, int(solicitud_id)).execute()
        except Exception:
            pass
    items = (
        sb.table("almacen_solicitud_item")
        .select("id")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )
    for it in items:
        iid = it.get("id")
        if iid is None:
            continue
        try:
            sb.table("almacen_cotizacion").delete().eq("solicitud_item_id", int(iid)).execute()
        except Exception:
            pass
    sb.table("almacen_solicitud_item").delete().eq("solicitud_id", int(solicitud_id)).execute()


def eliminar_solicitud(contrato_id: int, solicitud_id: int) -> dict:
    """Baja de una solicitud sin orden de compra. Exige permiso Eliminar en la ruta."""
    from almacen_eliminar_reglas import MOTIVO_SOLICITUD_OC, registro_completo

    sb = _sb()
    rows = (
        sb.table("almacen_solicitud")
        .select("*")
        .eq("id", int(solicitud_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Solicitud no encontrada.")
    head = rows[0]
    items = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("solicitud_id", int(solicitud_id))
        .execute()
        .data
        or []
    )
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, int(solicitud_id))
    if ocs:
        raise ValueError(MOTIVO_SOLICITUD_OC)
    registro = registro_completo({"solicitud": head, "items": items})
    _borrar_hijos_solicitud(sb, int(solicitud_id))
    sb.table("almacen_solicitud").delete().eq("id", int(solicitud_id)).eq(
        "contrato_id", int(contrato_id),
    ).execute()
    _invalidar_graficos_inventario(contrato_id)
    return {
        "ok": True,
        "id": int(solicitud_id),
        "consecutivo": head.get("consecutivo"),
        "registro": registro,
    }


def eliminar_linea_solicitud(contrato_id: int, item_id: int) -> dict:
    """Baja de una línea que no está en una orden de compra."""
    from almacen_eliminar_reglas import MOTIVO_LINEA_OC, registro_completo

    sb = _sb()
    rows = (
        sb.table("almacen_solicitud_item")
        .select("*")
        .eq("id", int(item_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Línea de solicitud no encontrada.")
    item = rows[0]
    sol_id = int(item.get("solicitud_id") or 0)
    head = (
        sb.table("almacen_solicitud")
        .select("id, contrato_id, consecutivo")
        .eq("id", sol_id)
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not head:
        raise ValueError("Línea de solicitud no encontrada.")
    ocs = _fetch_ocs_de_solicitud(sb, contrato_id, sol_id)
    en_oc = _solicitud_item_ids_en_ocs(sb, [int(o["id"]) for o in ocs if o.get("id")])
    if int(item_id) in en_oc:
        raise ValueError(MOTIVO_LINEA_OC)
    try:
        sb.table("almacen_cotizacion").delete().eq("solicitud_item_id", int(item_id)).execute()
    except Exception:
        pass
    sb.table("almacen_solicitud_item").delete().eq("id", int(item_id)).execute()
    try:
        _sincronizar_titulo_solicitud(sb, sol_id)
    except Exception:
        pass
    _invalidar_graficos_inventario(contrato_id)
    return {
        "ok": True,
        "id": int(item_id),
        "solicitud_id": sol_id,
        "consecutivo": head[0].get("consecutivo"),
        "registro": registro_completo(item),
    }


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
    # Orden ascendente por código de insumo (misma regla del PDF).
    oc["items"].sort(
        key=lambda it: (
            0 if (it.get("insumo_codigo") or "").strip() else 1,
            (it.get("insumo_codigo") or "").strip().casefold(),
            int(it.get("id") or 0),
        )
    )
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
    from almacen_oc_email import listar_envios_oc

    oc["envios"] = listar_envios_oc(sb, oc_id)
    return oc


def _armar_pdf_oc(
    contrato_id: int,
    oc_id: int,
    oc: dict,
    solicitud: dict,
    user_id: int,
) -> dict:
    """Arma el HTML y los bytes del PDF. No sube ni reemplaza el archivo guardado."""
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
    ids_nombre = [uid_apr, solicitud.get("created_by")]
    for it in solicitud.get("items") or []:
        if it.get("solicitado_por") and not it.get("solicitado_por_nombre"):
            ids_nombre.append(it.get("solicitado_por"))
    names = _map_usuario_nombres(sb, ids_nombre)
    if uid_apr:
        aprobador = names.get(int(uid_apr), "—")
    if solicitud.get("created_by") and not solicitud.get("solicitante_nombre"):
        solicitud["solicitante_nombre"] = names.get(int(solicitud["created_by"]))
    for it in solicitud.get("items") or []:
        if it.get("solicitado_por") and not it.get("solicitado_por_nombre"):
            try:
                it["solicitado_por_nombre"] = names.get(int(it["solicitado_por"]))
            except (TypeError, ValueError):
                pass
    from almacen_linea_partida import quien_pidio_de_items
    ids_oc = {
        int(it["solicitud_item_id"])
        for it in (oc.get("items") or [])
        if it.get("solicitud_item_id")
    }
    dueno_solicitud = solicitud.get("solicitante_nombre")
    solicitud["solicitante_nombre"] = quien_pidio_de_items(
        solicitud.get("items") or [],
        {"solicitante_nombre": dueno_solicitud},
        ids_oc or None,
    )

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
        selects_ins = (
            "id, codigo, tipo_impuesto, impuesto_porcentaje, costo_base, "
            "tributos, impuestos, proveedor_id, cotizacion_vigencia",
            "id, codigo, tipo_impuesto, impuesto_porcentaje, costo_base, "
            "tributos, proveedor_id, cotizacion_vigencia",
            "id, codigo, tipo_impuesto, impuesto_porcentaje, costo_base, "
            "proveedor_id, cotizacion_vigencia",
            "id, codigo, tipo_impuesto, impuesto_porcentaje, costo_base, proveedor_id",
            "id, codigo, costo_base, proveedor_id",
        )
        ins_rows = []
        for cols in selects_ins:
            try:
                ins_rows = (
                    sb.table("almacen_insumo")
                    .select(cols)
                    .in_("id", insumo_ids)
                    .execute()
                    .data
                    or []
                )
                break
            except Exception as exc:
                if not _pgrst_unknown_column(exc):
                    raise
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
    # cotizacion_vigencia del catálogo = vigencia de la cotización (p. ej. «15 días»),
    # no plazos de pago. Si falta, no inventar otro dato.
    for ins in insumo_map.values():
        vig = (ins.get("cotizacion_vigencia") or "").strip()
        if vig and not terminos:
            terminos = vig
            break

    from almacen_orden_compra_pdf import generar_pdf_orden_compra, _pdf_desde_html

    html = generar_pdf_orden_compra(
        contrato=contrato_rows[0],
        orden_compra=oc,
        solicitud=solicitud,
        aprobador_nombre=aprobador,
        aprobador_firma_url=oc.get("aprobador_firma_imagen_url"),
        solicitante_firma_url=oc.get("solicitante_firma_imagen_url"),
        proveedores=_proveedores_de_esta_oc(oc, proveedores),
        insumo_map=insumo_map,
        terminos=terminos,
        solo_html=True,
    )
    pdf_bytes = _pdf_desde_html(html)
    from almacen_oc_pdf_version import nombre_archivo_pdf_oc
    nombre = nombre_archivo_pdf_oc(oc)
    return {
        "pdf_bytes": pdf_bytes,
        "html": html,
        "nombre": nombre,
        "insumo_map": insumo_map,
        "sol_items": sol_items,
    }


def generar_y_guardar_pdf_oc(
    contrato_id: int,
    oc_id: int,
    oc: dict,
    solicitud: dict,
    user_id: int,
) -> dict:
    """Primera generación: escribe el PDF vigente. No usar para reemplazar uno ya guardado."""
    sb = _sb()
    armado = _armar_pdf_oc(contrato_id, oc_id, oc, solicitud, user_id)
    nombre = armado["nombre"]
    blob_path = f"almacen-soportes/{contrato_id}/oc-pdf/{oc_id}/{_safe_filename(nombre)}"
    upload_blob_private(blob_path, armado["pdf_bytes"], "application/pdf", overwrite=True)
    sb.table("almacen_orden_compra").update({
        "pdf_blob_path": blob_path,
        "pdf_nombre": nombre,
    }).eq("id", oc_id).execute()
    return {
        "pdf_blob_path": blob_path,
        "pdf_nombre": nombre,
        "pdf_bytes": armado["pdf_bytes"],
        "html": armado["html"],
        "insumo_map": armado["insumo_map"],
        "sol_items": armado["sol_items"],
    }


def _proveedores_de_esta_oc(oc: dict, candidatos: List[dict]) -> List[dict]:
    """El bloque Para de cada hoja nombra solo al proveedor de esa OC."""
    pid = oc.get("proveedor_id")
    nombre = (oc.get("proveedor_nombre") or "").strip()
    if pid not in (None, ""):
        try:
            pid_i = int(pid)
        except (TypeError, ValueError):
            pid_i = None
        if pid_i is not None:
            for p in candidatos or []:
                try:
                    if int(p.get("id")) == pid_i:
                        return [p]
                except (TypeError, ValueError):
                    continue
            return [{"id": pid_i, "razon_social": nombre or "Proveedor"}]
    if nombre:
        return [{"razon_social": nombre}]
    return list(candidatos or [])


def download_pdf_oc(contrato_id: int, oc_id: int, user_id: int) -> tuple[bytes, str]:
    """Descarga el PDF de la OC. Reutiliza blob existente; solo regenera si falta."""
    oc = get_orden_compra(contrato_id, oc_id)
    from almacen_oc_pdf_version import nombre_archivo_pdf_oc
    fname = oc.get("pdf_nombre") or nombre_archivo_pdf_oc(oc)
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
        _log.warning("No se pudo generar el PDF de la OC %s: %s", oc_id, exc)
        raise ValueError("No se pudo generar el PDF de la orden de compra.") from exc
    oc = get_orden_compra(contrato_id, oc_id)
    if not oc.get("pdf_blob_path"):
        raise ValueError("No se pudo generar el PDF de la Orden de Compra.")
    data, _mime = download_soporte(oc.get("pdf_blob_path"))
    if not data:
        raise ValueError("El PDF de la Orden de Compra está vacío o no está disponible.")
    fname = oc.get("pdf_nombre") or fname
    return data, fname


def _unir_pdfs(partes: List[bytes]) -> bytes:
    """Concatena PDFs ya guardados. Cada uno conserva sus hojas."""
    import io

    from pypdf import PdfReader, PdfWriter

    if not partes:
        raise ValueError("No hay órdenes de compra para el PDF.")
    if len(partes) == 1:
        return partes[0]
    writer = PdfWriter()
    for parte in partes:
        for page in PdfReader(io.BytesIO(parte)).pages:
            writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    data = buf.getvalue()
    if not data:
        raise ValueError("No se pudo armar el PDF de las órdenes de compra.")
    return data


def download_pdf_conjunto_solicitud(contrato_id: int, solicitud_id: int, user_id: int) -> tuple[bytes, str]:
    """PDF de quien genera la OC: todas las órdenes de la solicitud, una por hoja.

    Reutiliza el archivo ya guardado. Solo genera el PDF si esa OC todavía no tiene uno.
    El correo al proveedor sigue adjuntando solo el PDF de su propia OC.
    """
    sb = _sb()
    heads = _fetch_ocs_de_solicitud(sb, contrato_id, solicitud_id)
    if not heads:
        raise ValueError("Esta solicitud no tiene órdenes de compra.")
    heads = sorted(heads, key=lambda o: (int(o.get("numero_oc") or 0), int(o.get("id") or 0)))
    solicitud = None
    partes: List[bytes] = []
    for head in heads:
        oc = get_orden_compra(contrato_id, int(head["id"]), incluir_entradas=False)
        data = b""
        if oc.get("pdf_blob_path"):
            try:
                data, _mime = download_soporte(oc.get("pdf_blob_path"))
            except Exception:
                data = b""
        if not data:
            if solicitud is None:
                solicitud = get_solicitud(contrato_id, solicitud_id, ligera=True)
            saved = generar_y_guardar_pdf_oc(
                contrato_id, int(head["id"]), oc, solicitud or {}, user_id,
            )
            data = saved.get("pdf_bytes") or b""
        if not data:
            numero = head.get("numero_oc")
            etiqueta = f"la OC {numero}" if numero not in (None, "") else "una orden de compra"
            raise ValueError(f"No se pudo armar el PDF de {etiqueta}.")
        partes.append(data)
    nums = [
        str(o.get("numero_oc")) if o.get("numero_oc") not in (None, "") else "sin-numero"
        for o in heads
    ]
    fname = f"OC-{'-'.join(nums)}.pdf"
    return _unir_pdfs(partes), fname


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
    val_total = producto(cant, vu)
    val_rec = float(a_decimal(item.get("valor_recibido")))
    saldo_cant = round(max(0.0, cant - rec), 4)
    saldo_val = float(max(a_decimal(0), a_decimal(val_total) - a_decimal(val_rec)))
    return {
        "saldo_cantidad": saldo_cant,
        "saldo_valor": saldo_val,
        "valor_total": val_total,
        "valor_recibido_acum": val_rec,
        "tiene_saldo": saldo_cant > 0.0001 and a_decimal(saldo_val) > Decimal("0.0000001"),
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


def _estado_entrada_vs_oc(items: List[dict], estado_oc: Optional[str] = None) -> Optional[str]:
    """
    Grilla solicitudes: Total si qty recibida coincide con la OC; Parcial si hay recepción incompleta.
    None = sin entradas registradas (o OC anulada).
    """
    if estado_oc == "anulada":
        return None
    if not items:
        return None
    any_rec = False
    all_full = True
    for it in items:
        cant = _to_float(it.get("cantidad"))
        rec = _to_float(it.get("cantidad_recibida"))
        if rec > 0.0001:
            any_rec = True
        if rec + 0.0001 < cant:
            all_full = False
    if not any_rec:
        return None
    return "total" if all_full else "parcial"


def _estado_salida_vs_entrada(
    entrada_items: List[dict],
    despacho_neto: Dict[int, float],
) -> Optional[str]:
    """
    Grilla solicitudes: Total si el despacho neto coincide con lo recibido en entrada;
    Parcial si hay salidas incompletas. None = sin salidas.
    """
    if not entrada_items:
        return None
    any_recv = False
    any_out = False
    all_full = True
    for ei in entrada_items:
        recibida = _to_float(ei.get("cantidad_recibida"))
        if recibida <= 0.0001:
            continue
        any_recv = True
        try:
            eid = int(ei["id"])
        except (TypeError, ValueError, KeyError):
            continue
        desp = _to_float(despacho_neto.get(eid, 0.0))
        if desp > 0.0001:
            any_out = True
        if desp + 0.0001 < recibida:
            all_full = False
    if not any_recv or not any_out:
        return None
    return "total" if all_full else "parcial"


def _rollup_estados_parcial_total(estados: List[Optional[str]]) -> Optional[str]:
    """Total solo si todas las OC están total; Parcial si hay avance incompleto; None si nada."""
    if not estados or all(e is None for e in estados):
        return None
    if all(e == "total" for e in estados):
        return "total"
    return "parcial"


def _chunked_ids(ids: List[int], size: int = 120):
    for i in range(0, len(ids), size):
        yield ids[i:i + size]


def _enriquecer_ocs_estado_entrada_salida(sb, oc_rows: List[dict]) -> None:
    """Adjunta estado_entrada / estado_salida (total|parcial|None) a cada OC in-place."""
    if not oc_rows:
        return
    oc_ids = [int(oc["id"]) for oc in oc_rows if oc.get("id") is not None]
    if not oc_ids:
        return

    items_by_oc: Dict[int, List[dict]] = {}
    for part in _chunked_ids(oc_ids):
        batch = (
            sb.table("almacen_orden_compra_item")
            .select("id, orden_compra_id, cantidad, cantidad_recibida")
            .in_("orden_compra_id", part)
            .execute()
            .data
            or []
        )
        for it in batch:
            oid = int(it["orden_compra_id"])
            items_by_oc.setdefault(oid, []).append(it)

    entradas_by_oc: Dict[int, List[dict]] = {}
    for part in _chunked_ids(oc_ids):
        batch = (
            sb.table("almacen_entrada")
            .select("id, orden_compra_id")
            .in_("orden_compra_id", part)
            .execute()
            .data
            or []
        )
        for en in batch:
            oid = int(en["orden_compra_id"])
            entradas_by_oc.setdefault(oid, []).append(en)

    entrada_ids = [
        int(en["id"])
        for lst in entradas_by_oc.values()
        for en in lst
        if en.get("id") is not None
    ]
    ei_by_entrada: Dict[int, List[dict]] = {}
    for part in _chunked_ids(entrada_ids):
        batch = (
            sb.table("almacen_entrada_item")
            .select("id, entrada_id, cantidad_recibida")
            .in_("entrada_id", part)
            .execute()
            .data
            or []
        )
        for ei in batch:
            eid = int(ei["entrada_id"])
            ei_by_entrada.setdefault(eid, []).append(ei)

    all_ei_ids = [
        int(ei["id"])
        for lst in ei_by_entrada.values()
        for ei in lst
        if ei.get("id") is not None
    ]
    despacho = _despacho_neto_por_entrada_item(sb, all_ei_ids) if all_ei_ids else {}

    for oc in oc_rows:
        oid = int(oc["id"])
        oc_items = items_by_oc.get(oid, [])
        oc["estado_entrada"] = _estado_entrada_vs_oc(oc_items, oc.get("estado"))
        ei_rows: List[dict] = []
        for en in entradas_by_oc.get(oid, []):
            ei_rows.extend(ei_by_entrada.get(int(en["id"]), []))
        oc["estado_salida"] = _estado_salida_vs_entrada(ei_rows, despacho)


def _enriquecer_ocs_con_saldo_recepcion(sb, rows: List[dict]) -> List[dict]:
    if not rows:
        return rows
    oc_ids = [int(r["id"]) for r in rows]
    all_items = (
        sb.table("almacen_orden_compra_item")
        .select("orden_compra_id, cantidad, cantidad_recibida, valor_unitario, valor_recibido, unidad, proveedor_nombre")
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
        items = items_by_oc.get(oid, [])
        r.update(_oc_recepcion_resumen(items, r.get("estado")))
        if not (r.get("proveedor_nombre") or "").strip() and items:
            nom = (items[0].get("proveedor_nombre") or "").strip()
            if nom:
                r["proveedor_nombre"] = nom
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


def preview_proximo_consecutivo_solicitud(contrato_id: int) -> dict:
    """Próximo número de solicitud (para título automático antes del primer guardado)."""
    return {"proximo": _next_consecutivo(contrato_id, "almacen_solicitud", "consecutivo")}


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
    from almacen_pos_pdf_common import needs_pos_regen

    ent = get_entrada(contrato_id, entrada_id)
    if ent.get("tipo") not in ("disposicion", "recibo"):
        raise ValueError("Esta entrada no tiene PDF POS de Despachador.")
    path = ent.get("disposicion_pdf_blob_path")
    data = None
    if path:
        try:
            data, _mime = download_soporte(path)
        except Exception as exc:
            _log.warning("Descarga PDF entrada %s: %s", entrada_id, exc)
            data = None
    if data and not needs_pos_regen(data):
        fname = ent.get("disposicion_pdf_nombre") or f"entrada-{entrada_id}.pdf"
        return data, fname
    try:
        _regenerar_pdf_pos_entrada(contrato_id, entrada_id, ent)
        ent = get_entrada(contrato_id, entrada_id)
        path = ent.get("disposicion_pdf_blob_path")
        if path:
            data, _mime = download_soporte(path)
    except Exception as exc:
        _log.warning("Regenerar PDF POS entrada %s: %s", entrada_id, exc)
    if not data:
        raise ValueError("PDF POS no disponible.")
    fname = ent.get("disposicion_pdf_nombre") or f"entrada-{entrada_id}.pdf"
    return data, fname


def _regenerar_pdf_pos_entrada(contrato_id: int, entrada_id: int, ent: Optional[dict] = None) -> None:
    """Reconstruye el PDF POS de una entrada existente (primera línea / datos actuales)."""
    if ent is None:
        ent = get_entrada(contrato_id, entrada_id)
    tipo = (ent.get("tipo") or "").strip().lower()
    if tipo not in ("disposicion", "recibo"):
        raise ValueError("Esta entrada no genera PDF POS.")
    items = ent.get("items") or []
    if not items:
        raise ValueError("La entrada no tiene líneas para el PDF.")
    first = items[0]
    oci = first.get("almacen_orden_compra_item") or {}
    material = oci.get("material_descripcion") or first.get("material_descripcion") or "—"
    unidad = oci.get("unidad") or first.get("unidad") or ""
    cantidad = _to_float(first.get("cantidad_recibida") or ent.get("cantidad_recibida_total"))
    oc = ent.get("almacen_orden_compra") or {}
    if ent.get("orden_compra_id") and not oc.get("numero_oc"):
        try:
            oc = get_orden_compra(contrato_id, int(ent["orden_compra_id"]), incluir_entradas=False)
        except Exception:
            oc = {"numero_oc": oc.get("numero_oc") or "—"}
    user_id = int(ent.get("created_by") or ent.get("usuario_id") or 0)
    entrada_pdf = {
        **ent,
        "cantidad_recibida": cantidad,
        "numero_documento": ent.get("numero_documento"),
    }
    _generar_pdf_pos_entrada(
        contrato_id,
        int(entrada_id),
        entrada_pdf,
        oc,
        {"material_descripcion": material, "unidad": unidad, "proveedor_nombre": ent.get("proveedor_nombre")},
        cantidad,
        user_id or 0,
        tipo,
    )


def create_entrada(contrato_id: int, user_id: int, body: dict, remision_data: Optional[bytes] = None,
                   remision_nombre: Optional[str] = None, remision_mime: Optional[str] = None) -> dict:
    """
    Registra una entrada. Nunca bloquea por OC/saldo/foto/proveedor:
    si algo no cuadra, guarda igual con marca «por revisar».
    """
    from almacen_entrada_por_revisar import (
        MOTIVO_OC_CONSUMIDA,
        MOTIVO_PROVEEDOR_MANUAL,
        MOTIVO_SIN_FOTO,
        MOTIVO_SIN_INSUMO,
        MOTIVO_SIN_OC,
        MOTIVO_SUPERA_SALDO,
        MOTIVO_VEHICULO_NUEVO,
        patch_por_revisar,
    )

    sb = _sb()
    lineas = body.get("items") or []
    if not lineas:
        raise ValueError("Debe registrar al menos una línea de entrada.")

    tipo = (body.get("tipo") or "recibo").strip().lower()
    if tipo not in ("disposicion", "recibo"):
        raise ValueError("Tipo de entrada inválido.")

    motivos: List[str] = []
    pk_id = (body.get("pk_id") or "").strip()
    oc_id_raw = body.get("orden_compra_id")
    oc_id = int(oc_id_raw) if oc_id_raw not in (None, "", 0) else None

    alerta_codigo = None
    alerta_detalle = None
    oc: Optional[dict] = None

    if oc_id:
        try:
            oc = get_orden_compra(contrato_id, oc_id, incluir_entradas=False)
        except ValueError:
            oc = None
            oc_id = None
            motivos.append(MOTIVO_SIN_OC)
        if oc and oc.get("estado") == "anulada":
            oc = None
            oc_id = None
            motivos.append(MOTIVO_SIN_OC)
        elif oc:
            items_oc = oc.get("items") or []
            if not any(_oc_item_saldos(it)["tiene_saldo"] for it in items_oc):
                motivos.append(MOTIVO_OC_CONSUMIDA)
                alerta_codigo = ALERTA_OC_CONSUMIDA
                alerta_detalle = ALERTA_SILENCIOSA_MSG[ALERTA_OC_CONSUMIDA]
            body = _enriquecer_entrada_desde_oc(contrato_id, oc, lineas, body)
    else:
        if pk_id:
            flags = _contexto_oc_pk_flags(contrato_id, pk_id)
            if flags.get("oc_consumida"):
                motivos.append(MOTIVO_OC_CONSUMIDA)
                alerta_codigo = ALERTA_OC_CONSUMIDA
                alerta_detalle = ALERTA_SILENCIOSA_MSG[ALERTA_OC_CONSUMIDA]
            else:
                motivos.append(MOTIVO_SIN_OC)
                if flags.get("sin_oc_gestionada"):
                    alerta_codigo = ALERTA_SIN_OC_GESTIONADA
                    alerta_detalle = ALERTA_SILENCIOSA_MSG[ALERTA_SIN_OC_GESTIONADA]
        else:
            motivos.append(MOTIVO_SIN_OC)

    pk_id = _norm_pk_id(body.get("pk_id") or pk_id) or None

    proveedor_id = body.get("proveedor_id")
    proveedor_nombre_texto = (body.get("proveedor_nombre_texto") or body.get("proveedor_nombre") or "").strip() or None
    if proveedor_id is not None and proveedor_id != "":
        try:
            proveedor_id = int(proveedor_id)
        except (TypeError, ValueError):
            proveedor_id = None
        if proveedor_id is not None:
            prov_check = (
                sb.table("almacen_proveedor")
                .select("id")
                .eq("id", proveedor_id)
                .eq("contrato_id", contrato_id)
                .eq("activo", True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not prov_check:
                proveedor_id = None
                motivos.append(MOTIVO_PROVEEDOR_MANUAL)
    else:
        proveedor_id = None
    if proveedor_id is None and proveedor_nombre_texto:
        motivos.append(MOTIVO_PROVEEDOR_MANUAL)
    elif proveedor_id is None and not oc_id:
        motivos.append(MOTIVO_PROVEEDOR_MANUAL)

    insumo_id = int(body["insumo_id"]) if body.get("insumo_id") else None
    if not insumo_id and not oc_id:
        motivos.append(MOTIVO_SIN_INSUMO)

    numero_doc = _resolve_numero_documento_entrada(
        contrato_id,
        tipo,
        body.get("numero_documento"),
    )

    if remision_data and len(remision_data) > REMISION_SOPORTE_MAX_BYTES:
        # Comprimir no es responsabilidad del servidor aquí; se rechaza solo el exceso técnico.
        raise ValueError("El soporte de remisión no puede superar 300 KB.")
    if tipo == "recibo" and not remision_data:
        motivos.append(MOTIVO_SIN_FOTO)

    numero_entrada = _next_consecutivo(contrato_id, "almacen_entrada", "numero_entrada")
    codigo_entrada = _format_codigo_entrada(contrato_id, numero_entrada)
    por_rev = patch_por_revisar(motivos)

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
        "por_revisar": por_rev["por_revisar"],
        "por_revisar_motivos": por_rev["por_revisar_motivos"],
        "proveedor_nombre_texto": proveedor_nombre_texto,
    }
    try:
        ent_ins = sb.table("almacen_entrada").insert(entrada_row).execute().data
    except Exception as exc:
        # Migración pendiente: guardar sin columnas nuevas.
        col = _pgrst_unknown_column(exc)
        if col in ("por_revisar", "por_revisar_motivos", "proveedor_nombre_texto"):
            for k in ("por_revisar", "por_revisar_motivos", "proveedor_nombre_texto"):
                entrada_row.pop(k, None)
            ent_ins = sb.table("almacen_entrada").insert(entrada_row).execute().data
            entrada_row["por_revisar"] = por_rev["por_revisar"]
            entrada_row["por_revisar_motivos"] = por_rev["por_revisar_motivos"]
            entrada_row["proveedor_nombre_texto"] = proveedor_nombre_texto
        else:
            raise
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
    created_items: List[dict] = []

    for ln in lineas:
        qty = _to_float(ln.get("cantidad_recibida"))
        if qty <= 0:
            raise ValueError("cantidad_recibida debe ser mayor a cero.")

        oci_id_raw = ln.get("orden_compra_item_id")
        oci_id = int(oci_id_raw) if oci_id_raw not in (None, "", 0) else None

        if oci_id and oc:
            oci = oc_items_map.get(oci_id)
            if not oci:
                # Línea no válida → guardar como sin OC item, marcar revisión.
                motivos.append(MOTIVO_SIN_OC)
                oci_id = None
            else:
                saldos = _oc_item_saldos(oci)
                pendiente = saldos["saldo_cantidad"]
                if (not saldos["tiene_saldo"]) or qty > pendiente + 0.0001:
                    if MOTIVO_SUPERA_SALDO not in motivos and MOTIVO_OC_CONSUMIDA not in motivos:
                        motivos.append(MOTIVO_SUPERA_SALDO if saldos["tiene_saldo"] else MOTIVO_OC_CONSUMIDA)
                valor_linea = producto(qty, oci.get("valor_unitario"))
                ei_row = {
                    "entrada_id": entrada_id,
                    "orden_compra_item_id": oci_id,
                    "presupuesto_id": oci.get("presupuesto_id"),
                    "cantidad_recibida": qty,
                    "valor_recibido": valor_linea,
                    "lote": (ln.get("lote") or "").strip() or None,
                    "fecha_vencimiento": ln.get("fecha_vencimiento") or None,
                }
                ei_ins = sb.table("almacen_entrada_item").insert(ei_row).execute().data
                ei_id = ei_ins[0]["id"] if ei_ins else None
                if ei_id is not None:
                    created_items.append({
                        **ei_row,
                        "id": ei_id,
                        "material_descripcion": oci.get("material_descripcion"),
                        "unidad": oci.get("unidad"),
                    })

                new_rec = _to_float(oci.get("cantidad_recibida")) + qty
                new_val_rec = float(a_decimal(oci.get("valor_recibido")) + a_decimal(valor_linea))
                sb.table("almacen_orden_compra_item").update({
                    "cantidad_recibida": new_rec,
                    "valor_recibido": new_val_rec,
                }).eq("id", oci_id).execute()
                oci["cantidad_recibida"] = new_rec
                oci["valor_recibido"] = new_val_rec

                if primera_oci is None:
                    primera_cantidad = qty
                    primera_oci = oci

                if oci.get("presupuesto_id"):
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
                continue

        meta_mat = _presupuesto_material_pk_insumo(contrato_id, pk_id, insumo_id) if (pk_id or insumo_id) else {}
        material = meta_mat.get("material_descripcion") or body.get("material_descripcion") or "—"
        unidad = meta_mat.get("unidad") or body.get("unidad") or "UND"
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
        if ei_id is not None:
            created_items.append({
                **ei_row,
                "id": ei_id,
                "material_descripcion": material,
                "unidad": unidad,
            })

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

    # Motivos finales (p. ej. supera saldo detectado en el bucle).
    por_rev_final = patch_por_revisar(motivos)
    if (
        por_rev_final.get("por_revisar") != entrada_row.get("por_revisar")
        or por_rev_final.get("por_revisar_motivos") != entrada_row.get("por_revisar_motivos")
    ):
        try:
            sb.table("almacen_entrada").update({
                "por_revisar": por_rev_final["por_revisar"],
                "por_revisar_motivos": por_rev_final["por_revisar_motivos"],
            }).eq("id", entrada_id).execute()
            entrada_row["por_revisar"] = por_rev_final["por_revisar"]
            entrada_row["por_revisar_motivos"] = por_rev_final["por_revisar_motivos"]
        except Exception as exc:
            if not _pgrst_unknown_column(exc):
                _log.warning("No se pudo actualizar por_revisar entrada %s: %s", entrada_id, exc)

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
        "items": created_items,
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
    if result.get("proveedor_id"):
        pr = (
            sb.table("almacen_proveedor")
            .select("razon_social")
            .eq("id", int(result["proveedor_id"]))
            .limit(1)
            .execute()
            .data
            or []
        )
        result["proveedor_nombre"] = pr[0].get("razon_social") if pr else proveedor_nombre_texto
    elif proveedor_nombre_texto:
        result["proveedor_nombre"] = proveedor_nombre_texto
    placa_val = entrada_row.get("placa")
    transportador_val = entrada_row.get("transportador")
    if placa_val and transportador_val:
        try:
            _, transportador_nuevo = upsert_transportador(
                contrato_id, user_id, placa_val, transportador_val
            )
            if transportador_nuevo:
                result["transportador_registrado"] = True
                if MOTIVO_VEHICULO_NUEVO not in motivos:
                    motivos.append(MOTIVO_VEHICULO_NUEVO)
                    por_rev_v = patch_por_revisar(motivos)
                    try:
                        sb.table("almacen_entrada").update({
                            "por_revisar": por_rev_v["por_revisar"],
                            "por_revisar_motivos": por_rev_v["por_revisar_motivos"],
                        }).eq("id", entrada_id).execute()
                        result["por_revisar"] = por_rev_v["por_revisar"]
                        result["por_revisar_motivos"] = por_rev_v["por_revisar_motivos"]
                    except Exception:
                        pass
        except ValueError:
            # Placa inválida no debe tumbar la entrada ya guardada.
            pass
    _invalidar_graficos_inventario(contrato_id)
    return result


def list_ocs_pendientes_tarjeta(contrato_id: int, *, ver_economicos: bool = False) -> List[dict]:
    """Tarjetas de OC con saldo para el registro tablet (una tarjeta por línea con saldo)."""
    ocs = list_ordenes_compra(contrato_id)
    tarjetas: List[dict] = []
    for oc in ocs:
        if (oc.get("estado") or "") == "anulada":
            continue
        if not oc.get("tiene_saldo_recepcion"):
            continue
        oc_full = get_orden_compra(contrato_id, int(oc["id"]), incluir_entradas=False)
        for it in oc_full.get("items") or []:
            saldos = _oc_item_saldos(it)
            if not saldos.get("tiene_saldo"):
                continue
            sol = it.get("almacen_solicitud_item") or {}
            card = {
                "orden_compra_id": int(oc["id"]),
                "orden_compra_item_id": int(it["id"]),
                "numero_oc": oc.get("numero_oc"),
                "proveedor_id": oc.get("proveedor_id"),
                "proveedor_nombre": oc.get("proveedor_nombre"),
                "insumo_id": it.get("insumo_id") or sol.get("insumo_id"),
                "material_descripcion": it.get("material_descripcion") or sol.get("material_descripcion"),
                "unidad": it.get("unidad") or sol.get("unidad") or "UND",
                "saldo_cantidad": saldos.get("saldo_cantidad"),
                "pk_id": sol.get("pk_id") or oc.get("pk_id"),
                "tramo": sol.get("tramo"),
                "costado": sol.get("costado"),
                "abscisa_inicial": sol.get("abscisa_inicial"),
                "abscisa_final": sol.get("abscisa_final"),
            }
            if ver_economicos:
                card["saldo_valor"] = saldos.get("saldo_valor")
                card["valor_unitario"] = it.get("valor_unitario")
            tarjetas.append(card)
    return tarjetas


def completar_revision_entrada(
    contrato_id: int,
    entrada_id: int,
    user_id: int,
    body: Optional[dict] = None,
) -> dict:
    """
    Completa una entrada «por revisar»: asocia OC, proveedor del directorio y/o quita la marca.
    Todo queda en el log vía la ruta.
    """
    body = body or {}
    sb = _sb()
    ent = get_entrada(contrato_id, entrada_id, incluir_movimientos=False)
    if not ent.get("por_revisar") and not ent.get("alerta_silenciosa_codigo"):
        raise ValueError("Esta entrada no está marcada por revisar.")

    patch: Dict[str, Any] = {}
    if body.get("orden_compra_id") not in (None, "", 0):
        oc_id = int(body["orden_compra_id"])
        oc = get_orden_compra(contrato_id, oc_id, incluir_entradas=False)
        if oc.get("estado") == "anulada":
            raise ValueError("La orden de compra está anulada.")
        patch["orden_compra_id"] = oc_id
        if oc.get("proveedor_id") and not ent.get("proveedor_id"):
            patch["proveedor_id"] = int(oc["proveedor_id"])
        if not ent.get("insumo_id"):
            for it in oc.get("items") or []:
                if it.get("insumo_id"):
                    patch["insumo_id"] = int(it["insumo_id"])
                    break
        patch["alerta_silenciosa_codigo"] = None
        patch["alerta_silenciosa_detalle"] = None

    if body.get("proveedor_id") not in (None, "", 0):
        pid = int(body["proveedor_id"])
        prov = (
            sb.table("almacen_proveedor")
            .select("id, razon_social")
            .eq("id", pid)
            .eq("contrato_id", contrato_id)
            .eq("activo", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not prov:
            raise ValueError("Proveedor no inscrito en el directorio.")
        patch["proveedor_id"] = pid
        patch["proveedor_nombre_texto"] = None

    if body.get("limpiar_marca") or body.get("quitar_marca") or patch:
        # Si el validador confirma, se limpia la marca (tras asociar lo faltante).
        if body.get("limpiar_marca") is not False and (
            body.get("limpiar_marca") or body.get("quitar_marca") or body.get("confirmar")
        ):
            patch["por_revisar"] = False
            patch["por_revisar_motivos"] = None

    if not patch:
        raise ValueError("Indique qué completar (OC, proveedor) o confirme quitar la marca.")

    try:
        sb.table("almacen_entrada").update(patch).eq("id", int(entrada_id)).execute()
    except Exception as exc:
        col = _pgrst_unknown_column(exc)
        if col in ("por_revisar", "por_revisar_motivos", "proveedor_nombre_texto"):
            for k in ("por_revisar", "por_revisar_motivos", "proveedor_nombre_texto"):
                patch.pop(k, None)
            if patch:
                sb.table("almacen_entrada").update(patch).eq("id", int(entrada_id)).execute()
        else:
            raise
    return get_entrada(contrato_id, entrada_id)


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
                val_linea = producto(qty, oci.get("valor_unitario"))
            new_rec = max(0.0, _to_float(oci.get("cantidad_recibida")) - qty)
            new_val = float(max(a_decimal(0), a_decimal(oci.get("valor_recibido")) - a_decimal(val_linea)))
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


def eliminar_entrada(
    contrato_id: int,
    entrada_id: int,
    *,
    ent_prefetched: Optional[dict] = None,
) -> dict:
    """
    Elimina una entrada y revierte inventario / saldo OC.
    El consecutivo solo queda libre si era el máximo (entrada N.º o documento disposición).
    """
    sb = _sb()
    ent = ent_prefetched if (
        ent_prefetched and int(ent_prefetched.get("id") or 0) == int(entrada_id)
    ) else get_entrada(contrato_id, entrada_id)

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
            from almacen_eliminar_reglas import MOTIVO_ENTRADA_SALIDAS
            raise ValueError(MOTIVO_ENTRADA_SALIDAS)

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

    # Borrado de blobs en background: Azure puede tardar varios segundos y no
    # afecta la consistencia de saldos (las rutas ya no se referencian en BD).
    blob_paths = [
        (ent.get("remision_blob_path") or "").strip(),
        (ent.get("disposicion_pdf_blob_path") or "").strip(),
    ]
    blob_paths = [p for p in blob_paths if p]

    def _blobs_bg() -> None:
        for p in blob_paths:
            try:
                delete_blob_private(p)
            except Exception as exc:
                _log.warning("No se pudo borrar blob entrada %s: %s", entrada_id, exc)

    if blob_paths:
        threading.Thread(target=_blobs_bg, daemon=True).start()

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
        val_total = producto(cant, vu)
        val_rec = float(a_decimal(i.get("valor_recibido")))
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
        if not r.get("proveedor_nombre") and r.get("proveedor_nombre_texto"):
            r["proveedor_nombre"] = r.get("proveedor_nombre_texto")
        if r.get("created_by"):
            names = _map_usuario_nombres(sb, [r.get("created_by")])
            r["usuario_nombre"] = names.get(int(r["created_by"]))
        _asegurar_codigo_entrada(contrato_id, r)
    return _enriquecer_entradas_listado(sb, rows)


def get_entrada(
    contrato_id: int,
    entrada_id: int,
    *,
    incluir_movimientos: bool = True,
) -> dict:
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
    oci_ids = [
        int(it["orden_compra_item_id"])
        for it in items
        if it.get("orden_compra_item_id") is not None
    ]
    oci_map: Dict[int, dict] = {}
    if oci_ids:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("id, material_descripcion, unidad, cantidad")
            .in_("id", oci_ids)
            .execute()
            .data
            or []
        )
        oci_map = {int(x["id"]): x for x in oci_rows}
    for it in items:
        oid = it.get("orden_compra_item_id")
        it["almacen_orden_compra_item"] = (
            oci_map.get(int(oid)) if oid is not None else None
        ) or {}
        oci = it["almacen_orden_compra_item"]
        if not it.get("material_descripcion"):
            it["material_descripcion"] = oci.get("material_descripcion")
        if not it.get("unidad"):
            it["unidad"] = oci.get("unidad")
    ei_ids = [int(it["id"]) for it in items if it.get("id") is not None]
    if incluir_movimientos:
        despacho_map = _despacho_neto_por_entrada_item(sb, ei_ids) if ei_ids else {}
        mov_map = _movimientos_salida_devolucion_por_entrada_item(sb, ei_ids) if ei_ids else {}
    else:
        despacho_map, mov_map = {}, {}
    for it in items:
        ei_id = int(it["id"]) if it.get("id") is not None else None
        recibida = _to_float(it.get("cantidad_recibida"))
        despachada = despacho_map.get(ei_id, 0.0) if ei_id is not None else 0.0
        saldo = _disponible_entrada_item(recibida, despachada) if incluir_movimientos else recibida
        pct = _porcentaje_saldo_disponible(recibida, saldo) if incluir_movimientos else None
        it["cantidad_despachada"] = despachada
        it["saldo_disponible"] = saldo
        it["porcentaje_saldo_disponible"] = pct
        it["alerta_saldo"] = (
            _alerta_saldo_entrada(pct, recibida) if incluir_movimientos else "normal"
        )
        it["salidas"] = mov_map.get(ei_id, []) if ei_id is not None else []
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
    if not ent.get("proveedor_nombre") and ent.get("proveedor_nombre_texto"):
        ent["proveedor_nombre"] = ent.get("proveedor_nombre_texto")
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
        from almacen_inventario_arbol import invalidar_cache_inventario_arbol
        invalidar_cache_inventario_graficos(contrato_id)
        invalidar_cache_inventario_arbol(contrato_id)
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


def _movimientos_salida_devolucion_por_entrada_item(
    sb,
    entrada_item_ids: List[int],
) -> Dict[int, List[dict]]:
    """
    Desglose de salidas con devoluciones anidadas por línea de entrada.
    No altera el cálculo de saldo; solo expone el historial oculto detrás del neto.
    """
    ids = sorted({int(x) for x in entrada_item_ids if x})
    if not ids:
        return {}
    sal_rows = (
        sb.table("almacen_salida")
        .select(
            "id, entrada_item_id, numero_salida, codigo, cantidad_salida, "
            "fecha_hora_salida, created_at, pk_id"
        )
        .in_("entrada_item_id", ids)
        .execute()
        .data
        or []
    )
    sal_rows = sorted(
        sal_rows,
        key=lambda r: (r.get("created_at") or r.get("fecha_hora_salida") or "", int(r.get("id") or 0)),
    )
    salida_ids = [int(s["id"]) for s in sal_rows if s.get("id") is not None]
    dev_by_salida: Dict[int, List[dict]] = {}
    if salida_ids:
        dev_rows = (
            sb.table("almacen_devolucion")
            .select(
                "id, salida_id, numero_devolucion, codigo, cantidad, "
                "fecha_hora_devolucion, created_at"
            )
            .in_("salida_id", salida_ids)
            .execute()
            .data
            or []
        )
        dev_rows = sorted(
            dev_rows,
            key=lambda r: (
                r.get("created_at") or r.get("fecha_hora_devolucion") or "",
                int(r.get("id") or 0),
            ),
        )
        for d in dev_rows:
            sid = int(d["salida_id"])
            dev_by_salida.setdefault(sid, []).append({
                "id": int(d["id"]),
                "numero_devolucion": d.get("numero_devolucion"),
                "codigo": d.get("codigo"),
                "cantidad": _to_float(d.get("cantidad")),
                "fecha_hora_devolucion": d.get("fecha_hora_devolucion"),
            })

    out: Dict[int, List[dict]] = {eid: [] for eid in ids}
    for s in sal_rows:
        eid = int(s["entrada_item_id"])
        sid = int(s["id"])
        qty = _to_float(s.get("cantidad_salida"))
        devs = dev_by_salida.get(sid, [])
        devuelta = round(sum(_to_float(d.get("cantidad")) for d in devs), 4)
        neto = max(0.0, round(qty - devuelta, 4))
        out.setdefault(eid, []).append({
            "id": sid,
            "numero_salida": s.get("numero_salida"),
            "codigo": s.get("codigo"),
            "cantidad_salida": qty,
            "cantidad_devuelta": devuelta,
            "cantidad_neta": neto,
            "fecha_hora_salida": s.get("fecha_hora_salida"),
            "pk_id": s.get("pk_id"),
            "devoluciones": devs,
        })
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


def _enriquecer_entradas_listado(sb, rows: List[dict]) -> List[dict]:
    """
    Expande el listado a una fila por línea de entrada (insumo) con consumo/saldo.

    Antes: 1 fila por cabecera con cantidad_recibida_total agregada.
    Ahora: 1 fila por almacen_entrada_item; conserva campos de cabecera (id, OC, PDF, etc.)
    para abrir detalle / eliminar / PDF. React key sugerida: entrada_item_id.
    """
    if not rows:
        return []
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
    oci_map: Dict[int, dict] = {}
    if oci_ids:
        oci_rows = (
            sb.table("almacen_orden_compra_item")
            .select("id, unidad, material_descripcion")
            .in_("id", oci_ids)
            .execute()
            .data
            or []
        )
        for o in oci_rows:
            oci_map[int(o["id"])] = o

    ei_ids = [int(ei["id"]) for ei in ei_rows if ei.get("id") is not None]
    despacho_map = _despacho_neto_por_entrada_item(sb, ei_ids) if ei_ids else {}

    out: List[dict] = []
    for r in rows:
        eid = int(r["id"])
        items = by_entrada.get(eid, [])
        saldo_doc = _saldo_oc_pendiente_tras_entrada(sb, eid, r.get("created_at"), items)
        saldo_oc_cant = saldo_doc.get("saldo_cantidad") if saldo_doc else None
        saldo_oc_und = saldo_doc.get("saldo_unidad") if saldo_doc else None

        if not items:
            # Entrada sin líneas (caso raro): una fila cabecera sin consumo.
            out.append({
                **r,
                "entrada_item_id": None,
                "material_descripcion": r.get("insumo_label") or None,
                "cantidad_recibida": 0.0,
                "cantidad_recibida_total": 0.0,
                "cantidad_recibida_unidad": None,
                "unidad": None,
                "cantidad_despachada": 0.0,
                "consumido": 0.0,
                "saldo_disponible": 0.0,
                "saldo_por_consumir": 0.0,
                "porcentaje_saldo_disponible": 0.0,
                "alerta_saldo": "normal",
                "saldo_oc_pendiente_despues": saldo_oc_cant,
                "saldo_oc_pendiente_despues_unidad": saldo_oc_und,
            })
            continue

        for ei in items:
            ei_id = int(ei["id"])
            oci_id = int(ei["orden_compra_item_id"]) if ei.get("orden_compra_item_id") else None
            oci = oci_map.get(oci_id, {}) if oci_id else {}
            und = (oci.get("unidad") or "").strip() or None
            recibida = _to_float(ei.get("cantidad_recibida"))
            consumido = despacho_map.get(ei_id, 0.0)
            saldo = _disponible_entrada_item(recibida, consumido)
            pct = _porcentaje_saldo_disponible(recibida, saldo)
            alerta = _alerta_saldo_entrada(pct, recibida)
            out.append({
                **r,
                "entrada_item_id": ei_id,
                "material_descripcion": oci.get("material_descripcion") or r.get("insumo_label"),
                "cantidad_recibida": recibida,
                "cantidad_recibida_total": recibida,
                "cantidad_recibida_unidad": und,
                "unidad": und,
                "cantidad_despachada": consumido,
                "consumido": consumido,
                "saldo_disponible": saldo,
                "saldo_por_consumir": saldo,
                "porcentaje_saldo_disponible": pct,
                "alerta_saldo": alerta,
                "saldo_oc_pendiente_despues": saldo_oc_cant,
                "saldo_oc_pendiente_despues_unidad": saldo_oc_und or und,
            })
    return out


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
    usuarios_principal = (
        sb.table("usuarios")
        .select("id")
        .eq("contrato_id", contrato_id)
        .eq("activo", True)
        .execute()
        .data
        or []
    )
    ids_principal = [int(u["id"]) for u in usuarios_principal]
    todos_ids = sorted(set(ids_uc + ids_principal))
    if not todos_ids:
        return []

    # Resolver roles permitidos por nombre (tolera renombres) + IDs canónicos 3/5.
    roles_all = sb.table("roles").select("id, nombre").execute().data or []
    roles_map: Dict[int, str] = {}
    allowed_rol_ids: set = set()
    for rr in roles_all:
        try:
            rid = int(rr["id"])
        except (TypeError, ValueError, KeyError):
            continue
        nom = rr.get("nombre") or ""
        roles_map[rid] = nom
        if es_rol_receptor_obra(nom, rid):
            allowed_rol_ids.add(rid)
    if not allowed_rol_ids:
        allowed_rol_ids = {3, 5}

    rows: List[dict] = []
    # PostgREST limita el tamaño de .in_(); consultar por lotes.
    chunk = 120
    for i in range(0, len(todos_ids), chunk):
        part = todos_ids[i:i + chunk]
        batch = (
            sb.table("usuarios")
            .select("id, nombre, apellidos, email, rol_id, firma_imagen_url, activo, estado")
            .in_("id", part)
            .execute()
            .data
            or []
        )
        rows.extend(batch)

    q_norm = _norm_pk_id(q).lower()
    out: List[dict] = []
    for u in rows:
        if u.get("activo") is False:
            continue
        estado = str(u.get("estado") or "").strip().lower()
        if estado in ("rechazado", "inactivo", "bloqueado"):
            continue
        try:
            rid = int(u["rol_id"]) if u.get("rol_id") not in (None, "") else None
        except (TypeError, ValueError):
            rid = None
        rol_nom = roles_map.get(rid or 0, "")
        if rid is not None and rid in allowed_rol_ids:
            pass
        elif not es_rol_receptor_obra(rol_nom, rid):
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
    out.sort(key=lambda x: (x.get("label") or "").lower())
    return out[: max(1, min(int(limit or 30), 100))]


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
    if not es_rol_receptor_obra(rol_nom, u.get("rol_id")):
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
    sid = int(salida_id)
    qty = _to_float(salida_row.get("cantidad_salida"))
    if salida_row.get("cantidad_devuelta") is not None:
        ya_dev = _to_float(salida_row.get("cantidad_devuelta"))
    else:
        ya_dev = _to_float(_sum_devoluciones_por_salida(sb, [sid]).get(sid, 0.0))
    if salida_row.get("cantidad_neta") is not None:
        neto = _to_float(salida_row.get("cantidad_neta"))
    else:
        neto = max(0.0, qty - ya_dev)
    salida_pdf = {
        **salida_row,
        "cantidad_devuelta": ya_dev,
        "cantidad_neta": neto,
    }
    pdf_bytes = generar_pdf_salida_pos(
        contrato_pdf,
        salida_pdf,
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


def _normalize_salida_items(body: dict) -> List[dict]:
    """Acepta items[] o el par legado entrada_item_id + cantidad_salida."""
    raw = body.get("items")
    if raw is not None:
        if not isinstance(raw, list) or not raw:
            raise ValueError("Indique al menos una línea de salida.")
        out = []
        seen = set()
        for i, it in enumerate(raw, start=1):
            if not isinstance(it, dict):
                raise ValueError(f"Línea #{i}: formato inválido.")
            eid = it.get("entrada_item_id")
            if not eid:
                raise ValueError(f"Línea #{i}: seleccione la entrada de material.")
            eid = int(eid)
            if eid in seen:
                raise ValueError(
                    f"Línea #{i}: la misma entrada no puede repetirse en el mismo registro. "
                    "Combine las cantidades en una sola fila."
                )
            seen.add(eid)
            qty = _to_float(it.get("cantidad_salida"))
            if qty <= 0:
                raise ValueError(f"Línea #{i}: indique una cantidad de salida mayor a cero.")
            out.append({"entrada_item_id": eid, "cantidad_salida": qty})
        return out

    entrada_item_id = body.get("entrada_item_id")
    if not entrada_item_id:
        raise ValueError("Seleccione la entrada de material a despachar.")
    qty = _to_float(body.get("cantidad_salida"))
    if qty <= 0:
        raise ValueError("Indique una cantidad de salida mayor a cero.")
    return [{"entrada_item_id": int(entrada_item_id), "cantidad_salida": qty}]


def create_salida(contrato_id: int, user_id: int, body: dict) -> dict:
    """
    Registra una o varias salidas en un mismo envío.
    Compat: entrada_item_id + cantidad_salida.
    Multi: items=[{entrada_item_id, cantidad_salida}, ...].
    """
    items = _normalize_salida_items(body)
    created: List[dict] = []
    for it in items:
        single = dict(body)
        single.pop("items", None)
        single["entrada_item_id"] = it["entrada_item_id"]
        single["cantidad_salida"] = it["cantidad_salida"]
        created.append(_create_salida_single(contrato_id, user_id, single))

    if len(created) == 1:
        return created[0]

    primaria = dict(created[0])
    primaria["salidas"] = created
    primaria["salidas_creadas"] = len(created)
    primaria["ids"] = [int(r["id"]) for r in created if r.get("id")]
    primaria["numeros_salida"] = [r.get("numero_salida") for r in created]
    primaria["multi_linea"] = True
    return primaria


def _create_salida_single(contrato_id: int, user_id: int, body: dict) -> dict:
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

    # Devoluciones por salida → neto visible en grilla (misma base que despacho neto por línea).
    salida_ids = [int(r["id"]) for r in rows if r.get("id") is not None]
    dev_map = _sum_devoluciones_por_salida(sb, salida_ids) if salida_ids else {}
    for r in rows:
        sid = int(r["id"]) if r.get("id") is not None else None
        qty = _to_float(r.get("cantidad_salida"))
        devuelta = _to_float(dev_map.get(sid, 0.0)) if sid is not None else 0.0
        r["cantidad_devuelta"] = round(devuelta, 4)
        r["cantidad_neta"] = max(0.0, round(qty - devuelta, 4))
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
    """Descarga el recibo PDF. Regenera si falta o si el blob es formato legacy (alto fijo)."""
    from almacen_pos_pdf_common import needs_pos_regen

    sal = get_salida(contrato_id, salida_id)
    path = (sal.get("salida_pdf_blob_path") or "").strip()
    data = None
    if path:
        try:
            data, _mime = download_soporte(path)
        except Exception as exc:
            _log.warning("Descarga PDF salida %s: %s", salida_id, exc)
            data = None
        if data and not needs_pos_regen(data):
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


def update_salida_cantidad(contrato_id: int, salida_id: int, cantidad_salida: float) -> dict:
    """
    Corrige la cantidad de una salida ya registrada.
    Recalcula saldos derivados vía lectura (entradas/salidas enriquecidas usan despacho neto).
    Validaciones: cantidad > 0, >= ya devuelto, <= disponible de la línea + cantidad actual.
    """
    sb = _sb()
    nueva = _to_float(cantidad_salida)
    if nueva <= 0:
        raise ValueError("Indique una cantidad de salida mayor a cero.")

    rows = (
        sb.table("almacen_salida")
        .select("*")
        .eq("id", int(salida_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Salida no encontrada.")
    sal = rows[0]
    antigua = _to_float(sal.get("cantidad_salida"))
    if abs(nueva - antigua) < 1e-9:
        enriched = get_salida(contrato_id, int(salida_id))
        return {
            **enriched,
            "cantidad_salida_anterior": antigua,
            "cantidad_salida": antigua,
            "sin_cambios": True,
        }

    ya_devuelta = _to_float(
        _sum_devoluciones_por_salida(sb, [int(salida_id)]).get(int(salida_id), 0.0)
    )
    if nueva + 1e-9 < ya_devuelta:
        raise ValueError(
            f"La cantidad ({nueva}) no puede ser menor a lo ya devuelto "
            f"({ya_devuelta}) contra esta salida."
        )

    ei_id = int(sal["entrada_item_id"])
    recibida = _cantidad_recibida_entrada_item(sb, ei_id)
    despacho_neto = _despacho_neto_por_entrada_item(sb, [ei_id]).get(ei_id, 0.0)
    disponible = _disponible_entrada_item(recibida, despacho_neto)
    # Al reemplazar esta cantidad se libera `antigua` y se consume `nueva`.
    max_permitido = round(disponible + antigua, 4)
    if nueva > max_permitido + 1e-9:
        raise ValueError(
            f"La cantidad ({nueva}) supera lo disponible en la línea de entrada "
            f"asociada. Máximo permitido: {max_permitido}."
        )

    delta = round(nueva - antigua, 4)
    sb.table("almacen_salida").update({
        "cantidad_salida": nueva,
    }).eq("id", int(salida_id)).eq("contrato_id", int(contrato_id)).execute()

    movs = (
        sb.table("almacen_movimiento")
        .select("id")
        .eq("referencia_tipo", "salida")
        .eq("referencia_id", int(salida_id))
        .execute()
        .data
        or []
    )
    for m in movs:
        sb.table("almacen_movimiento").update({"cantidad": nueva}).eq("id", int(m["id"])).execute()

    if abs(delta) > 1e-9:
        ei_rows = (
            sb.table("almacen_entrada_item")
            .select("*")
            .eq("id", ei_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if ei_rows:
            ei = ei_rows[0]
            material = "—"
            unidad = "UND"
            presupuesto_id = ei.get("presupuesto_id")
            oci_id = ei.get("orden_compra_item_id")
            if oci_id:
                oci = (
                    sb.table("almacen_orden_compra_item")
                    .select("material_descripcion, unidad, presupuesto_id")
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
            if presupuesto_id:
                # create_salida resta qty del stock; al subir cantidad restamos el delta.
                _upsert_inventario(
                    contrato_id, int(presupuesto_id), material, unidad, -delta, 0
                )

    enriched = get_salida(contrato_id, int(salida_id))

    def _pdf_regen() -> None:
        try:
            pdf_ctx = _pdf_ctx_for_salida(sb, contrato_id, {**sal, **enriched})
            _generar_pdf_salida(
                contrato_id,
                int(salida_id),
                {**sal, "id": int(salida_id), "cantidad_salida": nueva},
                pdf_ctx,
            )
        except Exception as exc:
            _log.warning("PDF salida %s no regenerado tras editar cantidad: %s", salida_id, exc)

    threading.Thread(target=_pdf_regen, daemon=True).start()
    _invalidar_graficos_inventario(contrato_id)

    return {
        **enriched,
        "cantidad_salida_anterior": antigua,
        "cantidad_salida": nueva,
        "cantidad_devuelta": round(ya_devuelta, 4),
        "cantidad_neta": max(0.0, round(nueva - ya_devuelta, 4)),
        "sin_cambios": False,
        "pdf_generando": True,
    }


def eliminar_salida(
    contrato_id: int,
    salida_id: int,
    *,
    sal_prefetched: Optional[dict] = None,
) -> dict:
    sb = _sb()
    sal = sal_prefetched if (
        sal_prefetched and int(sal_prefetched.get("id") or 0) == int(salida_id)
    ) else get_salida(contrato_id, salida_id)
    ei_id = int(sal["entrada_item_id"])
    qty = _to_float(sal.get("cantidad_salida"))

    # Si el caller ya trajo cantidad_devuelta enriquecida, evita un round-trip.
    if sal.get("cantidad_devuelta") is not None:
        ya_dev = _to_float(sal.get("cantidad_devuelta"))
    else:
        ya_dev = _to_float(_sum_devoluciones_por_salida(sb, [int(salida_id)]).get(int(salida_id), 0.0))
    if ya_dev > 1e-9:
        raise ValueError(
            "No se puede eliminar la salida porque tiene devoluciones registradas. "
            "Elimine primero las devoluciones (clic en la cantidad Devuelto o en "
            "Entradas → Devoluciones) y luego reintente."
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
        def _blob_bg() -> None:
            try:
                delete_blob_private(path)
            except Exception as exc:
                _log.warning("No se pudo borrar PDF salida %s: %s", salida_id, exc)

        threading.Thread(target=_blob_bg, daemon=True).start()

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


def get_devolucion(contrato_id: int, devolucion_id: int) -> dict:
    """Carga una devolución por id (sin listar todo el contrato)."""
    sb = _sb()
    raw = (
        sb.table("almacen_devolucion")
        .select("*")
        .eq("id", int(devolucion_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not raw:
        raise ValueError("Devolución no encontrada.")
    r = raw[0]
    user_ids = []
    if r.get("receptor_usuario_id"):
        user_ids.append(int(r["receptor_usuario_id"]))
    if r.get("created_by"):
        user_ids.append(int(r["created_by"]))
    names = _map_usuario_nombres(sb, user_ids) if user_ids else {}
    r["receptor_nombre"] = names.get(int(r["receptor_usuario_id"])) if r.get("receptor_usuario_id") else None
    r["registrado_por_nombre"] = names.get(int(r["created_by"])) if r.get("created_by") else None

    sid = int(r["salida_id"]) if r.get("salida_id") else None
    if sid:
        sal_rows = (
            sb.table("almacen_salida")
            .select("id, numero_salida, codigo, cantidad_salida, entrada_item_id")
            .eq("id", sid)
            .limit(1)
            .execute()
            .data
            or []
        )
        if sal_rows:
            enriched = _enrich_salidas_rows(sb, contrato_id, [{
                **sal_rows[0],
                "receptor_usuario_id": None,
                "created_by": None,
                "salida_pdf_blob_path": None,
            }])
            sal = enriched[0] if enriched else sal_rows[0]
            r["numero_salida"] = sal.get("numero_salida")
            r["codigo_salida"] = sal.get("codigo")
            r["material_descripcion"] = sal.get("material_descripcion")
            r["unidad"] = sal.get("unidad")
            r["numero_oc"] = sal.get("numero_oc")
    return r


def eliminar_devolucion(
    contrato_id: int,
    devolucion_id: int,
    *,
    dev_prefetched: Optional[dict] = None,
) -> dict:
    """
    Elimina una devolución y revierte su efecto en inventario / saldos.
    Tras esto, la salida asociada puede eliminarse con el flujo normal.
    La regeneración del PDF de la salida se hace en segundo plano (mismo patrón
    que create_salida / update_salida_cantidad) para no bloquear la respuesta.
    """
    sb = _sb()
    if dev_prefetched and int(dev_prefetched.get("id") or 0) == int(devolucion_id):
        dev = dev_prefetched
    else:
        rows = (
            sb.table("almacen_devolucion")
            .select("*")
            .eq("id", int(devolucion_id))
            .eq("contrato_id", int(contrato_id))
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise ValueError("Devolución no encontrada.")
        dev = rows[0]
    qty = _to_float(dev.get("cantidad"))
    salida_id = int(dev["salida_id"]) if dev.get("salida_id") is not None else None
    entrada_item_id = int(dev["entrada_item_id"]) if dev.get("entrada_item_id") is not None else None

    material = "—"
    unidad = "UND"
    presupuesto_id = None
    if entrada_item_id is not None:
        ei_rows = (
            sb.table("almacen_entrada_item")
            .select("*")
            .eq("id", entrada_item_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if ei_rows:
            ei = ei_rows[0]
            presupuesto_id = ei.get("presupuesto_id")
            oci_id = ei.get("orden_compra_item_id")
            if oci_id:
                oci = (
                    sb.table("almacen_orden_compra_item")
                    .select("material_descripcion, unidad, presupuesto_id")
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

    # Invertir la reactivación de stock hecha al crear la devolución (+qty → −qty).
    if presupuesto_id is not None and qty > 0:
        _upsert_inventario(contrato_id, int(presupuesto_id), material, unidad, -qty, 0)

    sb.table("almacen_movimiento").delete().eq(
        "referencia_tipo", "devolucion"
    ).eq("referencia_id", int(devolucion_id)).execute()

    numero = int(dev.get("numero_devolucion") or 0)
    max_num = _max_consecutivo(contrato_id, "almacen_devolucion", "numero_devolucion")
    sb.table("almacen_devolucion").delete().eq(
        "id", int(devolucion_id)
    ).eq("contrato_id", int(contrato_id)).execute()

    # PDF en background: firmas HTTP + xhtml2pdf + upload no deben bloquear el DELETE.
    if salida_id is not None:
        def _pdf_regen() -> None:
            try:
                sal = get_salida(contrato_id, salida_id)
                _generar_pdf_salida(
                    contrato_id,
                    salida_id,
                    sal,
                    _pdf_ctx_for_salida(_sb(), contrato_id, sal),
                )
            except Exception as exc:
                _log.warning(
                    "PDF salida %s no regenerado tras eliminar devolución %s: %s",
                    salida_id,
                    devolucion_id,
                    exc,
                )

        threading.Thread(target=_pdf_regen, daemon=True).start()

    _invalidar_graficos_inventario(contrato_id)
    return {
        "ok": True,
        "id": int(devolucion_id),
        "numero_devolucion": numero,
        "salida_id": salida_id,
        "entrada_item_id": entrada_item_id,
        "cantidad": qty,
        "consecutivo_liberado": numero > 0 and numero == max_num,
        "pdf_generando": bool(salida_id),
    }

