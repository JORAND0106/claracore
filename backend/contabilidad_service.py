"""
Servicio — módulo Contabilidad ClaraCore.

Transacciones, plan de cuentas, cuentas especiales (ledger), cierre mensual
y vínculo con órdenes facturadas.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from calendar import monthrange
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

from azure_blob_storage import (
    delete_blob_private,
    download_blob_bytes_private,
    path_contabilidad_soporte,
    upload_blob_private,
)

_log = logging.getLogger("claracore.contabilidad")

CAPITALIZACION_TASA = Decimal("0.20")
Q = Decimal("0.01")

SOPORTE_MIMES = frozenset({
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
})
MAX_SOPORTE_BYTES = 20 * 1024 * 1024

TX_TIPOS = frozenset({"ingreso", "egreso"})
IVA_SENTIDOS = frozenset({"recaudado", "pagado"})
FUENTES_INGRESO = frozenset({"licenciamiento", "servicios"})
CENTRO_COSTO_TIPOS = frozenset({"contrato", "empresa"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _d(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _money(value: Decimal) -> Decimal:
    return value.quantize(Q, rounding=ROUND_HALF_UP)


def _parse_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    s = str(value or "").strip()[:10]
    if not s:
        raise ValueError("Fecha requerida (YYYY-MM-DD).")
    return date.fromisoformat(s)


def _periodo_key(fecha: date) -> Tuple[int, int]:
    return fecha.year, fecha.month


def _periodo_bloqueado(sb, fecha: date) -> bool:
    anio, mes = _periodo_key(fecha)
    rows = (
        sb.table("contabilidad_cierre_mensual")
        .select("id, estado")
        .eq("anio", anio)
        .eq("mes", mes)
        .eq("estado", "aprobado")
        .limit(1)
        .execute()
        .data
        or []
    )
    return bool(rows)


def calcular_valor_neto(
    tipo: str,
    valor_bruto: Decimal,
    retencion_valor: Decimal,
    iva_valor: Decimal,
    propina: Decimal = Decimal("0"),
) -> Decimal:
    """
    Total factura = Valor bruto (costo directo) + IVA + Propina − Retención.
    IVA/propina/retención solo se aplican si son > 0.
    """
    t = (tipo or "").strip().lower()
    tip = _money(_d(propina))
    if tip <= 0:
        tip = Decimal("0")
    ret = _money(_d(retencion_valor))
    if ret <= 0:
        ret = Decimal("0")
    iva = _money(_d(iva_valor))
    if iva <= 0:
        iva = Decimal("0")
    if t not in TX_TIPOS:
        raise ValueError("tipo debe ser ingreso o egreso.")
    return _money(valor_bruto + iva + tip - ret)


def _subcuenta_capitalizacion(fuente_ingreso: Optional[str]) -> str:
    f = (fuente_ingreso or "licenciamiento").strip().lower()
    if f not in FUENTES_INGRESO:
        f = "licenciamiento"
    return f


def _movimientos_para_transaccion(row: dict) -> List[dict]:
    """Genera movimientos de ledger para una transacción activa."""
    tipo = (row.get("tipo") or "").strip().lower()
    bruto = _money(_d(row.get("valor_bruto")))
    ret = _money(_d(row.get("retencion_fuente_valor")))
    iva = _money(_d(row.get("iva_valor")))
    fecha = _parse_date(row.get("fecha"))
    tx_id = int(row["id"])
    movs: List[dict] = []

    if tipo == "ingreso":
        cap = _money(bruto * CAPITALIZACION_TASA)
        tip = _money(_d(row.get("propina")))
        if tip <= 0:
            tip = Decimal("0")
        # Operativa: bruto − retención − capitalización + propina (IVA va a impuestos aparte).
        oper = _money(bruto - ret - cap + tip)
        fuente = _subcuenta_capitalizacion(row.get("fuente_ingreso"))
        if cap > 0:
            movs.append({
                "cuenta_tipo": "capitalizacion",
                "subcuenta": fuente,
                "fecha": fecha.isoformat(),
                "monto": float(cap),
                "concepto": f"Capitalización 20% ingreso #{tx_id}",
                "transaccion_id": tx_id,
            })
        if iva > 0:
            movs.append({
                "cuenta_tipo": "impuestos",
                "subcuenta": "iva_recaudado",
                "fecha": fecha.isoformat(),
                "monto": float(iva),
                "concepto": f"IVA recaudado transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
        if ret > 0:
            movs.append({
                "cuenta_tipo": "impuestos",
                "subcuenta": "retencion_fuente",
                "fecha": fecha.isoformat(),
                "monto": float(ret),
                "concepto": f"Retención en la fuente transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
        if oper != 0:
            movs.append({
                "cuenta_tipo": "operativa",
                "subcuenta": "general",
                "fecha": fecha.isoformat(),
                "monto": float(oper),
                "concepto": f"Ingreso operativo transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
    elif tipo == "egreso":
        neto = calcular_valor_neto("egreso", bruto, ret, iva, _d(row.get("propina")))
        if neto != 0:
            movs.append({
                "cuenta_tipo": "operativa",
                "subcuenta": "general",
                "fecha": fecha.isoformat(),
                "monto": float(-neto),
                "concepto": f"Egreso operativo transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
        if iva > 0:
            movs.append({
                "cuenta_tipo": "impuestos",
                "subcuenta": "iva_pagado",
                "fecha": fecha.isoformat(),
                "monto": float(iva),
                "concepto": f"IVA pagado transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
        if ret > 0:
            movs.append({
                "cuenta_tipo": "impuestos",
                "subcuenta": "retencion_fuente",
                "fecha": fecha.isoformat(),
                "monto": float(ret),
                "concepto": f"Retención egreso transacción #{tx_id}",
                "transaccion_id": tx_id,
            })
    return movs


def _eliminar_movimientos_transaccion(sb, transaccion_id: int) -> None:
    sb.table("contabilidad_cuenta_movimiento").delete().eq(
        "transaccion_id", int(transaccion_id)
    ).execute()


def _insertar_movimientos(sb, movs: List[dict], user_id: int) -> None:
    if not movs:
        return
    payload = [{**m, "created_by": user_id} for m in movs]
    sb.table("contabilidad_cuenta_movimiento").insert(payload).execute()


def _enriquecer_transaccion(sb, row: dict) -> dict:
    out = dict(row)
    if row.get("categoria_id"):
        cat = (
            sb.table("contabilidad_categoria")
            .select("id, codigo, nombre, tipo")
            .eq("id", int(row["categoria_id"]))
            .limit(1)
            .execute()
            .data
        )
        if cat:
            out["categoria"] = cat[0]
    if row.get("contrato_id"):
        c = (
            sb.table("contratos")
            .select("id, numero, objeto")
            .eq("id", int(row["contrato_id"]))
            .limit(1)
            .execute()
            .data
        )
        if c:
            out["contrato"] = c[0]
    if row.get("orden_pago_id"):
        op = (
            sb.table("contrato_orden_pago")
            .select("id, numero_corte, estado, subtotal, iva_valor, total, periodo_inicio, periodo_fin")
            .eq("id", int(row["orden_pago_id"]))
            .limit(1)
            .execute()
            .data
        )
        if op:
            out["orden_pago"] = op[0]
    return out


def _validar_categoria(sb, categoria_id: int, tipo: str) -> None:
    rows = (
        sb.table("contabilidad_categoria")
        .select("id, tipo, activo")
        .eq("id", int(categoria_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Categoría no encontrada.")
    cat = rows[0]
    if not cat.get("activo"):
        raise ValueError("La categoría está inactiva.")
    if (cat.get("tipo") or "").strip().lower() != (tipo or "").strip().lower():
        raise ValueError("La categoría no coincide con el tipo de transacción.")


def _validar_centro_costo(
    centro_costo_tipo: str,
    contrato_id: Optional[int],
    sb,
) -> None:
    t = (centro_costo_tipo or "empresa").strip().lower()
    if t not in CENTRO_COSTO_TIPOS:
        raise ValueError("centro_costo_tipo inválido.")
    if t == "empresa" and contrato_id is not None:
        raise ValueError("centro_costo_tipo=empresa requiere contrato_id NULL.")
    if t == "contrato":
        if contrato_id is None:
            raise ValueError("centro_costo_tipo=contrato requiere contrato_id.")
        exists = (
            sb.table("contratos")
            .select("id")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
        )
        if not exists:
            raise ValueError("Contrato no encontrado.")


def _validar_payload_transaccion(sb, data: dict, *, es_update: bool = False) -> dict:
    tipo = (data.get("tipo") or "").strip().lower()
    if tipo not in TX_TIPOS:
        raise ValueError("tipo debe ser ingreso o egreso.")

    fecha = _parse_date(data.get("fecha"))
    if _periodo_bloqueado(sb, fecha):
        raise ValueError("El período de la fecha está cerrado y aprobado; no se puede modificar.")

    bruto = _money(_d(data.get("valor_bruto")))
    if bruto < 0:
        raise ValueError("valor_bruto debe ser >= 0.")

    ret_tasa = _d(data.get("retencion_fuente_tasa"))
    ret_valor = _money(_d(data.get("retencion_fuente_valor")))
    iva_tasa = _d(data.get("iva_tasa"))
    iva_valor = _money(_d(data.get("iva_valor")))

    iva_sentido = data.get("iva_sentido")
    if iva_valor > 0:
        if tipo == "ingreso":
            iva_sentido = "recaudado"
        elif tipo == "egreso":
            iva_sentido = "pagado"
    else:
        iva_sentido = None
    if iva_sentido and iva_sentido not in IVA_SENTIDOS:
        raise ValueError("iva_sentido inválido.")

    categoria_id = int(data["categoria_id"])
    _validar_categoria(sb, categoria_id, tipo)

    centro = (data.get("centro_costo_tipo") or "empresa").strip().lower()
    contrato_id = data.get("contrato_id")
    if contrato_id is not None:
        contrato_id = int(contrato_id)
    _validar_centro_costo(centro, contrato_id, sb)

    fuente = data.get("fuente_ingreso")
    if tipo == "egreso":
        fuente = None
    elif fuente:
        fuente = fuente.strip().lower()
        if fuente not in FUENTES_INGRESO:
            raise ValueError("fuente_ingreso inválida.")
    elif tipo == "ingreso":
        fuente = "licenciamiento"

    proveedor_razon = (data.get("proveedor_razon_social") or "").strip() or None
    proveedor_nit = (data.get("proveedor_nit") or "").strip() or None
    if tipo == "egreso":
        if not proveedor_razon:
            raise ValueError("La razón social del proveedor es obligatoria en egresos.")
        if not proveedor_nit:
            raise ValueError("El NIT del proveedor es obligatorio en egresos.")
        if len(proveedor_razon) > 255:
            raise ValueError("proveedor_razon_social supera 255 caracteres.")
        # Formato preferido XXXXXXXXX-D; se acepta también solo dígitos.
        nit_clean = re.sub(r"[^\d\-]", "", proveedor_nit)
        if not re.match(r"^\d{5,15}(-\d)?$", nit_clean):
            raise ValueError("NIT inválido. Use formato numérico con dígito de verificación (XXXXXXXXX-D).")
        proveedor_nit = nit_clean[:40]
    else:
        proveedor_razon = None
        proveedor_nit = None

    propina = _money(_d(data.get("propina")))
    if propina < 0:
        raise ValueError("propina debe ser >= 0.")

    valor_neto = calcular_valor_neto(tipo, bruto, ret_valor, iva_valor, propina)

    payload = {
        "fecha": fecha.isoformat(),
        "tipo": tipo,
        "valor_bruto": float(bruto),
        "retencion_fuente_tasa": float(ret_tasa),
        "retencion_fuente_valor": float(ret_valor),
        "iva_tasa": float(iva_tasa),
        "iva_valor": float(iva_valor),
        "iva_sentido": iva_sentido,
        "valor_neto": float(valor_neto),
        "categoria_id": categoria_id,
        "centro_costo_tipo": centro,
        "contrato_id": contrato_id,
        "fuente_ingreso": fuente,
        "notas": (data.get("notas") or "").strip() or None,
        "proveedor_razon_social": proveedor_razon,
        "proveedor_nit": proveedor_nit,
        "propina": float(propina),
        "updated_at": _now_iso(),
    }
    if not es_update:
        payload["origen"] = (data.get("origen") or "manual").strip().lower()
        if payload["origen"] not in {"manual", "orden_pago"}:
            payload["origen"] = "manual"
        if data.get("orden_pago_id") is not None:
            payload["orden_pago_id"] = int(data["orden_pago_id"])
    return payload


# ── Categorías ────────────────────────────────────────────────────────────────

def list_categorias(sb, *, solo_activas: bool = True) -> List[dict]:
    q = sb.table("contabilidad_categoria").select("*").order("orden")
    if solo_activas:
        q = q.eq("activo", True)
    return q.execute().data or []


def create_categoria(sb, data: dict, user_id: int) -> dict:
    codigo = (data.get("codigo") or "").strip().upper()
    nombre = (data.get("nombre") or "").strip()
    tipo = (data.get("tipo") or "").strip().lower()
    if not codigo or not nombre:
        raise ValueError("codigo y nombre son requeridos.")
    if tipo not in TX_TIPOS:
        raise ValueError("tipo debe ser ingreso o egreso.")
    if not re.match(r"^[A-Z0-9\-]{2,16}$", codigo):
        raise ValueError("codigo inválido (2-16 caracteres alfanuméricos o guión).")
    row = {
        "codigo": codigo,
        "nombre": nombre,
        "tipo": tipo,
        "activo": True,
        "orden": int(data.get("orden") or 0),
        "created_by": user_id,
    }
    ins = sb.table("contabilidad_categoria").insert(row).execute().data
    if not ins:
        raise RuntimeError("No se pudo crear la categoría.")
    return ins[0]


def update_categoria(sb, categoria_id: int, data: dict, user_id: int) -> dict:
    rows = (
        sb.table("contabilidad_categoria")
        .select("id")
        .eq("id", int(categoria_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Categoría no encontrada.")
    patch: dict = {"updated_at": _now_iso(), "updated_by": user_id}
    if "nombre" in data and data["nombre"] is not None:
        patch["nombre"] = str(data["nombre"]).strip()
    if "orden" in data and data["orden"] is not None:
        patch["orden"] = int(data["orden"])
    if "activo" in data and data["activo"] is not None:
        patch["activo"] = bool(data["activo"])
    sb.table("contabilidad_categoria").update(patch).eq("id", int(categoria_id)).execute()
    out = (
        sb.table("contabilidad_categoria")
        .select("*")
        .eq("id", int(categoria_id))
        .limit(1)
        .execute()
        .data
    )
    return out[0] if out else patch


# ── Transacciones ─────────────────────────────────────────────────────────────

def get_transaccion(sb, transaccion_id: int) -> dict:
    rows = (
        sb.table("contabilidad_transaccion")
        .select("*")
        .eq("id", int(transaccion_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Transacción no encontrada.")
    return _enriquecer_transaccion(sb, rows[0])


def list_transacciones(
    sb,
    *,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo: Optional[str] = None,
    categoria_id: Optional[int] = None,
    contrato_id: Optional[int] = None,
    estado: Optional[str] = "activa",
    limit: int = 500,
    offset: int = 0,
) -> dict:
    q = sb.table("contabilidad_transaccion").select("*", count="exact")
    if estado:
        q = q.eq("estado", estado)
    if fecha_desde:
        q = q.gte("fecha", str(fecha_desde)[:10])
    if fecha_hasta:
        q = q.lte("fecha", str(fecha_hasta)[:10])
    if tipo:
        q = q.eq("tipo", tipo.strip().lower())
    if categoria_id is not None:
        q = q.eq("categoria_id", int(categoria_id))
    if contrato_id is not None:
        q = q.eq("contrato_id", int(contrato_id))
    q = q.order("fecha", desc=True).order("id", desc=True)
    if offset:
        q = q.range(offset, offset + max(1, min(limit, 1000)) - 1)
    else:
        q = q.limit(max(1, min(limit, 1000)))
    res = q.execute()
    items = [_enriquecer_transaccion(sb, r) for r in (res.data or [])]
    return {"items": items, "total": res.count if res.count is not None else len(items)}


def create_transaccion(sb, data: dict, user_id: int) -> dict:
    payload = _validar_payload_transaccion(sb, data, es_update=False)
    payload["estado"] = "activa"
    payload["created_by"] = user_id
    ins = sb.table("contabilidad_transaccion").insert(payload).execute().data
    if not ins:
        raise RuntimeError("No se pudo crear la transacción.")
    row = ins[0]
    movs = _movimientos_para_transaccion(row)
    _insertar_movimientos(sb, movs, user_id)
    return _enriquecer_transaccion(sb, row)


def update_transaccion(sb, transaccion_id: int, data: dict, user_id: int) -> dict:
    prev = get_transaccion(sb, transaccion_id)
    if (prev.get("estado") or "").strip().lower() != "activa":
        raise ValueError("Solo se pueden editar transacciones activas.")
    merged = {**prev, **data}
    payload = _validar_payload_transaccion(sb, merged, es_update=True)
    payload["updated_by"] = user_id
    sb.table("contabilidad_transaccion").update(payload).eq("id", int(transaccion_id)).execute()
    row = get_transaccion(sb, transaccion_id)
    _eliminar_movimientos_transaccion(sb, transaccion_id)
    movs = _movimientos_para_transaccion(row)
    _insertar_movimientos(sb, movs, user_id)
    return row


def anular_transaccion(sb, transaccion_id: int, user_id: int) -> dict:
    prev = get_transaccion(sb, transaccion_id)
    if (prev.get("estado") or "").strip().lower() != "activa":
        raise ValueError("La transacción ya está anulada.")
    fecha = _parse_date(prev.get("fecha"))
    if _periodo_bloqueado(sb, fecha):
        raise ValueError("El período está cerrado; no se puede anular.")
    sb.table("contabilidad_transaccion").update({
        "estado": "anulada",
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(transaccion_id)).execute()
    _eliminar_movimientos_transaccion(sb, transaccion_id)
    return get_transaccion(sb, transaccion_id)


# ── Órdenes de pago facturadas ────────────────────────────────────────────────

def _categoria_licenciamiento_id(sb) -> int:
    rows = (
        sb.table("contabilidad_categoria")
        .select("id")
        .eq("codigo", "ING-LIC")
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Categoría ING-LIC no encontrada. Ejecute el seed SQL.")
    return int(rows[0]["id"])


def list_ordenes_pago_pendientes(sb) -> List[dict]:
    """Órdenes facturadas sin transacción de ingreso vinculada."""
    ordenes = (
        sb.table("contrato_orden_pago")
        .select(
            "id, contrato_id, numero_corte, estado, subtotal, iva_tasa, iva_valor, total, "
            "periodo_inicio, periodo_fin, fecha_emision, descripcion_servicio"
        )
        .eq("estado", "facturada")
        .order("fecha_emision", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    if not ordenes:
        return []
    ids = [int(o["id"]) for o in ordenes]
    vinculadas = (
        sb.table("contabilidad_transaccion")
        .select("orden_pago_id")
        .in_("orden_pago_id", ids)
        .eq("estado", "activa")
        .execute()
        .data
        or []
    )
    usadas = {int(v["orden_pago_id"]) for v in vinculadas if v.get("orden_pago_id") is not None}
    out = []
    contrato_ids = sorted({int(o["contrato_id"]) for o in ordenes if o.get("contrato_id") is not None})
    contratos_map: Dict[int, dict] = {}
    if contrato_ids:
        crows = (
            sb.table("contratos")
            .select("id, numero, objeto")
            .in_("id", contrato_ids)
            .execute()
            .data
            or []
        )
        contratos_map = {int(c["id"]): c for c in crows}
    for o in ordenes:
        if int(o["id"]) in usadas:
            continue
        item = dict(o)
        cid = o.get("contrato_id")
        if cid is not None:
            item["contrato"] = contratos_map.get(int(cid))
        out.append(item)
    return out


def create_transaccion_desde_orden(sb, orden_id: int, user_id: int, extras: Optional[dict] = None) -> dict:
    extras = extras or {}
    ordenes = (
        sb.table("contrato_orden_pago")
        .select("*")
        .eq("id", int(orden_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not ordenes:
        raise ValueError("Orden de pago no encontrada.")
    orden = ordenes[0]
    if (orden.get("estado") or "").strip().lower() != "facturada":
        raise ValueError("Solo se vinculan órdenes en estado facturada.")

    dup = (
        sb.table("contabilidad_transaccion")
        .select("id")
        .eq("orden_pago_id", int(orden_id))
        .eq("estado", "activa")
        .limit(1)
        .execute()
        .data
    )
    if dup:
        raise ValueError("Esta orden ya tiene una transacción de ingreso vinculada.")

    fecha = extras.get("fecha") or orden.get("fecha_emision") or orden.get("periodo_fin")
    data = {
        "fecha": fecha,
        "tipo": "ingreso",
        "valor_bruto": orden.get("subtotal"),
        "retencion_fuente_tasa": extras.get("retencion_fuente_tasa", 0),
        "retencion_fuente_valor": extras.get("retencion_fuente_valor", 0),
        "iva_tasa": orden.get("iva_tasa"),
        "iva_valor": orden.get("iva_valor"),
        "iva_sentido": "recaudado",
        "categoria_id": extras.get("categoria_id") or _categoria_licenciamiento_id(sb),
        "centro_costo_tipo": "contrato",
        "contrato_id": orden.get("contrato_id"),
        "fuente_ingreso": "licenciamiento",
        "notas": extras.get("notas") or f"Ingreso desde orden de pago corte #{orden.get('numero_corte')}",
        "orden_pago_id": int(orden_id),
        "origen": "orden_pago",
    }
    return create_transaccion(sb, data, user_id)


# ── Soportes ──────────────────────────────────────────────────────────────────

def _normalize_mime(content_type: Optional[str]) -> str:
    return (content_type or "application/octet-stream").split(";")[0].strip().lower()


def validate_soporte_upload(content_type: Optional[str], size: int) -> str:
    if size <= 0:
        raise ValueError("Archivo vacío.")
    if size > MAX_SOPORTE_BYTES:
        raise ValueError(f"El archivo supera el máximo de {MAX_SOPORTE_BYTES // (1024 * 1024)} MB.")
    mime = _normalize_mime(content_type)
    if mime not in SOPORTE_MIMES:
        raise ValueError("Formato no permitido. Use PDF o imagen (JPEG, PNG, WebP).")
    return mime


def _nombre_soporte_pdf(nombre_archivo: str) -> str:
    base = re.sub(r"\.[^.]+$", "", (nombre_archivo or "soporte").strip()) or "soporte"
    base = re.sub(r"[^\w.\-]", "_", base)[:200]
    return f"{base}.pdf"


def normalizar_soporte_bytes(
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
) -> Tuple[bytes, str, str]:
    """
    PDF se conserva; JPEG/PNG/WebP se convierten a PDF (mismo criterio que documentos firmados).
    Devuelve (bytes, mime, nombre_archivo).
    """
    mime = validate_soporte_upload(content_type, len(data))
    if mime == "application/pdf":
        name = (nombre_archivo or "soporte.pdf").strip()
        if not name.lower().endswith(".pdf"):
            name = _nombre_soporte_pdf(name)
        return data, mime, name[:255]

    from contrato_documentos_service import imagen_a_pdf

    pdf_bytes = imagen_a_pdf(data, mime)
    if len(pdf_bytes) > MAX_SOPORTE_BYTES:
        raise ValueError(
            f"El PDF generado supera el máximo de {MAX_SOPORTE_BYTES // (1024 * 1024)} MB."
        )
    return pdf_bytes, "application/pdf", _nombre_soporte_pdf(nombre_archivo or "soporte")


def upload_soporte_transaccion(
    sb,
    transaccion_id: int,
    data: bytes,
    content_type: Optional[str],
    nombre_archivo: str,
    user_id: int,
) -> dict:
    tx = get_transaccion(sb, transaccion_id)
    if (tx.get("estado") or "").strip().lower() != "activa":
        raise ValueError("Solo transacciones activas admiten soporte.")
    fecha = _parse_date(tx.get("fecha"))
    if _periodo_bloqueado(sb, fecha):
        raise ValueError("El período está cerrado; no se puede adjuntar soporte.")

    data, mime, nombre = normalizar_soporte_bytes(data, content_type, nombre_archivo or "soporte")
    old_path = (tx.get("soporte_azure_blob_path") or "").strip()
    blob_path = path_contabilidad_soporte(transaccion_id, nombre)
    upload_blob_private(blob_path, data, mime, overwrite=True)

    sb.table("contabilidad_transaccion").update({
        "soporte_azure_blob_path": blob_path,
        "soporte_nombre_archivo": nombre[:255],
        "soporte_mime_type": mime,
        "soporte_tamano_bytes": len(data),
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(transaccion_id)).execute()

    if old_path and old_path != blob_path:
        try:
            delete_blob_private(old_path)
        except Exception as exc:
            _log.warning("No se pudo eliminar soporte anterior %s: %s", old_path, exc)

    return get_transaccion(sb, transaccion_id)


def download_soporte_transaccion(sb, transaccion_id: int) -> Tuple[bytes, str, str]:
    tx = get_transaccion(sb, transaccion_id)
    path = (tx.get("soporte_azure_blob_path") or "").strip()
    if not path:
        raise ValueError("La transacción no tiene soporte adjunto.")
    data = download_blob_bytes_private(path)
    mime = (tx.get("soporte_mime_type") or "application/octet-stream").split(";")[0].strip()
    name = (tx.get("soporte_nombre_archivo") or "soporte").strip()
    return data, mime, name


def delete_soporte_transaccion(sb, transaccion_id: int, user_id: int) -> dict:
    tx = get_transaccion(sb, transaccion_id)
    path = (tx.get("soporte_azure_blob_path") or "").strip()
    if path:
        try:
            delete_blob_private(path)
        except Exception as exc:
            _log.warning("delete soporte %s: %s", path, exc)
    sb.table("contabilidad_transaccion").update({
        "soporte_azure_blob_path": None,
        "soporte_nombre_archivo": None,
        "soporte_mime_type": None,
        "soporte_tamano_bytes": None,
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(transaccion_id)).execute()
    return get_transaccion(sb, transaccion_id)


# ── Cuentas especiales ────────────────────────────────────────────────────────

def _sumar_saldos(sb) -> dict:
    rows = (
        sb.table("contabilidad_cuenta_movimiento")
        .select("cuenta_tipo, subcuenta, monto")
        .execute()
        .data
        or []
    )
    saldos: Dict[str, Dict[str, Decimal]] = {
        "operativa": {"general": Decimal("0")},
        "capitalizacion": {"licenciamiento": Decimal("0"), "servicios": Decimal("0")},
        "impuestos": {
            "iva_recaudado": Decimal("0"),
            "iva_pagado": Decimal("0"),
            "retencion_fuente": Decimal("0"),
        },
    }
    for r in rows:
        ct = (r.get("cuenta_tipo") or "").strip().lower()
        sc = (r.get("subcuenta") or "").strip().lower()
        if ct in saldos and sc in saldos[ct]:
            saldos[ct][sc] += _d(r.get("monto"))
    return {
        "operativa": {k: float(_money(v)) for k, v in saldos["operativa"].items()},
        "capitalizacion": {k: float(_money(v)) for k, v in saldos["capitalizacion"].items()},
        "impuestos": {k: float(_money(v)) for k, v in saldos["impuestos"].items()},
        "capitalizacion_total": float(
            _money(saldos["capitalizacion"]["licenciamiento"] + saldos["capitalizacion"]["servicios"])
        ),
        "impuestos_iva_neto": float(
            _money(saldos["impuestos"]["iva_recaudado"] - saldos["impuestos"]["iva_pagado"])
        ),
    }


def get_cuentas_especiales(sb) -> dict:
    return {"saldos": _sumar_saldos(sb), "capitalizacion_tasa": float(CAPITALIZACION_TASA)}


def list_movimientos_cuentas(
    sb,
    *,
    cuenta_tipo: Optional[str] = None,
    subcuenta: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    limit: int = 500,
) -> List[dict]:
    q = sb.table("contabilidad_cuenta_movimiento").select("*")
    if cuenta_tipo:
        q = q.eq("cuenta_tipo", cuenta_tipo.strip().lower())
    if subcuenta:
        q = q.eq("subcuenta", subcuenta.strip().lower())
    if fecha_desde:
        q = q.gte("fecha", str(fecha_desde)[:10])
    if fecha_hasta:
        q = q.lte("fecha", str(fecha_hasta)[:10])
    q = q.order("fecha", desc=True).order("id", desc=True).limit(max(1, min(limit, 1000)))
    return q.execute().data or []


# ── Contratos (centro de costo) ───────────────────────────────────────────────

def list_contratos_centro_costo(sb) -> List[dict]:
    """Contratos de la plataforma para el selector de centro de costo (número + nombre)."""
    rows = (
        sb.table("contratos")
        .select("id, numero, objeto, fase")
        .order("numero")
        .limit(500)
        .execute()
        .data
        or []
    )
    # Excluir liquidación si el campo existe; el resto se considera activo en plataforma.
    activos = []
    for r in rows:
        fase = (r.get("fase") or "").strip().upper()
        if fase == "LIQUIDACION":
            continue
        activos.append({
            "id": r.get("id"),
            "numero": r.get("numero"),
            "objeto": r.get("objeto"),
            "nombre": r.get("objeto"),
            "fase": r.get("fase"),
        })
    return activos


# ── Cierre mensual ────────────────────────────────────────────────────────────

def _validar_periodo(anio: int, mes: int) -> Tuple[int, int]:
    a = int(anio)
    m = int(mes)
    if a < 2020 or a > 2100:
        raise ValueError("Año inválido.")
    if m < 1 or m > 12:
        raise ValueError("Mes inválido (1-12).")
    return a, m


def _rango_mes(anio: int, mes: int) -> Tuple[str, str]:
    a, m = _validar_periodo(anio, mes)
    ultimo = monthrange(a, m)[1]
    return f"{a:04d}-{m:02d}-01", f"{a:04d}-{m:02d}-{ultimo:02d}"


def _transacciones_activas_periodo(sb, anio: int, mes: int) -> List[dict]:
    ini, fin = _rango_mes(anio, mes)
    return (
        sb.table("contabilidad_transaccion")
        .select("*")
        .eq("estado", "activa")
        .gte("fecha", ini)
        .lte("fecha", fin)
        .order("fecha")
        .order("id")
        .execute()
        .data
        or []
    )


def _sumar_saldos_hasta(sb, fecha_hasta: str) -> dict:
    rows = (
        sb.table("contabilidad_cuenta_movimiento")
        .select("cuenta_tipo, subcuenta, monto")
        .lte("fecha", str(fecha_hasta)[:10])
        .execute()
        .data
        or []
    )
    saldos: Dict[str, Dict[str, Decimal]] = {
        "operativa": {"general": Decimal("0")},
        "capitalizacion": {"licenciamiento": Decimal("0"), "servicios": Decimal("0")},
        "impuestos": {
            "iva_recaudado": Decimal("0"),
            "iva_pagado": Decimal("0"),
            "retencion_fuente": Decimal("0"),
        },
    }
    for r in rows:
        ct = (r.get("cuenta_tipo") or "").strip().lower()
        sc = (r.get("subcuenta") or "").strip().lower()
        if ct in saldos and sc in saldos[ct]:
            saldos[ct][sc] += _d(r.get("monto"))
    cap_lic = _money(saldos["capitalizacion"]["licenciamiento"])
    cap_srv = _money(saldos["capitalizacion"]["servicios"])
    iva_neto = _money(saldos["impuestos"]["iva_recaudado"] - saldos["impuestos"]["iva_pagado"])
    ret = _money(saldos["impuestos"]["retencion_fuente"])
    oper = _money(saldos["operativa"]["general"])
    return {
        "saldo_operativa": float(oper),
        "saldo_capitalizacion_lic": float(cap_lic),
        "saldo_capitalizacion_srv": float(cap_srv),
        "saldo_impuestos_iva_neto": float(iva_neto),
        "saldo_impuestos_retencion": float(ret),
        "saldos_detalle": {
            "operativa": {k: float(_money(v)) for k, v in saldos["operativa"].items()},
            "capitalizacion": {k: float(_money(v)) for k, v in saldos["capitalizacion"].items()},
            "impuestos": {k: float(_money(v)) for k, v in saldos["impuestos"].items()},
        },
    }


def _movimientos_impuestos_periodo(sb, anio: int, mes: int) -> dict:
    ini, fin = _rango_mes(anio, mes)
    rows = (
        sb.table("contabilidad_cuenta_movimiento")
        .select("subcuenta, monto")
        .eq("cuenta_tipo", "impuestos")
        .gte("fecha", ini)
        .lte("fecha", fin)
        .execute()
        .data
        or []
    )
    agg = {
        "iva_recaudado": Decimal("0"),
        "iva_pagado": Decimal("0"),
        "retencion_fuente": Decimal("0"),
    }
    for r in rows:
        sc = (r.get("subcuenta") or "").strip().lower()
        if sc in agg:
            agg[sc] += _d(r.get("monto"))
    iva_neto = _money(agg["iva_recaudado"] - agg["iva_pagado"])
    return {
        "iva_recaudado_periodo": float(_money(agg["iva_recaudado"])),
        "iva_pagado_periodo": float(_money(agg["iva_pagado"])),
        "iva_neto_periodo": float(iva_neto),
        "retencion_periodo": float(_money(agg["retencion_fuente"])),
    }


def _calcular_resumen_cierre(sb, anio: int, mes: int) -> dict:
    txs = _transacciones_activas_periodo(sb, anio, mes)
    ini, fin = _rango_mes(anio, mes)

    ingresos_brutos = Decimal("0")
    egresos_brutos = Decimal("0")
    deducciones = Decimal("0")
    flujo_ingresos = Decimal("0")
    flujo_egresos = Decimal("0")
    por_categoria: Dict[str, dict] = {}

    for tx in txs:
        bruto = _d(tx.get("valor_bruto"))
        ret = _d(tx.get("retencion_fuente_valor"))
        iva = _d(tx.get("iva_valor"))
        neto = _d(tx.get("valor_neto"))
        tipo = (tx.get("tipo") or "").strip().lower()
        cat_id = str(tx.get("categoria_id") or "0")

        if cat_id not in por_categoria:
            por_categoria[cat_id] = {
                "categoria_id": tx.get("categoria_id"),
                "ingresos_brutos": 0.0,
                "egresos_brutos": 0.0,
                "transacciones": 0,
            }
        por_categoria[cat_id]["transacciones"] += 1

        if tipo == "ingreso":
            ingresos_brutos += bruto
            deducciones += ret
            flujo_ingresos += neto
            por_categoria[cat_id]["ingresos_brutos"] += float(_money(bruto))
        elif tipo == "egreso":
            egresos_brutos += bruto
            deducciones += ret
            flujo_egresos += neto
            por_categoria[cat_id]["egresos_brutos"] += float(_money(bruto))

    utilidad = _money(ingresos_brutos - deducciones - egresos_brutos)
    flujo = _money(flujo_ingresos - flujo_egresos)
    saldos = _sumar_saldos_hasta(sb, fin)
    tributos_periodo = _movimientos_impuestos_periodo(sb, anio, mes)

    obligaciones = {
        "periodo": {"anio": anio, "mes": mes, "desde": ini, "hasta": fin},
        **tributos_periodo,
        "iva_neto_acumulado": saldos["saldo_impuestos_iva_neto"],
        "retencion_acumulada": saldos["saldo_impuestos_retencion"],
        "proyeccion_declaracion_iva": tributos_periodo["iva_neto_periodo"],
        "proyeccion_retenciones": tributos_periodo["retencion_periodo"],
    }

    detalle = {
        "transacciones_total": len(txs),
        "transacciones_ids": [int(t["id"]) for t in txs],
        "por_categoria": list(por_categoria.values()),
        "flujo_ingresos": float(_money(flujo_ingresos)),
        "flujo_egresos": float(_money(flujo_egresos)),
        "deducciones_retencion": float(_money(deducciones)),
        "capitalizacion_tasa": float(CAPITALIZACION_TASA),
        "capitalizacion_sin_distribucion": True,
    }

    return {
        "ingresos_brutos": float(_money(ingresos_brutos)),
        "total_deducciones": float(_money(deducciones)),
        "total_gastos": float(_money(egresos_brutos)),
        "utilidad_neta": float(utilidad),
        "flujo_caja_neto": float(flujo),
        **{k: saldos[k] for k in (
            "saldo_operativa",
            "saldo_capitalizacion_lic",
            "saldo_capitalizacion_srv",
            "saldo_impuestos_iva_neto",
            "saldo_impuestos_retencion",
        )},
        "obligaciones_tributarias": obligaciones,
        "detalle_calculo": detalle,
    }


def _enriquecer_cierre(sb, row: dict) -> dict:
    out = dict(row)
    for campo_uid, campo_nombre in (
        ("firmado_por_usuario_id", "firmado_por"),
        ("aprobado_por_usuario_id", "aprobado_por"),
        ("created_by", "creado_por"),
    ):
        uid = row.get(campo_uid)
        if uid:
            u = (
                sb.table("usuarios")
                .select("id, nombre, apellidos, email")
                .eq("id", int(uid))
                .limit(1)
                .execute()
                .data
            )
            if u:
                nombre = f"{u[0].get('nombre', '')} {u[0].get('apellidos', '')}".strip()
                out[campo_nombre] = {
                    "id": u[0]["id"],
                    "nombre": nombre or u[0].get("email"),
                    "email": u[0].get("email"),
                }
    return out


def get_cierre(sb, cierre_id: int) -> dict:
    rows = (
        sb.table("contabilidad_cierre_mensual")
        .select("*")
        .eq("id", int(cierre_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise ValueError("Cierre mensual no encontrado.")
    return _enriquecer_cierre(sb, rows[0])


def list_cierres(sb, *, limit: int = 120) -> List[dict]:
    rows = (
        sb.table("contabilidad_cierre_mensual")
        .select("*")
        .order("anio", desc=True)
        .order("mes", desc=True)
        .limit(max(1, min(limit, 200)))
        .execute()
        .data
        or []
    )
    return [_enriquecer_cierre(sb, r) for r in rows]


def _get_cierre_periodo(sb, anio: int, mes: int) -> Optional[dict]:
    rows = (
        sb.table("contabilidad_cierre_mensual")
        .select("*")
        .eq("anio", int(anio))
        .eq("mes", int(mes))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def generar_cierre_mensual(sb, anio: int, mes: int, user_id: int) -> dict:
    a, m = _validar_periodo(anio, mes)
    existente = _get_cierre_periodo(sb, a, m)
    if existente and (existente.get("estado") or "").strip().lower() == "aprobado":
        raise ValueError("El período ya tiene un cierre aprobado; no se puede regenerar.")

    resumen = _calcular_resumen_cierre(sb, a, m)
    payload = {
        **resumen,
        "anio": a,
        "mes": m,
        "estado": "borrador",
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }

    if existente:
        cid = int(existente["id"])
        notas = existente.get("notas_contador")
        if notas is not None:
            payload["notas_contador"] = notas
        sb.table("contabilidad_cierre_mensual").update(payload).eq("id", cid).execute()
        return get_cierre(sb, cid)

    payload["created_by"] = user_id
    ins = sb.table("contabilidad_cierre_mensual").insert(payload).execute().data
    if not ins:
        raise RuntimeError("No se pudo crear el cierre mensual.")
    return get_cierre(sb, int(ins[0]["id"]))


def update_notas_cierre(sb, cierre_id: int, notas: Optional[str], user_id: int) -> dict:
    cierre = get_cierre(sb, cierre_id)
    estado = (cierre.get("estado") or "").strip().lower()
    if estado == "aprobado" and cierre.get("firma_contenido_hash"):
        raise ValueError("El cierre ya está firmado; las notas no se pueden modificar.")
    if estado not in {"borrador", "aprobado"}:
        raise ValueError("Estado de cierre inválido.")

    sb.table("contabilidad_cierre_mensual").update({
        "notas_contador": (notas or "").strip() or None,
        "updated_at": _now_iso(),
        "updated_by": user_id,
    }).eq("id", int(cierre_id)).execute()
    return get_cierre(sb, cierre_id)


def _hash_firma_cierre(cierre: dict, user_id: int, firmado_at: str) -> str:
    payload = {
        "anio": cierre.get("anio"),
        "mes": cierre.get("mes"),
        "estado": cierre.get("estado"),
        "ingresos_brutos": cierre.get("ingresos_brutos"),
        "total_deducciones": cierre.get("total_deducciones"),
        "total_gastos": cierre.get("total_gastos"),
        "utilidad_neta": cierre.get("utilidad_neta"),
        "flujo_caja_neto": cierre.get("flujo_caja_neto"),
        "saldo_operativa": cierre.get("saldo_operativa"),
        "saldo_capitalizacion_lic": cierre.get("saldo_capitalizacion_lic"),
        "saldo_capitalizacion_srv": cierre.get("saldo_capitalizacion_srv"),
        "saldo_impuestos_iva_neto": cierre.get("saldo_impuestos_iva_neto"),
        "saldo_impuestos_retencion": cierre.get("saldo_impuestos_retencion"),
        "obligaciones_tributarias": cierre.get("obligaciones_tributarias"),
        "notas_contador": cierre.get("notas_contador"),
        "firmado_por_usuario_id": user_id,
        "firmado_at": firmado_at,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def aprobar_cierre_mensual(sb, cierre_id: int, user_id: int) -> dict:
    cierre = get_cierre(sb, cierre_id)
    if (cierre.get("estado") or "").strip().lower() != "borrador":
        raise ValueError("Solo se pueden aprobar cierres en estado borrador.")

    a, m = int(cierre["anio"]), int(cierre["mes"])
    resumen = _calcular_resumen_cierre(sb, a, m)
    ini, fin = _rango_mes(a, m)
    ahora = _now_iso()

    sb.table("contabilidad_cierre_mensual").update({
        **resumen,
        "estado": "aprobado",
        "aprobado_por_usuario_id": user_id,
        "aprobado_at": ahora,
        "updated_at": ahora,
        "updated_by": user_id,
    }).eq("id", int(cierre_id)).execute()

    sb.table("contabilidad_transaccion").update({
        "cierre_mensual_id": int(cierre_id),
        "updated_at": ahora,
        "updated_by": user_id,
    }).eq("estado", "activa").gte("fecha", ini).lte("fecha", fin).execute()

    sb.table("contabilidad_cuenta_movimiento").update({
        "cierre_mensual_id": int(cierre_id),
    }).gte("fecha", ini).lte("fecha", fin).execute()

    return get_cierre(sb, cierre_id)


def firmar_cierre_mensual(
    sb,
    cierre_id: int,
    user_id: int,
    *,
    notas: Optional[str] = None,
) -> dict:
    cierre = get_cierre(sb, cierre_id)
    if (cierre.get("estado") or "").strip().lower() != "aprobado":
        raise ValueError("Solo se pueden firmar cierres aprobados.")
    if cierre.get("firma_contenido_hash"):
        raise ValueError("El cierre ya fue firmado.")

    if notas is not None:
        cierre["notas_contador"] = (notas or "").strip() or None

    firmado_at = _now_iso()
    firma_hash = _hash_firma_cierre(cierre, user_id, firmado_at)

    patch = {
        "firmado_por_usuario_id": user_id,
        "firmado_at": firmado_at,
        "firma_contenido_hash": firma_hash,
        "updated_at": firmado_at,
        "updated_by": user_id,
    }
    if notas is not None:
        patch["notas_contador"] = cierre.get("notas_contador")

    sb.table("contabilidad_cierre_mensual").update(patch).eq("id", int(cierre_id)).execute()
    out = get_cierre(sb, cierre_id)
    out["firma_verificacion"] = {
        "algoritmo": "SHA-256",
        "hash": firma_hash,
        "firmado_at": firmado_at,
    }
    return out

