"""
Rutas HTTP — órdenes de pago licenciamiento (solo Desarrollador).

Prefijo: /admin/contratos/.../ordenes-pago
"""
from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from contrato_orden_pago_pdf import PDFOrdenPagoError
from contrato_orden_pago_service import (
    _parse_date,
    download_orden_pago_bytes,
    eliminar_orden_pago,
    generar_orden_pago,
    get_cobro_config,
    get_orden_pago,
    list_ordenes_pago,
    resumen_ordenes_pago,
    update_orden_estado,
    upsert_cobro_config,
)
from main import get_supabase, registrar_log, require_solo_desarrollador

_log = logging.getLogger("claracore.contrato_orden_pago.routes")

router = APIRouter(tags=["contratos-ordenes-pago"])


def _http_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "no encontrado" in msg.lower() or "no encontrada" in msg.lower():
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=400, detail=msg)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _audit_user(current_user, contrato_id: int) -> dict:
    u = dict(current_user or {})
    u["contrato_id"] = int(contrato_id)
    return u


class CobroConfigBody(BaseModel):
    plan_descripcion: Optional[str] = Field(None, max_length=500)
    tipo_periodo: str = Field("mensual", max_length=16)
    dia_vencimiento: int = Field(7, ge=1, le=28)
    logo_receptor: str = Field("contratista", max_length=20)
    autorizo_usuario_id: Optional[int] = Field(None, ge=1)
    autorizo_nombre: Optional[str] = Field(None, max_length=300)
    autorizo_cargo: Optional[str] = Field(None, max_length=300)
    correos_notificacion: Optional[List[str]] = Field(default_factory=list)


class GenerarOrdenBody(BaseModel):
    periodo_inicio: str = Field(..., description="YYYY-MM-DD")
    periodo_fin: str = Field(..., description="YYYY-MM-DD")
    fecha_emision: Optional[str] = Field(None, description="YYYY-MM-DD")
    fecha_vencimiento: str = Field(..., description="YYYY-MM-DD")
    descripcion_servicio: Optional[str] = Field(None, max_length=500)


class OrdenEstadoBody(BaseModel):
    estado: str = Field(..., min_length=1, max_length=20)


@router.get("/admin/contratos/{contrato_id}/ordenes-pago")
def obtener_resumen_ordenes_pago(
    contrato_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    try:
        return resumen_ordenes_pago(sb, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/admin/contratos/{contrato_id}/ordenes-pago/config")
def obtener_config_cobro(
    contrato_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    try:
        return {"config": get_cobro_config(sb, contrato_id)}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/admin/contratos/{contrato_id}/ordenes-pago/config")
def guardar_config_cobro(
    contrato_id: int,
    body: CobroConfigBody,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        cfg = upsert_cobro_config(sb, contrato_id, body.dict(), uid)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"ok": True, "config": cfg}


@router.get("/admin/contratos/{contrato_id}/ordenes-pago/prefill")
def prefill_orden_pago(
    contrato_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    try:
        return resumen_ordenes_pago(sb, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/admin/contratos/{contrato_id}/ordenes-pago/generar")
def generar_orden_pago_pdf(
    contrato_id: int,
    body: GenerarOrdenBody,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        pi = _parse_date(body.periodo_inicio)
        pf = _parse_date(body.periodo_fin)
        fv = _parse_date(body.fecha_vencimiento)
        if not pi or not pf or not fv:
            raise ValueError("Fechas inválidas (use YYYY-MM-DD)")
        from contrato_orden_pago_service import _bogota_today

        fe = _parse_date(body.fecha_emision) or _bogota_today()
        orden = generar_orden_pago(
            sb,
            contrato_id=contrato_id,
            periodo_inicio=pi,
            periodo_fin=pf,
            fecha_emision=fe,
            fecha_vencimiento=fv,
            user_id=uid,
            descripcion_servicio=body.descripcion_servicio,
        )
    except PDFOrdenPagoError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except RuntimeError as exc:
        _log.exception("generar orden pago contrato_id=%s", contrato_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "CREAR",
        "ADMIN",
        "contrato_orden_pago",
        str(orden.get("id")),
        {
            "accion": "generar_orden_pago",
            "contrato_id": contrato_id,
            "numero_corte": orden.get("numero_corte"),
            "total_a_pagar": orden.get("total_a_pagar"),
        },
    )
    return {"ok": True, "orden": orden}


@router.patch("/admin/contratos/{contrato_id}/ordenes-pago/{orden_id}/estado")
def cambiar_estado_orden_pago(
    contrato_id: int,
    orden_id: int,
    body: OrdenEstadoBody,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    prev = get_orden_pago(sb, orden_id, contrato_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    try:
        row = update_orden_estado(sb, orden_id, contrato_id, body.estado, uid)
    except ValueError as exc:
        raise _http_value_error(exc) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "EDITAR",
        "ADMIN",
        "contrato_orden_pago",
        str(orden_id),
        {
            "accion": "cambio_estado_orden_pago",
            "estado_anterior": prev.get("estado"),
            "estado_nuevo": row.get("estado"),
        },
    )
    return {"ok": True, "orden": row}


@router.get("/admin/contratos/{contrato_id}/ordenes-pago/{orden_id}/archivo")
def descargar_orden_pago(
    contrato_id: int,
    orden_id: int,
    inline: bool = Query(False),
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    orden = get_orden_pago(sb, orden_id, contrato_id)
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    try:
        data, mime, filename = download_orden_pago_bytes(orden)
    except Exception as exc:
        _log.warning("descarga orden %s: %s", orden_id, exc)
        raise HTTPException(status_code=404, detail="No se pudo leer el archivo") from exc
    disposition = "inline" if inline else "attachment"
    safe = filename.replace('"', "'")
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={
            "Content-Disposition": f'{disposition}; filename="{safe}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/admin/contratos/{contrato_id}/ordenes-pago/{orden_id}")
def eliminar_orden_pago_route(
    contrato_id: int,
    orden_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    prev = get_orden_pago(sb, orden_id, contrato_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    try:
        result = eliminar_orden_pago(sb, orden_id, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "ELIMINAR",
        "ADMIN",
        "contrato_orden_pago",
        str(orden_id),
        {
            "accion": "eliminar_orden_pago",
            "numero_corte": result.get("numero_corte"),
            "consecutivo_liberado": result.get("consecutivo_liberado"),
        },
        valor_anterior={
            "numero_corte": prev.get("numero_corte"),
            "estado": prev.get("estado"),
            "total_a_pagar": prev.get("total_a_pagar"),
        },
    )
    return {"ok": True, **result, "eliminado_por": uid}
