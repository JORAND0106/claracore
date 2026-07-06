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

import pytz

from azure_blob_storage import (
    download_blob_bytes_private,
    path_contrato_orden_pago,
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

COBRO_CONFIG_FIELDS = (
    "plan_descripcion",
    "tipo_periodo",
    "dia_vencimiento",
    "logo_receptor",
    "autorizo_usuario_id",
    "autorizo_nombre",
    "autorizo_cargo",
    "correos_notificacion",
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_CORREOS_NOTIFICACION = 20


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _bogota_today() -> date:
    return datetime.now(pytz.timezone("America/Bogota")).date()


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
    base = {
        "plan_descripcion": plan,
        "tipo_periodo": tipo,
        "dia_vencimiento": dia,
        "logo_receptor": logo,
        "correos_notificacion": correos,
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
    return (
        sb.table("contrato_orden_pago")
        .select(
            "id, contrato_id, numero_corte, periodo_inicio, periodo_fin, "
            "fecha_emision, fecha_vencimiento, descripcion_servicio, subtotal, "
            "iva_tasa, iva_valor, total, saldo_cartera, total_a_pagar, estado, "
            "nombre_archivo, created_at, created_by, updated_at"
        )
        .eq("contrato_id", int(contrato_id))
        .order("numero_corte", desc=True)
        .execute()
        .data
        or []
    )


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
        "historial": list_ordenes_pago(sb, contrato_id),
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

    return registrar_orden_pago_generada(
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


def eliminar_orden_pago(sb, orden_id: int, contrato_id: int) -> dict:
    """
    Elimina orden y blob. numero_corte solo se libera para reutilización si era
    el máximo actual de la secuencia del contrato.
    """
    from azure_blob_storage import delete_blob_private

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

    sb.table("contrato_orden_pago").delete().eq("id", int(orden_id)).eq(
        "contrato_id", int(contrato_id)
    ).execute()

    return {
        "id": int(orden_id),
        "numero_corte": numero_corte,
        "consecutivo_liberado": consecutivo_liberado,
        "proximo_numero_corte": next_numero_corte(sb, contrato_id),
    }
