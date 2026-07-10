"""
Rutas HTTP — módulo Almacén de Obra (Fase 1).
Prefijo: /almacen
"""
from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from almacen_export import build_inventario_xlsx
from almacen_insumos_service import (
    create_insumo,
    create_proveedor,
    get_presupuesto_context,
    list_precios_insumo_proveedor,
    resolve_insumo_for_solicitud,
    search_insumos,
    search_proveedores,
)
from almacen_permissions import require_permiso_almacen
from almacen_service import (
    add_cotizacion,
    alertas_vencimiento,
    aprobar_solicitud,
    create_entrada,
    create_solicitud,
    delete_cotizacion,
    download_soporte,
    enviar_solicitud,
    get_config,
    get_entrada,
    get_expediente,
    get_orden_compra,
    get_solicitud,
    list_entradas,
    list_inventario,
    list_movimientos,
    list_ordenes_compra,
    list_presupuesto_items,
    list_solicitudes,
    rechazar_solicitud,
    update_config,
    update_solicitud,
    upload_factura_oc,
)
from main import _require_contract_access, get_current_user, registrar_log, supabase

_log = logging.getLogger("claracore.almacen.routes")

router = APIRouter(prefix="/almacen", tags=["almacen"])


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


class ConfigUpdateBody(BaseModel):
    cotizaciones_minimas: int = Field(3, ge=1, le=10)
    dias_alerta_vencimiento: int = Field(30, ge=1, le=365)


class SolicitudItemBody(BaseModel):
    presupuesto_id: Optional[int] = None
    insumo_id: Optional[int] = None
    listado_precio_id: Optional[int] = None
    pk_id: Optional[str] = None
    material_descripcion: Optional[str] = None
    unidad: Optional[str] = None
    cantidad: float = Field(..., gt=0)
    valor_compra_unitario: Optional[float] = None
    es_recurrente: bool = False


class InsumoCreateBody(BaseModel):
    codigo: str = Field(..., min_length=1)
    descripcion: str = Field(..., min_length=1)
    unidad: Optional[str] = "UND"
    valor_compra_referencia: Optional[float] = 0
    capitulo: Optional[str] = None
    item_numero: Optional[str] = None
    listado_precio_id: Optional[int] = None


class ProveedorCreateBody(BaseModel):
    razon_social: str = Field(..., min_length=1)
    nit: str = Field(..., min_length=1)


class InsumoPreviewBody(BaseModel):
    insumo_id: Optional[int] = None
    listado_precio_id: Optional[int] = None
    pk_id: str = Field(..., min_length=1)
    cantidad: float = Field(..., gt=0)
    valor_compra_unitario: Optional[float] = None
    exclude_solicitud_id: Optional[int] = None


class SolicitudCreateBody(BaseModel):
    observaciones: Optional[str] = None
    items: List[SolicitudItemBody]


class CotizacionBody(BaseModel):
    proveedor_nombre: Optional[str] = None
    proveedor_id: Optional[int] = None
    razon_social: Optional[str] = None
    nit: Optional[str] = None
    valor_unitario: float = Field(..., ge=0)
    observaciones: Optional[str] = None


class CotizacionSeleccionBody(BaseModel):
    solicitud_item_id: int
    cotizacion_id: int


class AprobarBody(BaseModel):
    fecha_compromiso: Optional[str] = None
    cotizaciones_seleccionadas: Optional[List[CotizacionSeleccionBody]] = None


class RechazarBody(BaseModel):
    motivo: str = Field(..., min_length=3)


class EntradaItemBody(BaseModel):
    orden_compra_item_id: int
    cantidad_recibida: float = Field(..., gt=0)
    lote: Optional[str] = None
    fecha_vencimiento: Optional[str] = None


class EntradaCreateBody(BaseModel):
    orden_compra_id: int
    fecha_entrada: Optional[str] = None
    observaciones: Optional[str] = None
    items: List[EntradaItemBody]


