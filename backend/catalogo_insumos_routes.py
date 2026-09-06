"""
Rutas HTTP — Catálogo de insumos (panel administrativo).
Prefijo: /catalogo-insumos
"""
from __future__ import annotations

import io
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from catalogo_insumos_permissions import require_permiso_catalogo_insumos
from catalogo_insumos_service import (
    check_cotizacion_numero_incongruencia,
    create_insumo_catalogo,
    delete_insumo_catalogo,
    delete_proveedor_catalogo,
    download_cotizacion_pdf,
    find_duplicados,
    get_almacen_config,
    get_csv_template,
    get_csv_template_proveedores,
    import_csv_insumos,
    import_csv_proveedores,
    list_biblioteca_cotizaciones,
    list_catalogo_insumos,
    list_cotizaciones_soporte,
    list_precio_historial,
    list_proveedores_catalogo,
    get_insumo_catalogo,
    map_ocr_to_cotizacion,
    next_codigo_insumo,
    resolve_cotizacion_by_numero,
    suggest_cotizaciones_numero,
    update_insumo_catalogo,
)
from almacen_insumos_service import normalize_tributos, search_proveedores
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
    tributos: Optional[Dict[str, Any]] = None
    proveedor_id: Optional[int] = None
    razon_social: Optional[str] = None
    nit: Optional[str] = None
    cotizacion_numero: Optional[str] = None
    cotizacion_fecha: Optional[str] = None
    cotizacion_vigencia: Optional[str] = None
    cotizaciones_detalle: Optional[List[Dict[str, Any]]] = None
    force_update_id: Optional[int] = None


def _parse_tributos_form(raw: Optional[str]) -> Dict[str, Any]:
    if raw is None or str(raw).strip() == "":
        return normalize_tributos({})
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="tributos debe ser JSON válido.") from exc
    return normalize_tributos(data)


