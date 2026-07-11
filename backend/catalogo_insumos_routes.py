"""
Rutas HTTP — Catálogo de insumos (panel administrativo).
Prefijo: /catalogo-insumos
"""
from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from catalogo_insumos_permissions import require_permiso_catalogo_insumos
from catalogo_insumos_service import (
    create_insumo_catalogo,
    find_duplicados,
    get_almacen_config,
    get_csv_template,
    import_csv_insumos,
    list_catalogo_insumos,
    list_cotizaciones_soporte,
    list_precio_historial,
    map_ocr_to_cotizacion,
    update_insumo_catalogo,
)
from contabilidad_ocr import analyze_invoice_bytes, ocr_configured
from main import _require_contract_access, get_current_user, registrar_log

_log = logging.getLogger("claracore.catalogo_insumos.routes")

router = APIRouter(prefix="/catalogo-insumos", tags=["catalogo-insumos"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _http_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "no encontrad" in msg.lower():
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=400, detail=msg)


def _check_contrato(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, contrato_id)


class DuplicadoCheckBody(BaseModel):
    proveedor_id: int
    descripcion: str
    exclude_insumo_id: Optional[int] = None


class InsumoCatalogoJsonBody(BaseModel):
    codigo: str
    descripcion: str
    unidad: str = "UND"
    costo_base: float
    rendimiento: Optional[float] = None
    tipo_impuesto: Optional[str] = None
    impuesto_porcentaje: Optional[float] = None
    proveedor_id: Optional[int] = None
    razon_social: Optional[str] = None
    nit: Optional[str] = None
    cotizacion_numero: Optional[str] = None
    cotizacion_fecha: Optional[str] = None
    cotizacion_vigencia: Optional[str] = None
    force_update_id: Optional[int] = None


@router.get("/{contrato_id}/config")
def route_config(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return get_almacen_config(contrato_id)


@router.get("/{contrato_id}/insumos")
def route_list_insumos(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    rows, total = list_catalogo_insumos(contrato_id, q, min(limit, 100), max(offset, 0))
    return {"items": rows, "total": total}


@router.get("/{contrato_id}/insumos/{insumo_id}/historial")
def route_historial(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    try:
        return list_precio_historial(contrato_id, insumo_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/insumos/{insumo_id}/cotizaciones-soporte")
def route_soportes(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    try:
        return list_cotizaciones_soporte(contrato_id, insumo_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/check-duplicado")
def route_check_duplicado(
    contrato_id: int,
    body: DuplicadoCheckBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    dups = find_duplicados(
        contrato_id,
        body.proveedor_id,
        body.descripcion,
        body.exclude_insumo_id,
    )
    return {"duplicados": dups, "hay_duplicado": len(dups) > 0}


@router.post("/{contrato_id}/insumos")
async def route_create_insumo(
    contrato_id: int,
    codigo: str = Form(...),
    descripcion: str = Form(...),
    unidad: str = Form("UND"),
    costo_base: float = Form(...),
    rendimiento: Optional[float] = Form(None),
    tipo_impuesto: Optional[str] = Form(None),
    impuesto_porcentaje: Optional[float] = Form(None),
    proveedor_id: Optional[int] = Form(None),
    razon_social: Optional[str] = Form(None),
    nit: Optional[str] = Form(None),
    cotizacion_numero: Optional[str] = Form(None),
    cotizacion_fecha: Optional[str] = Form(None),
    cotizacion_vigencia: Optional[str] = Form(None),
    force_update_id: Optional[int] = Form(None),
    cotizacion_ganadora_pdf: Optional[UploadFile] = File(None),
    cotizaciones_soporte: List[UploadFile] = File(default=[]),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    body = {
        "codigo": codigo,
        "descripcion": descripcion,
        "unidad": unidad,
        "costo_base": costo_base,
        "rendimiento": rendimiento,
        "tipo_impuesto": tipo_impuesto,
        "impuesto_porcentaje": impuesto_porcentaje,
        "proveedor_id": proveedor_id,
        "razon_social": razon_social,
        "nit": nit,
        "cotizacion_numero": cotizacion_numero,
        "cotizacion_fecha": cotizacion_fecha,
        "cotizacion_vigencia": cotizacion_vigencia,
    }
    ganadora = None
    if cotizacion_ganadora_pdf and cotizacion_ganadora_pdf.filename:
        data = await cotizacion_ganadora_pdf.read()
        ganadora = (data, cotizacion_ganadora_pdf.filename, cotizacion_ganadora_pdf.content_type or "application/pdf")
    soportes = []
    for f in cotizaciones_soporte or []:
        if f and f.filename:
            data = await f.read()
            soportes.append((data, f.filename, f.content_type or "application/pdf"))
    try:
        result = create_insumo_catalogo(
            contrato_id, _uid(current_user), body,
            ganadora_pdf=ganadora,
            soporte_pdfs=soportes or None,
            force_update_id=force_update_id,
        )
        registrar_log(
            current_user, "CREAR" if not force_update_id else "EDITAR",
            "CATALOGO_INSUMOS", "almacen_insumo", str(result.get("insumo_id") or result.get("id")),
            {"codigo": codigo},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/insumos/{insumo_id}")
async def route_update_insumo(
    contrato_id: int,
    insumo_id: int,
    codigo: str = Form(...),
    descripcion: str = Form(...),
    unidad: str = Form("UND"),
    costo_base: float = Form(...),
    rendimiento: Optional[float] = Form(None),
    tipo_impuesto: Optional[str] = Form(None),
    impuesto_porcentaje: Optional[float] = Form(None),
    proveedor_id: Optional[int] = Form(None),
    razon_social: Optional[str] = Form(None),
    nit: Optional[str] = Form(None),
    cotizacion_numero: Optional[str] = Form(None),
    cotizacion_fecha: Optional[str] = Form(None),
    cotizacion_vigencia: Optional[str] = Form(None),
    cotizacion_ganadora_pdf: Optional[UploadFile] = File(None),
    cotizaciones_soporte: List[UploadFile] = File(default=[]),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "editar")
    body = {
        "codigo": codigo,
        "descripcion": descripcion,
        "unidad": unidad,
        "costo_base": costo_base,
        "rendimiento": rendimiento,
        "tipo_impuesto": tipo_impuesto,
        "impuesto_porcentaje": impuesto_porcentaje,
        "proveedor_id": proveedor_id,
        "razon_social": razon_social,
        "nit": nit,
        "cotizacion_numero": cotizacion_numero,
        "cotizacion_fecha": cotizacion_fecha,
        "cotizacion_vigencia": cotizacion_vigencia,
    }
    ganadora = None
    if cotizacion_ganadora_pdf and cotizacion_ganadora_pdf.filename:
        data = await cotizacion_ganadora_pdf.read()
        ganadora = (data, cotizacion_ganadora_pdf.filename, cotizacion_ganadora_pdf.content_type or "application/pdf")
    soportes = []
    for f in cotizaciones_soporte or []:
        if f and f.filename:
            data = await f.read()
            soportes.append((data, f.filename, f.content_type or "application/pdf"))
    try:
        result = update_insumo_catalogo(
            contrato_id, insumo_id, _uid(current_user), body,
            ganadora_pdf=ganadora,
            soporte_pdfs=soportes or None,
        )
        registrar_log(
            current_user, "EDITAR", "CATALOGO_INSUMOS", "almacen_insumo", str(insumo_id),
            {"codigo": codigo},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/insumos/json")
def route_create_insumo_json(
    contrato_id: int,
    body: InsumoCatalogoJsonBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    try:
        return create_insumo_catalogo(
            contrato_id, _uid(current_user), body.model_dump(),
            force_update_id=body.force_update_id,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/import/plantilla.csv")
def route_csv_plantilla(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    content = get_csv_template()
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="plantilla_catalogo_insumos.csv"'},
    )


@router.post("/{contrato_id}/import/csv")
async def route_import_csv(
    contrato_id: int,
    archivo: UploadFile = File(...),
    modo: str = Form("agregar"),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    raw = await archivo.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    try:
        result = import_csv_insumos(contrato_id, _uid(current_user), text, modo=modo)
        registrar_log(
            current_user, "IMPORTAR", "CATALOGO_INSUMOS", "almacen_insumo", str(contrato_id),
            {"modo": modo, "creados": result.get("creados"), "actualizados": result.get("actualizados"), "desactivados": result.get("desactivados")},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/ocr/cotizacion")
async def route_ocr_cotizacion(
    contrato_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """OCR de cotización ganadora — reutiliza contabilidad_ocr sin modificar Contabilidad."""
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    data = await archivo.read()
    if not data:
        return {
            "ok": False,
            "configured": ocr_configured(),
            "status": "empty",
            "sugerencias": {},
            "campos_catalogo": {},
        }
    result = analyze_invoice_bytes(data, archivo.content_type)
    campos = map_ocr_to_cotizacion(result)
    result["campos_catalogo"] = campos
    return result
