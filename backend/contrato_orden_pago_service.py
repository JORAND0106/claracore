"""
Órdenes de pago — licenciamiento ClaraCore.

Metadatos en Supabase; PDF en claracore-privado. Acceso API: solo Desarrollador.
"""

from __future__ import annotations

import calendar
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_contrato_orden_pago,
    path_contrato_orden_pago_factura,
    upload_blob_private,
)
from contrato_documentos_service import (
    MIME_PDF,
    _iva_etiqueta_porcentaje,
    assert_contrato_exists,
    get_licenciatario,
    iva_tasa_licencia_contrato,
)

_log = logging.getLogger("claracore.contrato_orden_pago")

ORDEN_ESTADOS = frozenset({"emitida", "aprobada", "facturada", "anulada"})
ORDEN_ESTADOS_ACTIVOS = frozenset({"emitida", "aprobada", "facturada"})
ORDEN_ESTADOS_CARTERA = frozenset({"emitida", "aprobada"})
LOGO_RECEPTOR_OPTS = frozenset({"contratista", "interventoria", "ninguno"})
TIPO_PERIODO_OPTS = frozenset({"mensual", "quincenal"})

FACTURA_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_FACTURA_BYTES = 20 * 1024 * 1024
MIME_EXT = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

COBRO_CONFIG_FIELDS = (
    "plan_descripcion",
    "tipo_periodo",
    "dia_vencimiento",
    "logo_receptor",
    "autorizo_usuario_id",
    "autorizo_nombre",
    "autorizo_cargo",
    "correos_notificacion",
    "email_mensaje_adicional",
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_CORREOS_NOTIFICACION = 20


BOGOTA_TZ = ZoneInfo("America/Bogota")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bogota_today() -> date:
    """Fecha calendario actual en Colombia (America/Bogota), no UTC del servidor."""
    return datetime.now(BOGOTA_TZ).date()


def _en_ventana_alerta_generacion_mensual(hoy: Optional[date] = None) -> bool:
    """True en los primeros 7 días calendario del mes (zona Bogotá)."""
    d = hoy or _bogota_today()
    return 1 <= d.day <= 7


def empresa_orden_pago_config() -> dict:
    """Emisor ClaraCore para orden de pago (env + defaults)."""
    from contrato_documentos_pdf import _nit_claracore_display

    nit_raw = (os.getenv("CLARACORE_EMPRESA_NIT") or "").strip()
    return {
        "razon_social": (
            os.getenv("CLARACORE_EMPRESA_RAZON_SOCIAL") or "CLARACORE SOLUTIONS S.A.S."
        ).strip(),
        "nit": _nit_claracore_display(nit_raw or None),
        "email": (os.getenv("CLARACORE_EMPRESA_EMAIL") or "ajaimes@claracore.co").strip(),
        "ciudad": (os.getenv("CLARACORE_EMPRESA_CIUDAD") or "Bogotá D.C.").strip(),
        "direccion": (os.getenv("CLARACORE_EMPRESA_DIRECCION") or "").strip(),
        "telefono": (os.getenv("CLARACORE_EMPRESA_TELEFONO") or "").strip(),
        "elaboro_nombre": (
            os.getenv("CLARACORE_EMPRESA_ELABORO_NOMBRE") or "Jorge Andrés Jaimes Arenas"
        ).strip(),
        "elaboro_cargo": (
            os.getenv("CLARACORE_EMPRESA_ELABORO_CARGO") or "Representante Legal"
        ).strip(),
    }


def get_contrato_orden_pago_row(sb, contrato_id: int) -> dict:
    rows = (
        sb.table("contratos")
        .select(
            "id, numero, objeto, contratista, nit, iva, "
            "logo_contratista, logo_interventoria"
        )
        .eq("id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ValueError(f"Contrato {contrato_id} no encontrado")
    return rows[0]


def default_plan_descripcion(contrato_row: dict, lic: Optional[dict]) -> str:
    """Texto por defecto del plan / línea de cobro (UI y PDF)."""
    numero = (contrato_row.get("numero") or "").strip()
    obra = ""
    if lic:
        obra = (lic.get("identificacion_obra") or "").strip()
    ref = obra or numero
    modulos = (
        "control de obra, dashboard, presupuesto, programación y topografía"
    )
    base = (
        f"Licencia de uso ClaraCore — incluye módulos de {modulos}"
    )
    if ref:
        return f"{base} — contrato/obra {ref}"
    return base


def descripcion_cobro_pdf(
    contrato_row: dict,
    lic: Optional[dict],
    *,
    override: Optional[str] = None,
) -> str:
    """Descripción en tabla de cobro del PDF (prioriza override explícito)."""
    custom = (override or "").strip()
    if custom:
        return custom
    return default_plan_descripcion(contrato_row, lic)


def get_cobro_config(sb, contrato_id: int) -> dict:
    rows = (
        sb.table("contrato_licencia_cobro_config")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    contrato = get_contrato_orden_pago_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id)
    if rows:
        cfg = dict(rows[0])
    else:
        cfg = {
            "contrato_id": int(contrato_id),
            "plan_descripcion": None,
            "tipo_periodo": "mensual",
            "dia_vencimiento": 7,
            "logo_receptor": "contratista",
            "autorizo_usuario_id": None,
            "autorizo_nombre": None,
            "autorizo_cargo": None,
            "correos_notificacion": [],
            "email_mensaje_adicional": None,
        }
    if not (cfg.get("plan_descripcion") or "").strip():
        cfg["plan_descripcion"] = default_plan_descripcion(contrato, lic)
    return cfg


def _normalize_correos_notificacion(raw) -> List[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("correos_notificacion debe ser una lista de correos")
    seen: set[str] = set()
    out: List[str] = []
    for item in raw:
        email = (str(item) if item is not None else "").strip().lower()
        if not email:
            continue
        if not _EMAIL_RE.match(email):
            raise ValueError(f"Correo inválido: {item}")
        if email in seen:
            continue
        seen.add(email)
        out.append(email)
    if len(out) > _MAX_CORREOS_NOTIFICACION:
        raise ValueError(f"Máximo {_MAX_CORREOS_NOTIFICACION} correos de notificación")
    return out


def _resolve_autorizo_fields(sb, data: dict) -> dict:
    uid_raw = data.get("autorizo_usuario_id")
    if uid_raw is None or uid_raw == "":
        return {
            "autorizo_usuario_id": None,
            "autorizo_nombre": (data.get("autorizo_nombre") or "").strip() or None,
            "autorizo_cargo": (data.get("autorizo_cargo") or "").strip() or None,
        }
    try:
        uid = int(uid_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("autorizo_usuario_id inválido") from exc
    rows = (
        sb.table("usuarios")
        .select("id, nombre, apellidos, cargo_id")
        .eq("id", uid)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise ValueError("Usuario autorizador no encontrado")
    u = rows[0]
    cargo_nombre = None
    cargo_id = u.get("cargo_id")
    if cargo_id:
        cargo_rows = (
            sb.table("cargos").select("nombre").eq("id", cargo_id).limit(1).execute().data
        )
        if cargo_rows:
            cargo_nombre = (cargo_rows[0].get("nombre") or "").strip() or None
    nombre = f"{u.get('nombre') or ''} {u.get('apellidos') or ''}".strip() or None
    return {
        "autorizo_usuario_id": uid,
        "autorizo_nombre": nombre,
        "autorizo_cargo": cargo_nombre,
    }


def _validate_cobro_config_payload(data: dict, sb=None) -> dict:
    logo = (data.get("logo_receptor") or "contratista").strip().lower()
    if logo not in LOGO_RECEPTOR_OPTS:
        raise ValueError("logo_receptor inválido")
    tipo = (data.get("tipo_periodo") or "mensual").strip().lower()
    if tipo not in TIPO_PERIODO_OPTS:
        raise ValueError("tipo_periodo inválido")
    try:
        dia = int(data.get("dia_vencimiento") if data.get("dia_vencimiento") is not None else 7)
    except (TypeError, ValueError) as exc:
        raise ValueError("dia_vencimiento debe ser entero entre 1 y 28") from exc
    if dia < 1 or dia > 28:
        raise ValueError("dia_vencimiento debe estar entre 1 y 28")
    plan = (data.get("plan_descripcion") or "").strip() or None
    correos = _normalize_correos_notificacion(data.get("correos_notificacion"))
    mensaje_extra = (data.get("email_mensaje_adicional") or "").strip() or None
    if mensaje_extra and len(mensaje_extra) > 2000:
        raise ValueError("email_mensaje_adicional no puede superar 2000 caracteres")
    base = {
        "plan_descripcion": plan,
        "tipo_periodo": tipo,
        "dia_vencimiento": dia,
        "logo_receptor": logo,
        "correos_notificacion": correos,
        "email_mensaje_adicional": mensaje_extra,
    }
    if sb is not None:
        base.update(_resolve_autorizo_fields(sb, data))
    else:
        uid_raw = data.get("autorizo_usuario_id")
        uid = None
        if uid_raw is not None and uid_raw != "":
            try:
                uid = int(uid_raw)
            except (TypeError, ValueError) as exc:
                raise ValueError("autorizo_usuario_id inválido") from exc
        base.update(
            {
                "autorizo_usuario_id": uid,
                "autorizo_nombre": (data.get("autorizo_nombre") or "").strip() or None,
                "autorizo_cargo": (data.get("autorizo_cargo") or "").strip() or None,
            }
        )
    return base


def upsert_cobro_config(sb, contrato_id: int, data: dict, user_id: int) -> dict:
    assert_contrato_exists(sb, contrato_id)
    norm = _validate_cobro_config_payload(data, sb=sb)
    payload = {
        **norm,
        "contrato_id": int(contrato_id),
        "updated_at": _now_iso(),
        "updated_by": int(user_id),
    }
    existing = (
        sb.table("contrato_licencia_cobro_config")
        .select("contrato_id")
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    if existing:
        sb.table("contrato_licencia_cobro_config").update(payload).eq(
            "contrato_id", int(contrato_id)
        ).execute()
    else:
        sb.table("contrato_licencia_cobro_config").insert(payload).execute()
    return get_cobro_config(sb, contrato_id)


def _parse_date(val) -> Optional[date]:
    if val is None or val == "":
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()[:10]
    return date.fromisoformat(s)


def _last_day_of_month(y: int, m: int) -> int:
    return calendar.monthrange(y, m)[1]


def _fin_periodo_mensual(inicio: date) -> date:
    return date(inicio.year, inicio.month, _last_day_of_month(inicio.year, inicio.month))


def _fin_periodo_quincenal(inicio: date) -> date:
    if inicio.day <= 15:
        return date(inicio.year, inicio.month, 15)
    return date(inicio.year, inicio.month, _last_day_of_month(inicio.year, inicio.month))


def calcular_fecha_vencimiento(periodo_fin: date, dia_vencimiento: int) -> date:
    """Día de vencimiento en el mes siguiente al cierre del período."""
    y, m = periodo_fin.year, periodo_fin.month
    if m == 12:
        ny, nm = y + 1, 1
    else:
        ny, nm = y, m + 1
    d = min(max(1, int(dia_vencimiento)), _last_day_of_month(ny, nm))
    return date(ny, nm, d)


def _ultima_orden_activa(sb, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("contrato_orden_pago")
        .select("*")
        .eq("contrato_id", int(contrato_id))
        .in_("estado", list(ORDEN_ESTADOS_ACTIVOS))
        .order("periodo_fin", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def sugerir_periodo_corte(sb, contrato_id: int) -> dict:
    cfg = get_cobro_config(sb, contrato_id)
    tipo = cfg.get("tipo_periodo") or "mensual"
    ultima = _ultima_orden_activa(sb, contrato_id)
    hoy = _bogota_today()

    if ultima and ultima.get("periodo_fin"):
        inicio = _parse_date(ultima["periodo_fin"]) + timedelta(days=1)
    else:
        inicio = date(hoy.year, hoy.month, 1)

    if tipo == "quincenal":
        if inicio.day > 15:
            inicio = date(inicio.year, inicio.month, 16)
        fin = _fin_periodo_quincenal(inicio)
    else:
        fin = _fin_periodo_mensual(inicio)

    dia_venc = int(cfg.get("dia_vencimiento") or 7)
    vencimiento = calcular_fecha_vencimiento(fin, dia_venc)
    proximo_corte = next_numero_corte(sb, contrato_id)
    return {
        "periodo_inicio": inicio.isoformat(),
        "periodo_fin": fin.isoformat(),
        "fecha_emision": hoy.isoformat(),
        "fecha_vencimiento": vencimiento.isoformat(),
        "proximo_numero_corte": proximo_corte,
    }


def next_numero_corte(sb, contrato_id: int) -> int:
    max_c = max_numero_corte(sb, contrato_id)
    return max_c + 1 if max_c else 1


def max_numero_corte(sb, contrato_id: int) -> int:
    """Mayor numero_corte existente para el contrato (0 si no hay órdenes)."""
    rows = (
        sb.table("contrato_orden_pago")
        .select("numero_corte")
        .eq("contrato_id", int(contrato_id))
        .order("numero_corte", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return 0
    return int(rows[0].get("numero_corte") or 0)


def saldo_cartera_pendiente(sb, contrato_id: int) -> int:
    rows = (
        sb.table("contrato_orden_pago")
        .select("total, total_a_pagar")
        .eq("contrato_id", int(contrato_id))
        .in_("estado", list(ORDEN_ESTADOS_CARTERA))
        .execute()
        .data
        or []
    )
    total = 0
    for r in rows:
        try:
            # Usar total del período (no total_a_pagar acumulado histórico).
            val = r.get("total")
            if val is None:
                val = r.get("total_a_pagar")
            total += int(round(float(val or 0)))
        except (TypeError, ValueError):
            pass
    return total


def calcular_montos_orden(*, valor_unitario: int, iva_tasa: float, saldo_cartera: int) -> dict:
    subtotal = int(valor_unitario)
    iva_valor = int(round(subtotal * float(iva_tasa)))
    total = subtotal + iva_valor
    cartera = int(saldo_cartera or 0)
    return {
        "subtotal": subtotal,
        "iva_tasa": float(iva_tasa),
        "iva_valor": iva_valor,
        "total": total,
        "saldo_cartera": cartera,
        "total_a_pagar": total,
    }


def validar_previo_generacion(sb, contrato_id: int) -> Tuple[dict, dict, dict, dict]:
    """Contrato, licenciatario, config y montos base. Lanza ValueError si falta data."""
    contrato = get_contrato_orden_pago_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id)
    if not lic:
        raise ValueError(
            "No hay datos del licenciatario. Complete el formulario en Documentos contractuales."
        )
    razon = (lic.get("razon_social") or "").strip()
    nit = (lic.get("nit") or "").strip()
    if not razon:
        raise ValueError("razon_social del licenciatario es obligatoria para generar la orden de pago")
    if not nit:
        raise ValueError("NIT del licenciatario es obligatorio para generar la orden de pago")
    objeto = (contrato.get("objeto") or "").strip()
    if not objeto:
        raise ValueError("El contrato no tiene objeto definido")
    try:
        valor = int(round(float(lic.get("valor_mensual") or 0)))
    except (TypeError, ValueError) as exc:
        raise ValueError("valor_mensual del licenciatario no es válido") from exc
    if valor <= 0:
        raise ValueError("valor_mensual debe ser mayor a cero")
    cfg = get_cobro_config(sb, contrato_id)
    tasa = iva_tasa_licencia_contrato(contrato)
    cartera = saldo_cartera_pendiente(sb, contrato_id)
    montos = calcular_montos_orden(
        valor_unitario=valor, iva_tasa=tasa, saldo_cartera=cartera
    )
    return contrato, lic, cfg, montos


def _periodo_duplicado_activo(
    sb, contrato_id: int, periodo_inicio: date, periodo_fin: date
) -> bool:
    rows = (
        sb.table("contrato_orden_pago")
        .select("id")
        .eq("contrato_id", int(contrato_id))
        .eq("periodo_inicio", periodo_inicio.isoformat())
        .eq("periodo_fin", periodo_fin.isoformat())
        .in_("estado", list(ORDEN_ESTADOS_ACTIVOS))
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


def logo_receptor_url(contrato_row: dict, logo_tipo: str) -> str:
    t = (logo_tipo or "ninguno").strip().lower()
    if t == "contratista":
        return (contrato_row.get("logo_contratista") or "").strip()
    if t == "interventoria":
        return (contrato_row.get("logo_interventoria") or "").strip()
    return ""


def list_ordenes_pago(sb, contrato_id: int) -> List[dict]:
    rows = (
        sb.table("contrato_orden_pago")
        .select(
            "id, contrato_id, numero_corte, periodo_inicio, periodo_fin, "
            "fecha_emision, fecha_vencimiento, descripcion_servicio, subtotal, "
            "iva_tasa, iva_valor, total, saldo_cartera, total_a_pagar, estado, "
            "nombre_archivo, created_at, created_by, updated_at, "
            "envio_estado, ultimo_envio_at, ultimo_envio_destinatarios, "
            "factura_nombre_archivo, factura_mime_type, factura_tamano_bytes, "
            "factura_uploaded_at, factura_azure_blob_path"
        )
        .eq("contrato_id", int(contrato_id))
        .order("numero_corte", desc=True)
        .execute()
        .data
        or []
    )
    out: List[dict] = []
    for r in rows:
        item = dict(r)
        path = (item.pop("factura_azure_blob_path", None) or "").strip()
        item["tiene_factura"] = bool(path)
        out.append(item)
    return out


def get_orden_pago(sb, orden_id: int, contrato_id: int) -> Optional[dict]:
    rows = (
        sb.table("contrato_orden_pago")
        .select("*")
        .eq("id", int(orden_id))
        .eq("contrato_id", int(contrato_id))
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def _normalize_factura_mime(content_type: Optional[str]) -> str:
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime == "image/jpg":
        return "image/jpeg"
    return mime


def validate_factura_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > MAX_FACTURA_BYTES:
        raise ValueError(
            f"El archivo supera el máximo de {MAX_FACTURA_BYTES // (1024 * 1024)} MB."
        )
    mime = _normalize_factura_mime(content_type)
    if mime not in FACTURA_MIMES:
        raise ValueError("Formato no permitido. Use PDF o imagen (JPEG, PNG, WebP).")
    return mime


def _nombre_factura_safe(nombre_archivo: str, mime: str) -> str:
    raw = (nombre_archivo or "factura_emitida").strip() or "factura_emitida"
    base = re.sub(r"\.[^.]+$", "", raw)
    base = re.sub(r"[^\w.\-]", "_", base)[:200] or "factura_emitida"
    ext = MIME_EXT.get(mime, "")
    return f"{base}{ext}"


def upload_factura_orden_pago(
    sb,
    orden_id: int,
    contrato_id: int,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: int,
) -> dict:
    """Adjunta o reemplaza la factura emitida (PDF/imagen) de una orden."""
    orden = get_orden_pago(sb, orden_id, contrato_id)
    if not orden:
        raise ValueError("Orden de pago no encontrada")
    mime = validate_factura_upload(content_type, len(data))
    nombre = _nombre_factura_safe(nombre_archivo, mime)
    numero_corte = int(orden.get("numero_corte") or 0)
    old_path = (orden.get("factura_azure_blob_path") or "").strip()
    blob_path = path_contrato_orden_pago_factura(contrato_id, numero_corte, nombre)
    upload_blob_private(blob_path, data, mime, overwrite=True)

    sb.table("contrato_orden_pago").update(
        {
            "factura_azure_blob_path": blob_path,
            "factura_nombre_archivo": nombre[:255],
            "factura_mime_type": mime,
            "factura_tamano_bytes": len(data),
            "factura_uploaded_at": _now_iso(),
            "factura_uploaded_by": int(user_id),
            "updated_at": _now_iso(),
            "updated_by": int(user_id),
        }
    ).eq("id", int(orden_id)).eq("contrato_id", int(contrato_id)).execute()

    if old_path and old_path != blob_path:
        try:
            delete_blob_private(old_path)
        except Exception as exc:
            _log.warning("No se pudo eliminar factura anterior orden %s: %s", orden_id, exc)

    refreshed = get_orden_pago(sb, orden_id, contrato_id) or orden
    refreshed["tiene_factura"] = bool((refreshed.get("factura_azure_blob_path") or "").strip())
    return refreshed


def download_factura_orden_pago_bytes(orden_row: dict) -> Tuple[bytes, str, str]:
    path = (orden_row.get("factura_azure_blob_path") or "").strip()
    if not path:
        raise ValueError("La orden no tiene factura emitida adjunta")
    data = download_blob_bytes_private(path)
    mime = (orden_row.get("factura_mime_type") or "application/octet-stream").split(";")[0].strip()
    name = (
        orden_row.get("factura_nombre_archivo")
        or f"factura_orden_{orden_row.get('id')}.pdf"
    ).strip()
    return data, mime, name


def eliminar_factura_orden_pago(
    sb, orden_id: int, contrato_id: int, user_id: int
) -> dict:
    orden = get_orden_pago(sb, orden_id, contrato_id)
    if not orden:
        raise ValueError("Orden de pago no encontrada")
    path = (orden.get("factura_azure_blob_path") or "").strip()
    if not path:
        raise ValueError("La orden no tiene factura emitida adjunta")
    try:
        delete_blob_private(path)
    except Exception as exc:
        _log.warning("No se pudo borrar blob factura orden %s: %s", orden_id, exc)

    sb.table("contrato_orden_pago").update(
        {
            "factura_azure_blob_path": None,
            "factura_nombre_archivo": None,
            "factura_mime_type": None,
            "factura_tamano_bytes": None,
            "factura_uploaded_at": None,
            "factura_uploaded_by": None,
            "updated_at": _now_iso(),
            "updated_by": int(user_id),
        }
    ).eq("id", int(orden_id)).eq("contrato_id", int(contrato_id)).execute()

    refreshed = get_orden_pago(sb, orden_id, contrato_id) or orden
    refreshed["tiene_factura"] = False
    return refreshed


def validate_orden_estado(estado: str) -> str:
    e = (estado or "").strip().lower()
    if e not in ORDEN_ESTADOS:
        raise ValueError(f"Estado inválido: {estado}")
    return e


def update_orden_estado(sb, orden_id: int, contrato_id: int, estado: str, user_id: int) -> dict:
    e = validate_orden_estado(estado)
    row = get_orden_pago(sb, orden_id, contrato_id)
    if not row:
        raise ValueError("Orden de pago no encontrada")
    sb.table("contrato_orden_pago").update(
        {"estado": e, "updated_at": _now_iso(), "updated_by": int(user_id)}
    ).eq("id", int(orden_id)).execute()
    return get_orden_pago(sb, orden_id, contrato_id) or row


def download_orden_pago_bytes(orden_row: dict) -> Tuple[bytes, str, str]:
    path = (orden_row.get("azure_blob_path") or "").strip()
    if not path:
        raise ValueError("Orden sin ruta de almacenamiento")
    data = download_blob_bytes_private(path)
    mime = (orden_row.get("mime_type") or MIME_PDF).split(";")[0].strip()
    name = (orden_row.get("nombre_archivo") or f"orden_pago_{orden_row.get('id')}.pdf").strip()
    return data, mime, name


def resumen_ordenes_pago(sb, contrato_id: int) -> dict:
    contrato = get_contrato_orden_pago_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id)
    cfg = get_cobro_config(sb, contrato_id)
    tasa = iva_tasa_licencia_contrato(contrato)
    cartera = saldo_cartera_pendiente(sb, contrato_id)
    valor = 0
    if lic and lic.get("valor_mensual") is not None:
        try:
            valor = int(round(float(lic.get("valor_mensual"))))
        except (TypeError, ValueError):
            valor = 0
    montos = calcular_montos_orden(
        valor_unitario=valor, iva_tasa=tasa, saldo_cartera=cartera
    ) if valor > 0 else None
    sugerencia = sugerir_periodo_corte(sb, contrato_id)
    historial = list_ordenes_pago(sb, contrato_id)
    envios_map = list_envios_por_ordenes(sb, contrato_id, [h["id"] for h in historial if h.get("id")])
    for h in historial:
        h["envios"] = envios_map.get(int(h["id"]), [])
    return {
        "contrato": {
            "id": contrato.get("id"),
            "numero": contrato.get("numero"),
            "objeto": contrato.get("objeto"),
        },
        "licenciatario": lic,
        "config": cfg,
        "iva_tasa": tasa,
        "iva_porcentaje_etiqueta": _iva_etiqueta_porcentaje(tasa),
        "montos_preview": montos,
        "saldo_cartera": cartera,
        "sugerencia_periodo": sugerencia,
        "historial": historial,
        "empresa": empresa_orden_pago_config(),
        "validacion_generacion": {
            "listo": bool(
                lic
                and (lic.get("razon_social") or "").strip()
                and (lic.get("nit") or "").strip()
                and valor > 0
                and (contrato.get("objeto") or "").strip()
            ),
        },
    }


def registrar_orden_pago_generada(
    sb,
    *,
    contrato_id: int,
    numero_corte: int,
    pdf_bytes: bytes,
    periodo_inicio: date,
    periodo_fin: date,
    fecha_emision: date,
    fecha_vencimiento: date,
    descripcion_servicio: str,
    montos: dict,
    contrato_row: dict,
    lic: dict,
    cfg: dict,
    user_id: int,
    datos_snapshot: dict,
) -> dict:
    if _periodo_duplicado_activo(sb, contrato_id, periodo_inicio, periodo_fin):
        raise ValueError(
            "Ya existe una orden de pago activa para ese período de corte"
        )

    numero_corte = int(numero_corte)
    blob_path = path_contrato_orden_pago(contrato_id, numero_corte)
    upload_blob_private(blob_path, pdf_bytes, MIME_PDF, overwrite=True)

    numero_contrato = (contrato_row.get("numero") or "").strip() or str(contrato_id)
    nom = f"OrdenPago_{numero_contrato}_Corte{numero_corte:03d}.pdf"

    logo_tipo = cfg.get("logo_receptor") or "contratista"
    logo_ref = logo_receptor_url(contrato_row, logo_tipo)

    row = {
        "contrato_id": int(contrato_id),
        "numero_corte": int(numero_corte),
        "periodo_inicio": periodo_inicio.isoformat(),
        "periodo_fin": periodo_fin.isoformat(),
        "fecha_emision": fecha_emision.isoformat(),
        "fecha_vencimiento": fecha_vencimiento.isoformat(),
        "descripcion_servicio": descripcion_servicio,
        "cantidad": 1,
        "valor_unitario": montos["subtotal"],
        "subtotal": montos["subtotal"],
        "iva_tasa": montos["iva_tasa"],
        "iva_valor": montos["iva_valor"],
        "total": montos["total"],
        "saldo_cartera": montos["saldo_cartera"],
        "total_a_pagar": montos["total_a_pagar"],
        "azure_blob_path": blob_path,
        "nombre_archivo": nom,
        "mime_type": MIME_PDF,
        "tamano_bytes": len(pdf_bytes),
        "estado": "emitida",
        "logo_receptor_tipo": logo_tipo,
        "logo_receptor_ref": logo_ref or None,
        "autorizo_nombre": cfg.get("autorizo_nombre"),
        "autorizo_cargo": cfg.get("autorizo_cargo"),
        "datos_snapshot": datos_snapshot,
        "created_by": int(user_id),
        "envio_estado": "pendiente",
    }

    for intento in range(3):
        try:
            res = sb.table("contrato_orden_pago").insert(row).execute()
            data = (res.data or [None])[0]
            if data:
                return data
        except Exception as exc:
            msg = str(exc).lower()
            if "contrato_orden_pago_corte_unique" in msg or "duplicate" in msg:
                row["numero_corte"] = next_numero_corte(sb, contrato_id)
                blob_path = path_contrato_orden_pago(contrato_id, row["numero_corte"])
                upload_blob_private(blob_path, pdf_bytes, MIME_PDF, overwrite=True)
                row["azure_blob_path"] = blob_path
                row["nombre_archivo"] = (
                    f"OrdenPago_{numero_contrato}_Corte{int(row['numero_corte']):03d}.pdf"
                )
                continue
            raise
    raise RuntimeError("No se pudo registrar la orden de pago")


def generar_orden_pago(
    sb,
    *,
    contrato_id: int,
    periodo_inicio: date,
    periodo_fin: date,
    fecha_emision: date,
    fecha_vencimiento: date,
    user_id: int,
    descripcion_servicio: Optional[str] = None,
) -> dict:
    from contrato_orden_pago_pdf import PDFOrdenPagoError, generar_pdf_orden_pago

    if periodo_fin < periodo_inicio:
        raise ValueError("periodo_fin debe ser posterior o igual a periodo_inicio")

    contrato, lic, cfg, montos = validar_previo_generacion(sb, contrato_id)
    numero_corte = next_numero_corte(sb, contrato_id)
    desc = descripcion_cobro_pdf(
        contrato,
        lic,
        override=(descripcion_servicio or cfg.get("plan_descripcion") or "").strip() or None,
    )

    empresa = empresa_orden_pago_config()
    logo_tipo = cfg.get("logo_receptor") or "contratista"
    logo_url = logo_receptor_url(contrato, logo_tipo)

    snapshot = {
        "contrato": {
            "numero": contrato.get("numero"),
            "objeto": contrato.get("objeto"),
        },
        "licenciatario": lic,
        "config": cfg,
        "montos": montos,
        "empresa": empresa,
        "periodo": {
            "inicio": periodo_inicio.isoformat(),
            "fin": periodo_fin.isoformat(),
        },
    }

    pdf_bytes = generar_pdf_orden_pago(
        numero_contrato=(contrato.get("numero") or "").strip(),
        numero_corte=numero_corte,
        periodo_inicio=periodo_inicio,
        periodo_fin=periodo_fin,
        fecha_emision=fecha_emision,
        fecha_vencimiento=fecha_vencimiento,
        contrato_objeto=(contrato.get("objeto") or "").strip(),
        licenciatario=lic,
        empresa=empresa,
        descripcion_servicio=desc,
        montos=montos,
        iva_etiqueta=_iva_etiqueta_porcentaje(montos["iva_tasa"]),
        logo_receptor_url=logo_url,
        autorizo_nombre=cfg.get("autorizo_nombre") or "",
        autorizo_cargo=cfg.get("autorizo_cargo") or "",
    )

    if not pdf_bytes:
        raise PDFOrdenPagoError("PDF vacío")

    orden = registrar_orden_pago_generada(
        sb,
        contrato_id=contrato_id,
        numero_corte=numero_corte,
        pdf_bytes=pdf_bytes,
        periodo_inicio=periodo_inicio,
        periodo_fin=periodo_fin,
        fecha_emision=fecha_emision,
        fecha_vencimiento=fecha_vencimiento,
        descripcion_servicio=desc,
        montos=montos,
        contrato_row=contrato,
        lic=lic,
        cfg=cfg,
        user_id=user_id,
        datos_snapshot=snapshot,
    )

    from contrato_orden_pago_email import asunto_orden_pago

    destinatarios = destinatarios_notificacion_desde_config(cfg)
    if not destinatarios:
        _marcar_envio_fallido(
            sb,
            orden_id=int(orden["id"]),
            contrato_id=contrato_id,
            destinatarios=[],
            error="No hay correos de notificación configurados.",
            user_id=user_id,
            asunto=None,
        )
        raise ValueError(
            "Configure al menos un correo de notificación antes de generar y enviar."
        )

    try:
        enviar_correo_orden_pago(
            sb,
            orden=orden,
            contrato=contrato,
            lic=lic,
            cfg=cfg,
            pdf_bytes=pdf_bytes,
            destinatarios=destinatarios,
            user_id=user_id,
        )
    except Exception as exc:
        err = str(exc)
        _marcar_envio_fallido(
            sb,
            orden_id=int(orden["id"]),
            contrato_id=contrato_id,
            destinatarios=destinatarios,
            error=err,
            user_id=user_id,
            asunto=asunto_orden_pago(
                numero_contrato=(contrato.get("numero") or "").strip(),
                numero_corte=int(orden.get("numero_corte") or numero_corte),
                periodo_inicio=periodo_inicio,
                periodo_fin=periodo_fin,
            ),
        )
        raise ValueError(
            f"Orden corte N.° {int(orden.get('numero_corte') or numero_corte):03d} generada, "
            f"pero el envío por correo falló: {err}. Use «Reenviar» en el historial."
        ) from exc

    refreshed = get_orden_pago(sb, int(orden["id"]), contrato_id) or orden
    envios = list_envios_por_ordenes(sb, contrato_id, [int(refreshed["id"])])
    refreshed["envios"] = envios.get(int(refreshed["id"]), [])
    return refreshed


def destinatarios_notificacion_desde_config(cfg: dict) -> List[str]:
    raw = cfg.get("correos_notificacion") if cfg else []
    if not isinstance(raw, list):
        return []
    return _normalize_correos_notificacion(raw)


def list_envios_por_ordenes(sb, contrato_id: int, orden_ids: List[int]) -> Dict[int, List[dict]]:
    ids = [int(x) for x in orden_ids if x]
    if not ids:
        return {}
    rows = (
        sb.table("contrato_orden_pago_envio")
        .select(
            "id, orden_id, contrato_id, destinatarios, asunto, exito, error_detalle, "
            "enviado_at, enviado_por"
        )
        .eq("contrato_id", int(contrato_id))
        .in_("orden_id", ids)
        .order("enviado_at", desc=True)
        .execute()
        .data
        or []
    )
    out: Dict[int, List[dict]] = {}
    for r in rows:
        oid = int(r["orden_id"])
        out.setdefault(oid, []).append(r)
    return out


def _registrar_envio_log(
    sb,
    *,
    orden_id: int,
    contrato_id: int,
    destinatarios: List[str],
    asunto: Optional[str],
    exito: bool,
    error_detalle: Optional[str],
    user_id: int,
) -> dict:
    row = {
        "orden_id": int(orden_id),
        "contrato_id": int(contrato_id),
        "destinatarios": destinatarios,
        "asunto": asunto,
        "exito": bool(exito),
        "error_detalle": (error_detalle or "")[:2000] or None,
        "enviado_at": _now_iso(),
        "enviado_por": int(user_id),
    }
    res = sb.table("contrato_orden_pago_envio").insert(row).execute()
    return (res.data or [row])[0]


def _actualizar_estado_envio_orden(
    sb,
    *,
    orden_id: int,
    contrato_id: int,
    estado: str,
    destinatarios: List[str],
) -> None:
    sb.table("contrato_orden_pago").update(
        {
            "envio_estado": estado,
            "ultimo_envio_at": _now_iso(),
            "ultimo_envio_destinatarios": destinatarios,
            "updated_at": _now_iso(),
        }
    ).eq("id", int(orden_id)).eq("contrato_id", int(contrato_id)).execute()


def _marcar_envio_fallido(
    sb,
    *,
    orden_id: int,
    contrato_id: int,
    destinatarios: List[str],
    error: str,
    user_id: int,
    asunto: Optional[str],
) -> None:
    _registrar_envio_log(
        sb,
        orden_id=orden_id,
        contrato_id=contrato_id,
        destinatarios=destinatarios,
        asunto=asunto,
        exito=False,
        error_detalle=error,
        user_id=user_id,
    )
    _actualizar_estado_envio_orden(
        sb,
        orden_id=orden_id,
        contrato_id=contrato_id,
        estado="fallido",
        destinatarios=destinatarios,
    )


def enviar_correo_orden_pago(
    sb,
    *,
    orden: dict,
    contrato: dict,
    lic: dict,
    cfg: dict,
    pdf_bytes: bytes,
    destinatarios: List[str],
    user_id: int,
) -> dict:
    from contrato_orden_pago_email import (
        OrdenPagoEmailError,
        asunto_orden_pago,
        build_email_context,
        cuerpo_html_orden_pago,
        cuerpo_texto_orden_pago,
        facturacion_smtp_configured,
        send_orden_pago_email,
    )

    if not facturacion_smtp_configured():
        raise OrdenPagoEmailError(
            "SMTP de facturación no configurado en el servidor."
        )

    numero_contrato = (contrato.get("numero") or "").strip() or str(contrato.get("id"))
    numero_corte = int(orden.get("numero_corte") or 0)
    monto = int(round(float(orden.get("total") or orden.get("total_a_pagar") or 0)))
    subject = asunto_orden_pago(
        numero_contrato=numero_contrato,
        numero_corte=numero_corte,
        periodo_inicio=orden.get("periodo_inicio"),
        periodo_fin=orden.get("periodo_fin"),
    )
    mensaje_extra = (cfg.get("email_mensaje_adicional") or "").strip() or None
    ctx = build_email_context(
        numero_contrato=numero_contrato,
        numero_corte=numero_corte,
        periodo_inicio=orden.get("periodo_inicio"),
        periodo_fin=orden.get("periodo_fin"),
        fecha_vencimiento=orden.get("fecha_vencimiento"),
        monto_total=monto,
        razon_social=(lic.get("razon_social") or "").strip(),
        destinatario_email=", ".join(destinatarios),
    )
    html_body = cuerpo_html_orden_pago(ctx, mensaje_adicional=mensaje_extra)
    text_body = cuerpo_texto_orden_pago(ctx, mensaje_adicional=mensaje_extra)
    filename = (orden.get("nombre_archivo") or f"OrdenPago_{numero_contrato}_Corte{numero_corte:03d}.pdf").strip()

    send_orden_pago_email(
        destinatarios=destinatarios,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
        pdf_bytes=pdf_bytes,
        pdf_filename=filename,
    )

    log_row = _registrar_envio_log(
        sb,
        orden_id=int(orden["id"]),
        contrato_id=int(orden["contrato_id"]),
        destinatarios=destinatarios,
        asunto=subject,
        exito=True,
        error_detalle=None,
        user_id=user_id,
    )
    _actualizar_estado_envio_orden(
        sb,
        orden_id=int(orden["id"]),
        contrato_id=int(orden["contrato_id"]),
        estado="enviado",
        destinatarios=destinatarios,
    )
    return log_row


def reenviar_correo_orden_pago(
    sb,
    *,
    orden_id: int,
    contrato_id: int,
    user_id: int,
) -> dict:
    orden = get_orden_pago(sb, orden_id, contrato_id)
    if not orden:
        raise ValueError("Orden de pago no encontrada")
    contrato = get_contrato_orden_pago_row(sb, contrato_id)
    lic = get_licenciatario(sb, contrato_id) or {}
    cfg = get_cobro_config(sb, contrato_id)
    destinatarios = destinatarios_notificacion_desde_config(cfg)
    if not destinatarios:
        raise ValueError("Configure al menos un correo de notificación para reenviar.")

    pdf_bytes, _, _ = download_orden_pago_bytes(orden)

    from contrato_orden_pago_email import asunto_orden_pago

    try:
        enviar_correo_orden_pago(
            sb,
            orden=orden,
            contrato=contrato,
            lic=lic,
            cfg=cfg,
            pdf_bytes=pdf_bytes,
            destinatarios=destinatarios,
            user_id=user_id,
        )
    except Exception as exc:
        err = str(exc)
        _marcar_envio_fallido(
            sb,
            orden_id=int(orden_id),
            contrato_id=contrato_id,
            destinatarios=destinatarios,
            error=err,
            user_id=user_id,
            asunto=asunto_orden_pago(
                numero_contrato=(contrato.get("numero") or "").strip(),
                numero_corte=int(orden.get("numero_corte") or 0),
                periodo_inicio=orden.get("periodo_inicio"),
                periodo_fin=orden.get("periodo_fin"),
            ),
        )
        raise ValueError(f"No se pudo reenviar el correo: {err}") from exc

    refreshed = get_orden_pago(sb, orden_id, contrato_id) or orden
    envios = list_envios_por_ordenes(sb, contrato_id, [int(refreshed["id"])])
    refreshed["envios"] = envios.get(int(refreshed["id"]), [])
    return refreshed


def eliminar_orden_pago(sb, orden_id: int, contrato_id: int) -> dict:
    """
    Elimina orden y blob. numero_corte solo se libera para reutilización si era
    el máximo actual de la secuencia del contrato.
    """
    assert_contrato_exists(sb, contrato_id)
    orden = get_orden_pago(sb, orden_id, contrato_id)
    if not orden:
        raise ValueError("Orden de pago no encontrada")
    numero_corte = int(orden.get("numero_corte") or 0)
    max_corte = max_numero_corte(sb, contrato_id)
    consecutivo_liberado = numero_corte > 0 and numero_corte == max_corte

    blob_path = (orden.get("azure_blob_path") or "").strip()
    if blob_path:
        try:
            delete_blob_private(blob_path)
        except Exception as exc:
            _log.warning("No se pudo borrar blob orden %s: %s", orden_id, exc)

    factura_path = (orden.get("factura_azure_blob_path") or "").strip()
    if factura_path:
        try:
            delete_blob_private(factura_path)
        except Exception as exc:
            _log.warning("No se pudo borrar blob factura orden %s: %s", orden_id, exc)

    sb.table("contrato_orden_pago").delete().eq("id", int(orden_id)).eq(
        "contrato_id", int(contrato_id)
    ).execute()

    return {
        "id": int(orden_id),
        "numero_corte": numero_corte,
        "consecutivo_liberado": consecutivo_liberado,
        "proximo_numero_corte": next_numero_corte(sb, contrato_id),
    }


def licencia_lista_para_generar(sb, contrato_id: int) -> bool:
    """True si el contrato tiene licenciamiento mínimo para generar orden de pago."""
    try:
        contrato = get_contrato_orden_pago_row(sb, contrato_id)
        lic = get_licenciatario(sb, contrato_id)
        if not lic:
            return False
        if not (lic.get("razon_social") or "").strip():
            return False
        if not (lic.get("nit") or "").strip():
            return False
        if not (contrato.get("objeto") or "").strip():
            return False
        valor = float(lic.get("valor_mensual") or 0)
        return valor > 0
    except (ValueError, TypeError):
        return False


def _parse_iso_dt(val) -> Optional[datetime]:
    if val is None or val == "":
        return None
    s = str(val).strip().replace(" ", "T")
    if not re.search(r"[Zz]|[+-]\d{2}", s):
        s += "Z"
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _contrato_activo_presupuesto(contrato_row: dict) -> bool:
    return (contrato_row.get("fase") or "PRESUPUESTO").strip().upper() == "PRESUPUESTO"


def alertas_generacion_mensual(sb) -> dict:
    """Contratos con orden pendiente de generar (solo días 1–7 del mes, Bogotá)."""
    hoy = _bogota_today()
    base = {
        "dia_mes": hoy.day,
        "zona_horaria": "America/Bogota",
        "fecha_referencia": hoy.isoformat(),
        "en_ventana": _en_ventana_alerta_generacion_mensual(hoy),
    }
    if not base["en_ventana"]:
        return {**base, "mostrar": False, "pendientes": []}

    rows = (
        sb.table("contratos")
        .select("id, numero, objeto, contratista, fase")
        .order("numero")
        .execute()
        .data
        or []
    )

    pendientes: List[dict] = []
    for c in rows:
        if not _contrato_activo_presupuesto(c):
            continue
        cid = int(c["id"])
        if not licencia_lista_para_generar(sb, cid):
            continue
        sug = sugerir_periodo_corte(sb, cid)
        pi = _parse_date(sug.get("periodo_inicio"))
        pf = _parse_date(sug.get("periodo_fin"))
        if not pi or not pf:
            continue
        if _periodo_duplicado_activo(sb, cid, pi, pf):
            continue
        cfg = get_cobro_config(sb, cid)
        correos = destinatarios_notificacion_desde_config(cfg)
        pendientes.append(
            {
                "contrato_id": cid,
                "numero": (c.get("numero") or "").strip() or str(cid),
                "nombre": (c.get("objeto") or c.get("contratista") or c.get("numero") or "").strip(),
                "periodo_inicio": sug["periodo_inicio"],
                "periodo_fin": sug["periodo_fin"],
                "fecha_emision": sug["fecha_emision"],
                "fecha_vencimiento": sug["fecha_vencimiento"],
                "proximo_numero_corte": sug["proximo_numero_corte"],
                "correos_configurados": correos,
                "puede_enviar": bool(correos),
            }
        )

    return {
        **base,
        "mostrar": len(pendientes) > 0,
        "pendientes": pendientes,
    }


def alertas_seguimiento_emitidas(sb) -> dict:
    """Órdenes emitidas enviadas hace más de 24 h sin cambio de estado."""
    limite = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = (
        sb.table("contrato_orden_pago")
        .select(
            "id, contrato_id, numero_corte, ultimo_envio_at, envio_estado, estado, "
            "contratos(numero, objeto)"
        )
        .eq("estado", "emitida")
        .eq("envio_estado", "enviado")
        .execute()
        .data
        or []
    )

    ordenes: List[dict] = []
    for r in rows:
        enviado_at = _parse_iso_dt(r.get("ultimo_envio_at"))
        if not enviado_at or enviado_at > limite:
            continue
        contrato = r.get("contratos") or {}
        if isinstance(contrato, list):
            contrato = contrato[0] if contrato else {}
        ordenes.append(
            {
                "orden_id": int(r["id"]),
                "contrato_id": int(r["contrato_id"]),
                "numero_contrato": (contrato.get("numero") or "").strip() or str(r["contrato_id"]),
                "nombre_contrato": (contrato.get("objeto") or contrato.get("numero") or "").strip(),
                "numero_corte": int(r.get("numero_corte") or 0),
                "ultimo_envio_at": r.get("ultimo_envio_at"),
            }
        )

    ordenes.sort(key=lambda x: x.get("ultimo_envio_at") or "", reverse=False)
    return {"mostrar": len(ordenes) > 0, "ordenes": ordenes}


def resumen_alertas_ordenes_pago(sb) -> dict:
    gen = alertas_generacion_mensual(sb)
    seg = alertas_seguimiento_emitidas(sb)
    return {
        "generacion_mensual": gen,
        "seguimiento": seg,
        "hay_alertas": bool(gen.get("mostrar") or seg.get("mostrar")),
    }