@router.get("/{contrato_id}/config")
def route_config(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return get_almacen_config(contrato_id)


@router.get("/{contrato_id}/proveedores")
def route_list_proveedores(
    contrato_id: int,
    q: str = "",
    limit: int = 100,
    offset: int = 0,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    rows, total = list_proveedores_catalogo(contrato_id, q, min(limit, 200), max(offset, 0))
    return {"items": rows, "total": total}


@router.get("/{contrato_id}/proveedores/search")
def route_search_proveedores(
    contrato_id: int,
    q: str = "",
    limit: int = 25,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return search_proveedores(contrato_id, q, min(limit, 50))


@router.delete("/{contrato_id}/proveedores/{proveedor_id}")
def route_delete_proveedor(contrato_id: int, proveedor_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "eliminar")
    try:
        result = delete_proveedor_catalogo(contrato_id, proveedor_id)
        registrar_log(
            current_user, "ELIMINAR", "CATALOGO_INSUMOS", "almacen_proveedor", str(proveedor_id),
            {"razon_social": result.get("razon_social")},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/next-codigo")
def route_next_codigo(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return {"codigo": next_codigo_insumo(contrato_id)}


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


@router.get("/{contrato_id}/insumos/{insumo_id}")
def route_get_insumo(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    try:
        return get_insumo_catalogo(contrato_id, insumo_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


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


class CotizacionNumeroCheckBody(BaseModel):
    numero: str
    proveedor_id: Optional[int] = None
    razon_social: Optional[str] = None
    nit: Optional[str] = None
    exclude_insumo_id: Optional[int] = None


@router.get("/{contrato_id}/cotizaciones/biblioteca")
def route_biblioteca_cotizaciones(
    contrato_id: int,
    proveedor_id: Optional[int] = None,
    q: str = "",
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return list_biblioteca_cotizaciones(contrato_id, proveedor_id=proveedor_id, q=q)


@router.get("/{contrato_id}/cotizaciones/suggest")
def route_suggest_cotizaciones(
    contrato_id: int,
    q: str = "",
    proveedor_id: Optional[int] = None,
    razon_social: str = "",
    nit: str = "",
    limit: int = 25,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    return suggest_cotizaciones_numero(
        contrato_id,
        q=q,
        proveedor_id=proveedor_id,
        razon_social=razon_social,
        nit=nit,
        limit=limit,
    )


@router.get("/{contrato_id}/cotizaciones/by-numero")
def route_cotizacion_by_numero(
    contrato_id: int,
    numero: str = "",
    proveedor_id: Optional[int] = None,
    razon_social: str = "",
    nit: str = "",
    tipo: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Autocarga de metadatos/PDF de una cotización ya registrada (mismo proveedor)."""
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    try:
        return resolve_cotizacion_by_numero(
            contrato_id,
            numero,
            proveedor_id=proveedor_id,
            razon_social=razon_social,
            nit=nit,
            tipo=tipo,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/cotizaciones/pdf")
def route_download_cotizacion_pdf(
    contrato_id: int,
    kind: str,
    source_insumo_id: int,
    soporte_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    """Descarga el PDF ya adjunto a una cotización registrada (para reutilizarlo)."""
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    try:
        data, mime, nombre = download_cotizacion_pdf(
            contrato_id,
            kind=kind,
            source_insumo_id=source_insumo_id,
            soporte_id=soporte_id,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    headers = {
        "Content-Disposition": f'inline; filename="{nombre}"',
        "X-Filename": nombre,
    }
    return StreamingResponse(io.BytesIO(data), media_type=mime or "application/pdf", headers=headers)


@router.post("/{contrato_id}/cotizaciones/check-numero")
def route_check_cotizacion_numero(
    contrato_id: int,
    body: CotizacionNumeroCheckBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    return check_cotizacion_numero_incongruencia(
        contrato_id,
        body.numero,
        proveedor_id=body.proveedor_id,
        razon_social=body.razon_social or "",
        nit=body.nit or "",
        exclude_insumo_id=body.exclude_insumo_id,
    )


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
    tributos: Optional[str] = Form(None),
    proveedor_id: Optional[int] = Form(None),
    razon_social: Optional[str] = Form(None),
    nit: Optional[str] = Form(None),
    contacto_email: Optional[str] = Form(None),
    contacto_nombre: Optional[str] = Form(None),
    contacto_telefono: Optional[str] = Form(None),
    cotizacion_numero: Optional[str] = Form(None),
    cotizacion_fecha: Optional[str] = Form(None),
    cotizacion_vigencia: Optional[str] = Form(None),
    cotizaciones_detalle: Optional[str] = Form(None),
    requiere_cotizacion: Optional[str] = Form("true"),
    cantidad_negociada: Optional[float] = Form(None),
    valor_negociado_total: Optional[float] = Form(None),
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
        "tributos": _parse_tributos_form(tributos),
        "proveedor_id": proveedor_id,
        "razon_social": razon_social,
        "nit": nit,
        "contacto_email": contacto_email,
        "contacto_nombre": contacto_nombre,
        "contacto_telefono": contacto_telefono,
        "cotizacion_numero": cotizacion_numero,
        "cotizacion_fecha": cotizacion_fecha,
        "cotizacion_vigencia": cotizacion_vigencia,
        "cotizaciones_detalle": cotizaciones_detalle,
        "requiere_cotizacion": requiere_cotizacion,
        "cantidad_negociada": cantidad_negociada,
        "valor_negociado_total": valor_negociado_total,
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


@router.delete("/{contrato_id}/insumos/{insumo_id}")
def route_delete_insumo(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "eliminar")
    try:
        result = delete_insumo_catalogo(contrato_id, insumo_id)
        registrar_log(
            current_user, "ELIMINAR", "CATALOGO_INSUMOS", "almacen_insumo", str(insumo_id),
            {"codigo": result.get("codigo")},
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
    tributos: Optional[str] = Form(None),
    proveedor_id: Optional[int] = Form(None),
    razon_social: Optional[str] = Form(None),
    nit: Optional[str] = Form(None),
    contacto_email: Optional[str] = Form(None),
    contacto_nombre: Optional[str] = Form(None),
    contacto_telefono: Optional[str] = Form(None),
    cotizacion_numero: Optional[str] = Form(None),
    cotizacion_fecha: Optional[str] = Form(None),
    cotizacion_vigencia: Optional[str] = Form(None),
    cotizaciones_detalle: Optional[str] = Form(None),
    requiere_cotizacion: Optional[str] = Form("true"),
    cantidad_negociada: Optional[float] = Form(None),
    valor_negociado_total: Optional[float] = Form(None),
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
        "tributos": _parse_tributos_form(tributos),
        "proveedor_id": proveedor_id,
        "razon_social": razon_social,
        "nit": nit,
        "contacto_email": contacto_email,
        "contacto_nombre": contacto_nombre,
        "contacto_telefono": contacto_telefono,
        "cotizacion_numero": cotizacion_numero,
        "cotizacion_fecha": cotizacion_fecha,
        "cotizacion_vigencia": cotizacion_vigencia,
        "cotizaciones_detalle": cotizaciones_detalle,
        "requiere_cotizacion": requiere_cotizacion,
        "cantidad_negociada": cantidad_negociada,
        "valor_negociado_total": valor_negociado_total,
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


@router.get("/{contrato_id}/proveedores/import/plantilla.csv")
def route_csv_plantilla_proveedores(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "ver")
    content = get_csv_template_proveedores()
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="plantilla_catalogo_proveedores.csv"'},
    )


@router.post("/{contrato_id}/proveedores/import/csv")
async def route_import_csv_proveedores(
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
        result = import_csv_proveedores(contrato_id, _uid(current_user), text, modo=modo)
        registrar_log(
            current_user,
            "IMPORTAR",
            "CATALOGO_PROVEEDORES",
            "almacen_proveedor",
            str(contrato_id),
            {
                "modo": modo,
                "creados": result.get("creados"),
                "actualizados": result.get("actualizados"),
                "desactivados": result.get("desactivados"),
            },
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