@router.get("/{contrato_id}/config")
def route_get_config(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return get_config(contrato_id)


@router.put("/{contrato_id}/config")
def route_put_config(contrato_id: int, body: ConfigUpdateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "validar")
    try:
        return update_config(contrato_id, _uid(current_user), body.model_dump())
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/presupuesto-items")
def route_presupuesto_items(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_presupuesto_items(contrato_id)


@router.get("/{contrato_id}/insumos/search")
def route_search_insumos(
    contrato_id: int,
    q: str = "",
    limit: int = 30,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return search_insumos(contrato_id, q, min(limit, 50))


@router.post("/{contrato_id}/insumos")
def route_create_insumo(contrato_id: int, body: InsumoCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        return create_insumo(contrato_id, _uid(current_user), body.model_dump())
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/insumos/{insumo_id}/precios-proveedor")
def route_precios_insumo(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return list_precios_insumo_proveedor(contrato_id, insumo_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/proveedores/search")
def route_search_proveedores(
    contrato_id: int,
    q: str = "",
    limit: int = 25,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return search_proveedores(contrato_id, q, min(limit, 50))


@router.post("/{contrato_id}/proveedores")
def route_create_proveedor(contrato_id: int, body: ProveedorCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        return create_proveedor(contrato_id, _uid(current_user), body.model_dump())
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/insumos/preview-line")
def route_preview_insumo_line(contrato_id: int, body: InsumoPreviewBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        resolved = resolve_insumo_for_solicitud(contrato_id, _uid(current_user), body.model_dump())
        return {
            "presupuesto_id": resolved.get("presupuesto_id"),
            "pk_id": resolved.get("pk_id"),
            "capitulo": resolved.get("capitulo"),
            "item": resolved.get("item"),
            "material_descripcion": resolved.get("material_descripcion"),
            "unidad": resolved.get("unidad"),
            "valor_compra_unitario": resolved.get("valor_compra_unitario"),
            "contexto_presupuesto": resolved.get("contexto_presupuesto"),
            "analisis_valor": resolved.get("analisis_valor"),
            "supera_presupuesto": resolved.get("supera_presupuesto"),
        }
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/presupuesto-context")
def route_presupuesto_context(
    contrato_id: int,
    presupuesto_id: int,
    pk_id: str,
    cantidad: float = 0,
    exclude_solicitud_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_presupuesto_context(
            contrato_id, presupuesto_id, pk_id, cantidad, exclude_solicitud_id
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/solicitudes")
def route_list_solicitudes(
    contrato_id: int,
    estado: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_solicitudes(contrato_id, estado)


@router.get("/{contrato_id}/solicitudes/{solicitud_id}")
def route_get_solicitud(contrato_id: int, solicitud_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_solicitud(contrato_id, solicitud_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes")
def route_create_solicitud(contrato_id: int, body: SolicitudCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        result = create_solicitud(contrato_id, _uid(current_user), body.model_dump())
        registrar_log(current_user, "CREAR", "ALMACEN", "solicitud", result.get("id"), {})
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/solicitudes/{solicitud_id}")
def route_update_solicitud(
    contrato_id: int,
    solicitud_id: int,
    body: SolicitudCreateBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        return update_solicitud(contrato_id, solicitud_id, _uid(current_user), body.model_dump())
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/enviar")
def route_enviar_solicitud(contrato_id: int, solicitud_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        return enviar_solicitud(contrato_id, solicitud_id, _uid(current_user))
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/aprobar")
def route_aprobar_solicitud(
    contrato_id: int,
    solicitud_id: int,
    body: AprobarBody = AprobarBody(),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "validar")
    try:
        result = aprobar_solicitud(contrato_id, solicitud_id, _uid(current_user), body.model_dump())
        registrar_log(current_user, "VALIDAR", "ALMACEN", "solicitud", solicitud_id, {"accion": "aprobar"})
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/rechazar")
def route_rechazar_solicitud(
    contrato_id: int,
    solicitud_id: int,
    body: RechazarBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "validar")
    try:
        return rechazar_solicitud(contrato_id, solicitud_id, _uid(current_user), body.motivo)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/items/{item_id}/cotizaciones")
def route_add_cotizacion(
    contrato_id: int,
    item_id: int,
    body: CotizacionBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        return add_cotizacion(contrato_id, item_id, _uid(current_user), body.model_dump())
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/cotizaciones/{cotizacion_id}")
def route_delete_cotizacion(contrato_id: int, cotizacion_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        delete_cotizacion(contrato_id, cotizacion_id)
        return {"ok": True}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/ordenes-compra")
def route_list_oc(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_ordenes_compra(contrato_id)


@router.get("/{contrato_id}/ordenes-compra/{oc_id}")
def route_get_oc(contrato_id: int, oc_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_orden_compra(contrato_id, oc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/ordenes-compra/{oc_id}/factura")
async def route_upload_factura(
    contrato_id: int,
    oc_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    data = await archivo.read()
    mime = archivo.content_type or "application/octet-stream"
    try:
        return upload_factura_oc(contrato_id, oc_id, data, archivo.filename or "factura.pdf", mime)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/ordenes-compra/{oc_id}/factura/download")
def route_download_factura(contrato_id: int, oc_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        oc = get_orden_compra(contrato_id, oc_id)
        data, mime = download_soporte(oc.get("factura_blob_path"))
        fname = oc.get("factura_nombre") or "factura"
        return StreamingResponse(
            io.BytesIO(data),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/entradas")
def route_list_entradas(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_entradas(contrato_id)


@router.get("/{contrato_id}/entradas/{entrada_id}")
def route_get_entrada(contrato_id: int, entrada_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_entrada(contrato_id, entrada_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/entradas")
async def route_create_entrada(
    contrato_id: int,
    orden_compra_id: int = Form(...),
    fecha_entrada: Optional[str] = Form(None),
    observaciones: Optional[str] = Form(None),
    items_json: str = Form(...),
    remision: Optional[UploadFile] = File(None),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    import json
    try:
        items = json.loads(items_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="items_json inválido") from exc
    body = {
        "orden_compra_id": orden_compra_id,
        "fecha_entrada": fecha_entrada,
        "observaciones": observaciones,
        "items": items,
    }
    rem_data = rem_mime = rem_nombre = None
    if remision and remision.filename:
        rem_data = await remision.read()
        rem_mime = remision.content_type or "image/jpeg"
        rem_nombre = remision.filename
    try:
        result = create_entrada(
            contrato_id, _uid(current_user), body,
            remision_data=rem_data, remision_nombre=rem_nombre, remision_mime=rem_mime,
        )
        registrar_log(current_user, "CREAR", "ALMACEN", "entrada", result.get("id"), {})
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/entradas/{entrada_id}/remision/download")
def route_download_remision(contrato_id: int, entrada_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        ent = get_entrada(contrato_id, entrada_id)
        data, mime = download_soporte(ent.get("remision_blob_path"))
        fname = ent.get("remision_nombre") or "remision"
        return StreamingResponse(
            io.BytesIO(data),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/inventario")
def route_inventario(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_inventario(contrato_id)


@router.get("/{contrato_id}/inventario/{presupuesto_id}/movimientos")
def route_movimientos(
    contrato_id: int,
    presupuesto_id: int,
    material: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_movimientos(contrato_id, presupuesto_id, material)


@router.get("/{contrato_id}/inventario/export/excel")
def route_export_inventario(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "exportar")
    ct = (
        supabase.table("contratos")
        .select("numero")
        .eq("id", contrato_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    numero = ct[0].get("numero") if ct else ""
    xbytes = build_inventario_xlsx(contrato_id, numero or "")
    fname = f"inventario_almacen_{contrato_id}.xlsx"
    return StreamingResponse(
        io.BytesIO(xbytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{contrato_id}/alertas-vencimiento")
def route_alertas(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return alertas_vencimiento(contrato_id)


@router.get("/{contrato_id}/expedientes/{oc_id}")
def route_expediente(contrato_id: int, oc_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_expediente(contrato_id, oc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
