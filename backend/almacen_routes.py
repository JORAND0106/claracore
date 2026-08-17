"""
Rutas HTTP — módulo Almacén de Obra (Fase 1).
Prefijo: /almacen
"""
from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from almacen_export import build_inventario_xlsx
from almacen_inventario_graficos import get_inventario_graficos
from almacen_insumos_service import (
    create_insumo,
    create_proveedor,
    get_presupuesto_context,
    list_listado_capitulos,
    list_listado_items_capitulo,
    list_precios_insumo_proveedor,
    list_insumos_por_proveedor,
    list_presupuesto_registros,
    resolve_insumo_for_solicitud,
    search_insumos,
    search_insumos_solo_catalogo,
    search_insumos_catalog,
    search_proveedores,
)
from almacen_permissions import (
    puede_ver_valores_economicos_almacen,
    require_contratista_gerencial_almacen,
    require_editar_cantidad_salida_almacen,
    require_permiso_almacen,
    tiene_permiso_almacen,
)
from almacen_audit import (
    log_almacen,
    snapshot_devolucion,
    snapshot_entrada_cabecera,
    snapshot_entrada_item,
    snapshot_salida,
    snapshot_solicitud,
)
from catalogo_insumos_permissions import require_permiso_catalogo_insumos
from catalogo_insumos_service import delete_insumo_catalogo
from almacen_service import (
    add_cotizacion,
    alertas_vencimiento,
    anular_solicitud,
    aprobar_solicitud,
    aprobar_todos_items_solicitud,
    buscar_ordenes_compra_vigentes,
    buscar_ordenes_compra_por_pk,
    contexto_ordenes_compra_por_pk,
    create_entrada,
    create_salida,
    create_devolucion,
    create_solicitud,
    delete_cotizacion,
    download_disposicion_pdf,
    download_pdf_oc,
    download_salida_pdf,
    download_soporte,
    eliminar_entrada,
    eliminar_salida,
    eliminar_solicitud_desarrollador,
    update_salida_cantidad,
    entradas_disponibles_por_pk,
    enviar_solicitud,
    _fetch_solicitud_head,
    get_config,
    get_entrada,
    get_expediente,
    get_orden_compra,
    get_salida,
    get_solicitud,
    get_transportador_por_placa,
    list_entradas,
    list_inventario,
    list_movimientos,
    list_ordenes_compra,
    list_presupuesto_items,
    list_salidas,
    list_devoluciones,
    list_solicitudes,
    count_solicitudes,
    list_usuarios_receptor_obra,
    salidas_devolvibles_por_pk,
    mapear_item_solicitud_gerencial,
    ocr_remision_entrada,
    preview_proximo_numero_disposicion,
    rechazar_solicitud,
    search_transportadores,
    update_config,
    update_solicitud,
    upload_factura_oc,
    validar_item_solicitud,
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


def _puede_anular_solicitud(current_user, sol: dict) -> bool:
    uid = _uid(current_user)
    if int(sol.get("created_by") or 0) == uid:
        return tiene_permiso_almacen(current_user, "crear") or tiene_permiso_almacen(current_user, "editar")
    return tiene_permiso_almacen(current_user, "editar")


class ConfigUpdateBody(BaseModel):
    cotizaciones_minimas: int = Field(3, ge=1, le=10)
    dias_alerta_vencimiento: int = Field(30, ge=1, le=365)


class SolicitudItemBody(BaseModel):
    presupuesto_id: Optional[int] = None
    presupuesto_capitulo: Optional[str] = None
    presupuesto_item: Optional[str] = None
    insumo_id: Optional[int] = None
    listado_precio_id: Optional[int] = None
    pk_id: Optional[str] = None
    pk_id_id: Optional[int] = None
    tramo: Optional[str] = None
    costado: Optional[str] = None
    abscisa_inicial: Optional[float] = None
    abscisa_final: Optional[float] = None
    observacion_residente: Optional[str] = None
    material_descripcion: Optional[str] = None
    descripcion_solicitada: Optional[str] = None
    unidad: Optional[str] = None
    cantidad: float = Field(..., gt=0)
    valor_compra_unitario: Optional[float] = None
    vlr_unitario_cobro: Optional[float] = None
    es_recurrente: bool = False


class MapearItemGerencialBody(BaseModel):
    insumo_id: int = Field(..., gt=0)
    cantidad: Optional[float] = Field(None, gt=0)
    valor_compra_unitario: Optional[float] = Field(None, ge=0)
    vlr_unitario_cobro: Optional[float] = Field(None, ge=0)
    es_recurrente: Optional[bool] = None


class ImpuestoInsumoBody(BaseModel):
    nombre: str = Field(..., min_length=1)
    tipo: str = Field("porcentaje", pattern="^(porcentaje|valor)$")
    valor: float = Field(..., ge=0)


class InsumoCreateBody(BaseModel):
    codigo: str = Field(..., min_length=1)
    descripcion: str = Field(..., min_length=1)
    unidad: Optional[str] = "UND"
    costo_base: Optional[float] = Field(None, ge=0)
    impuestos: Optional[List[ImpuestoInsumoBody]] = None
    valor_compra_referencia: Optional[float] = Field(None, ge=0)
    listado_precio_id: Optional[int] = None


class ProveedorCreateBody(BaseModel):
    razon_social: str = Field(..., min_length=1)
    nit: str = Field(..., min_length=1)
    contacto_email: Optional[str] = None
    contacto_nombre: Optional[str] = None
    contacto_telefono: Optional[str] = None


class InsumoPreviewBody(BaseModel):
    insumo_id: Optional[int] = None
    listado_precio_id: Optional[int] = None
    presupuesto_id: Optional[int] = None
    presupuesto_capitulo: Optional[str] = None
    presupuesto_item: Optional[str] = None
    pk_id: str = Field(..., min_length=1)
    pk_id_id: Optional[int] = None
    tramo: Optional[str] = None
    costado: Optional[str] = None
    abscisa_inicial: Optional[float] = None
    abscisa_final: Optional[float] = None
    observacion_residente: Optional[str] = None
    cantidad: float = Field(..., gt=0)
    valor_compra_unitario: Optional[float] = None
    exclude_solicitud_id: Optional[int] = None
    cantidad_borrador_adicional: float = Field(0, ge=0)
    cantidad_borrador_adicional_insumo: float = Field(0, ge=0)


class SolicitudCreateBody(BaseModel):
    titulo: Optional[str] = None
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
    aprobar_todos_pendientes: bool = True


class ValidarItemBody(BaseModel):
    accion: str = Field(..., pattern="^(aprobar|rechazar)$")
    motivo: Optional[str] = None


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


@router.get("/{contrato_id}/listado-capitulos")
def route_listado_capitulos(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_listado_capitulos(contrato_id)


@router.get("/{contrato_id}/listado-items")
def route_listado_items(
    contrato_id: int,
    capitulo: str,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_listado_items_capitulo(contrato_id, capitulo)


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


@router.get("/{contrato_id}/insumos/catalog")
def route_insumos_catalog(
    contrato_id: int,
    q: str = "",
    limit: int = 50,
    offset: int = 0,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    rows, total, catalog_total = search_insumos_solo_catalogo(contrato_id, q, min(limit, 100), max(offset, 0))
    return {"items": rows, "total": total, "catalogo_vacio": catalog_total == 0}


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
    soporte_pdf: Optional[UploadFile] = File(None),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    soporte = None
    if soporte_pdf and soporte_pdf.filename:
        data = await soporte_pdf.read()
        mime = soporte_pdf.content_type or "application/pdf"
        if mime != "application/pdf":
            raise HTTPException(status_code=400, detail="El soporte debe ser un archivo PDF.")
        soporte = (data, soporte_pdf.filename, mime)
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
    }
    try:
        return create_insumo(contrato_id, _uid(current_user), body, soporte=soporte)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/insumos/json")
def route_create_insumo_json(contrato_id: int, body: InsumoCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "crear")
    try:
        return create_insumo(contrato_id, _uid(current_user), {
            **body.model_dump(),
            "impuestos": [i.model_dump() if hasattr(i, "model_dump") else i for i in (body.impuestos or [])],
        })
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


@router.delete("/{contrato_id}/insumos/{insumo_id}")
def route_delete_insumo(contrato_id: int, insumo_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_catalogo_insumos(current_user, "eliminar")
    try:
        result = delete_insumo_catalogo(contrato_id, insumo_id)
        registrar_log(
            current_user, "ELIMINAR", "ALMACEN", "almacen_insumo", str(insumo_id),
            {"codigo": result.get("codigo")},
        )
        return result
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


@router.get("/{contrato_id}/transportadores/por-placa")
def route_transportador_por_placa(
    contrato_id: int,
    placa: str = "",
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    row = get_transportador_por_placa(contrato_id, placa)
    if not row:
        return {"encontrado": False}
    return {**row, "encontrado": True}


@router.get("/{contrato_id}/transportadores/search")
def route_search_transportadores(
    contrato_id: int,
    q: str = "",
    limit: int = 25,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    return search_transportadores(contrato_id, q, min(limit, 50))


@router.get("/{contrato_id}/presupuesto-registros")
def route_presupuesto_registros(
    contrato_id: int,
    capitulo: str,
    item: str,
    pk_id: str,
    exclude_solicitud_id: Optional[int] = None,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return list_presupuesto_registros(
            contrato_id,
            capitulo,
            item,
            pk_id,
            exclude_solicitud_id,
        )
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
            "supera_negociado": resolved.get("supera_negociado"),
            "contexto_negociado": resolved.get("contexto_negociado"),
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
            contrato_id,
            presupuesto_id,
            pk_id,
            cantidad,
            exclude_solicitud_id,
            descontar_linea_actual=cantidad > 0,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/solicitudes")
def route_list_solicitudes(
    contrato_id: int,
    estado: Optional[str] = None,
    resumen: bool = Query(True),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    ver_eco = puede_ver_valores_economicos_almacen(current_user)
    return list_solicitudes(contrato_id, estado, ver_economicos=ver_eco, resumen=resumen)


@router.get("/{contrato_id}/solicitudes-count")
def route_count_solicitudes(
    contrato_id: int,
    estado: Optional[str] = None,
    current_user=Depends(get_current_user),
):
    """Conteo ligero (p. ej. badge de enviadas pendientes de validar)."""
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return {"count": count_solicitudes(contrato_id, estado)}


@router.get("/{contrato_id}/solicitudes/{solicitud_id}")
def route_get_solicitud(
    contrato_id: int,
    solicitud_id: int,
    ligera: bool = False,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    ver_eco = puede_ver_valores_economicos_almacen(current_user)
    try:
        return get_solicitud(
            contrato_id,
            solicitud_id,
            ver_economicos=ver_eco if not ligera else False,
            ligera=ligera,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes")
def route_create_solicitud(contrato_id: int, body: SolicitudCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    try:
        result = create_solicitud(contrato_id, _uid(current_user), body.model_dump())
        snap = snapshot_solicitud(result)
        log_almacen(
            current_user, "CREAR", "solicitud", result.get("id"),
            {"consecutivo": result.get("consecutivo")},
            valor_anterior=None,
            valor_nuevo=snap,
        )
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
        prev = get_solicitud(contrato_id, solicitud_id, ligera=True)
        result = update_solicitud(contrato_id, solicitud_id, _uid(current_user), body.model_dump())
        log_almacen(
            current_user, "EDITAR", "solicitud", solicitud_id,
            {"consecutivo": result.get("consecutivo")},
            valor_anterior=snapshot_solicitud(prev),
            valor_nuevo=snapshot_solicitud(result),
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/enviar")
def route_enviar_solicitud(contrato_id: int, solicitud_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        prev = _fetch_solicitud_head(contrato_id, solicitud_id)
        result = enviar_solicitud(contrato_id, solicitud_id, _uid(current_user))
        log_almacen(
            current_user, "ENVIAR", "solicitud", solicitud_id,
            {"consecutivo": result.get("consecutivo") or prev.get("consecutivo")},
            valor_anterior=snapshot_solicitud(prev),
            valor_nuevo=snapshot_solicitud(result),
        )
        return result
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
    require_contratista_gerencial_almacen(current_user)
    try:
        prev = _fetch_solicitud_head(contrato_id, solicitud_id)
        result = aprobar_solicitud(contrato_id, solicitud_id, _uid(current_user), body.model_dump())
        log_almacen(
            current_user, "APROBAR", "solicitud", solicitud_id,
            {"accion": "aprobar", "consecutivo": prev.get("consecutivo")},
            valor_anterior=snapshot_solicitud(prev),
            valor_nuevo=snapshot_solicitud(result if isinstance(result, dict) else {**prev, "estado": "aprobada"}),
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/{contrato_id}/solicitudes/{solicitud_id}/items/{item_id}/mapear")
def route_mapear_item_gerencial(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    body: MapearItemGerencialBody,
    current_user=Depends(get_current_user),
):
    """Contratista Gerencial: selecciona insumo, ajusta cantidad/costo/cobro."""
    _check_contrato(current_user, contrato_id)
    require_contratista_gerencial_almacen(current_user)
    try:
        payload = body.model_dump(exclude_none=True)
        result = mapear_item_solicitud_gerencial(
            contrato_id,
            solicitud_id,
            item_id,
            _uid(current_user),
            payload,
        )
        log_almacen(
            current_user, "MAPEAR_ITEM", "solicitud", solicitud_id,
            {"item_id": item_id, **{k: payload.get(k) for k in ("insumo_id", "cantidad") if k in payload}},
            valor_anterior={"item_id": item_id},
            valor_nuevo={"item_id": item_id, **(payload or {})},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/items/{item_id}/validar")
def route_validar_item_solicitud(
    contrato_id: int,
    solicitud_id: int,
    item_id: int,
    body: ValidarItemBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_contratista_gerencial_almacen(current_user)
    try:
        result = validar_item_solicitud(
            contrato_id,
            solicitud_id,
            item_id,
            _uid(current_user),
            body.accion,
            body.motivo,
        )
        accion_log = "APROBAR_ITEM" if (body.accion or "").lower().startswith("aprob") else "RECHAZAR_ITEM"
        log_almacen(
            current_user, accion_log, "solicitud", solicitud_id,
            {"item_id": item_id, "accion": body.accion, "motivo": body.motivo},
            valor_anterior={"item_id": item_id, "estado_validacion": "pendiente"},
            valor_nuevo={
                "item_id": item_id,
                "estado_validacion": "aprobado" if accion_log == "APROBAR_ITEM" else "rechazado",
                "motivo": body.motivo,
            },
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/aprobar-todos-items")
def route_aprobar_todos_items(
    contrato_id: int,
    solicitud_id: int,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_contratista_gerencial_almacen(current_user)
    try:
        result = aprobar_todos_items_solicitud(contrato_id, solicitud_id, _uid(current_user))
        log_almacen(
            current_user, "APROBAR_ITEMS", "solicitud", solicitud_id,
            {"accion": "aprobar_todos_items"},
            valor_anterior=None,
            valor_nuevo={"items_aprobados": True},
        )
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
    require_contratista_gerencial_almacen(current_user)
    try:
        prev = _fetch_solicitud_head(contrato_id, solicitud_id)
        result = rechazar_solicitud(contrato_id, solicitud_id, _uid(current_user), body.motivo)
        log_almacen(
            current_user, "RECHAZAR", "solicitud", solicitud_id,
            {"motivo": body.motivo, "consecutivo": prev.get("consecutivo")},
            valor_anterior=snapshot_solicitud(prev),
            valor_nuevo=snapshot_solicitud(result),
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/solicitudes/{solicitud_id}/anular")
def route_anular_solicitud(
    contrato_id: int,
    solicitud_id: int,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    try:
        sol = _fetch_solicitud_head(contrato_id, solicitud_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    if not _puede_anular_solicitud(current_user, sol):
        raise HTTPException(
            status_code=403,
            detail="No tiene permiso para anular esta solicitud.",
        )
    try:
        result = anular_solicitud(contrato_id, solicitud_id, _uid(current_user))
        log_almacen(
            current_user, "ANULAR", "solicitud", solicitud_id,
            {"estado_previo": sol.get("estado"), "deleted": result.get("deleted", False)},
            valor_anterior=snapshot_solicitud(sol),
            valor_nuevo=snapshot_solicitud(result if isinstance(result, dict) and result.get("estado") else None)
            or {"deleted": True, "id": solicitud_id},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/solicitudes/{solicitud_id}/desarrollador")
def route_eliminar_solicitud_desarrollador(
    contrato_id: int,
    solicitud_id: int,
    current_user=Depends(get_current_user),
):
    """Eliminación permanente — solo cargo Desarrollador (limpieza de datos)."""
    _check_contrato(current_user, contrato_id)
    try:
        prev = _fetch_solicitud_head(contrato_id, solicitud_id)
        result = eliminar_solicitud_desarrollador(contrato_id, solicitud_id, current_user)
        log_almacen(
            current_user, "ELIMINAR_DEV", "solicitud", solicitud_id,
            {"deleted": True},
            valor_anterior=snapshot_solicitud(prev),
            valor_nuevo={"deleted": True, "id": solicitud_id},
        )
        return result
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


@router.get("/{contrato_id}/ordenes-compra/buscar-por-pk")
def route_buscar_oc_por_pk(
    contrato_id: int,
    pk_id: str,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return buscar_ordenes_compra_por_pk(contrato_id, pk_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/ordenes-compra/contexto-por-pk")
def route_contexto_oc_por_pk(
    contrato_id: int,
    pk_id: str,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return contexto_ordenes_compra_por_pk(contrato_id, pk_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/ordenes-compra/buscar-vigentes")
def route_buscar_oc_vigentes(
    contrato_id: int,
    proveedor_id: int,
    insumo_id: int,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return buscar_ordenes_compra_vigentes(contrato_id, proveedor_id, insumo_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/ordenes-compra/{oc_id}")
def route_get_oc(contrato_id: int, oc_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_orden_compra(contrato_id, oc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/proveedores/{proveedor_id}/insumos")
def route_insumos_por_proveedor(
    contrato_id: int,
    proveedor_id: int,
    q: str = "",
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return list_insumos_por_proveedor(contrato_id, proveedor_id, q)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/entradas/ocr-remision")
async def route_ocr_remision(
    contrato_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    data = await archivo.read()
    mime = archivo.content_type or "application/octet-stream"
    return ocr_remision_entrada(data, mime)


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


@router.get("/{contrato_id}/ordenes-compra/{oc_id}/pdf/download")
def route_download_oc_pdf(contrato_id: int, oc_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "exportar")
    try:
        data, fname = download_pdf_oc(contrato_id, oc_id, _uid(current_user))
        safe_name = fname.replace('"', "'")
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except Exception as exc:
        _log.exception("Error descargando PDF OC %s contrato %s", oc_id, contrato_id)
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc


@router.get("/{contrato_id}/entradas/proximo-numero-disposicion")
def route_proximo_numero_disposicion(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    return preview_proximo_numero_disposicion(contrato_id)


@router.get("/{contrato_id}/entradas/disponibles-por-pk")
def route_entradas_disponibles_por_pk(
    contrato_id: int,
    pk_id: str,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return entradas_disponibles_por_pk(contrato_id, pk_id)
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
    orden_compra_id: Optional[int] = Form(None),
    fecha_entrada: Optional[str] = Form(None),
    observaciones: Optional[str] = Form(None),
    items_json: str = Form(...),
    tipo: Optional[str] = Form("recibo"),
    numero_documento: Optional[str] = Form(None),
    proveedor_id: Optional[int] = Form(None),
    insumo_id: Optional[int] = Form(None),
    pk_id: Optional[str] = Form(None),
    tramo: Optional[str] = Form(None),
    costado: Optional[str] = Form(None),
    abscisa_inicial: Optional[str] = Form(None),
    abscisa_final: Optional[str] = Form(None),
    placa: Optional[str] = Form(None),
    transportador: Optional[str] = Form(None),
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
    tipo_norm = (tipo or "recibo").strip().lower()
    numero_norm = (numero_documento or "").strip()
    if tipo_norm == "recibo" and not numero_norm:
        raise HTTPException(
            status_code=400,
            detail="Indique el número de remisión del proveedor.",
        )
    if tipo_norm == "recibo" and (not remision or not remision.filename):
        raise HTTPException(
            status_code=400,
            detail="Adjunte el soporte fotográfico o PDF de la remisión.",
        )
    rem_data = rem_mime = rem_nombre = None
    if remision and remision.filename:
        rem_data = await remision.read()
        rem_mime = remision.content_type or "image/jpeg"
        rem_nombre = remision.filename
        if tipo_norm == "recibo" and len(rem_data) > 300 * 1024:
            raise HTTPException(
                status_code=400,
                detail="El soporte de remisión no puede superar 300 KB.",
            )
    body = {
        "orden_compra_id": orden_compra_id,
        "fecha_entrada": fecha_entrada,
        "observaciones": observaciones,
        "items": items,
        "tipo": tipo_norm,
        "numero_documento": numero_norm or None,
        "proveedor_id": proveedor_id,
        "insumo_id": insumo_id,
        "pk_id": pk_id,
        "tramo": tramo,
        "costado": costado,
        "abscisa_inicial": abscisa_inicial,
        "abscisa_final": abscisa_final,
        "placa": placa,
        "transportador": transportador,
    }
    try:
        result = create_entrada(
            contrato_id, _uid(current_user), body,
            remision_data=rem_data, remision_nombre=rem_nombre, remision_mime=rem_mime,
        )
        cab = snapshot_entrada_cabecera(result)
        items = result.get("items") or []
        if items:
            for it in items:
                ei_id = it.get("id")
                if ei_id is None:
                    continue
                log_almacen(
                    current_user, "CREAR", "entrada_item", ei_id,
                    {
                        "entrada_id": result.get("id"),
                        "numero_entrada": result.get("numero_entrada"),
                        "material_descripcion": it.get("material_descripcion"),
                    },
                    valor_anterior=None,
                    valor_nuevo=snapshot_entrada_item(it, result),
                )
        else:
            # Fallback cabecera si no hubo líneas (caso raro).
            log_almacen(
                current_user, "CREAR", "entrada", result.get("id"),
                {"numero_entrada": result.get("numero_entrada")},
                valor_anterior=None,
                valor_nuevo=cab,
            )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/entradas/{entrada_id}")
def route_eliminar_entrada(contrato_id: int, entrada_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        prev = get_entrada(contrato_id, entrada_id)
        result = eliminar_entrada(contrato_id, entrada_id)
        for it in prev.get("items") or []:
            ei_id = it.get("id")
            if ei_id is None:
                continue
            log_almacen(
                current_user, "ELIMINAR", "entrada_item", ei_id,
                {"entrada_id": entrada_id},
                valor_anterior=snapshot_entrada_item(it, prev),
                valor_nuevo={"deleted": True, "id": ei_id},
            )
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


@router.get("/{contrato_id}/entradas/{entrada_id}/disposicion/download")
def route_download_disposicion(contrato_id: int, entrada_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        data, fname = download_disposicion_pdf(contrato_id, entrada_id)
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


class SalidaCreateBody(BaseModel):
    receptor_usuario_id: int
    fecha_hora_salida: Optional[str] = None
    pk_id: str = Field(..., min_length=1)
    pk_id_id: Optional[int] = None
    tramo: Optional[str] = None
    costado: Optional[str] = None
    abscisa_inicial: Optional[str] = None
    abscisa_final: Optional[str] = None
    entrada_item_id: int
    cantidad_salida: float = Field(..., gt=0)
    observaciones: Optional[str] = None


class SalidaCantidadUpdateBody(BaseModel):
    cantidad_salida: float = Field(..., gt=0)


@router.get("/{contrato_id}/usuarios-receptor-obra")
def route_usuarios_receptor_obra(
    contrato_id: int,
    q: str = "",
    limit: int = 30,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_usuarios_receptor_obra(contrato_id, q, min(limit, 50))


@router.get("/{contrato_id}/salidas")
def route_list_salidas(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_salidas(contrato_id)


@router.get("/{contrato_id}/salidas/devolvibles-por-pk")
def route_salidas_devolvibles_por_pk(
    contrato_id: int,
    pk_id: str = Query(..., min_length=1),
    current_user=Depends(get_current_user),
):
    """Debe ir antes de /salidas/{salida_id} para no capturar el path como id."""
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return salidas_devolvibles_por_pk(contrato_id, pk_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/salidas/{salida_id}")
def route_get_salida(contrato_id: int, salida_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        return get_salida(contrato_id, salida_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/salidas")
def route_create_salida(contrato_id: int, body: SalidaCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    try:
        result = create_salida(contrato_id, _uid(current_user), body.dict())
        snap = snapshot_salida(result)
        log_almacen(
            current_user, "CREAR", "salida", result.get("id"),
            {
                "numero_salida": result.get("numero_salida"),
                "entrada_item_id": result.get("entrada_item_id"),
            },
            valor_anterior=None,
            valor_nuevo=snap,
        )
        # Historial por línea de entrada asociada.
        ei_id = result.get("entrada_item_id")
        if ei_id is not None:
            log_almacen(
                current_user, "DESPACHO", "entrada_item", ei_id,
                {
                    "salida_id": result.get("id"),
                    "numero_salida": result.get("numero_salida"),
                    "cantidad_salida": result.get("cantidad_salida"),
                },
                valor_anterior=None,
                valor_nuevo={
                    "salida_id": result.get("id"),
                    "cantidad_salida": result.get("cantidad_salida"),
                    "pk_id": result.get("pk_id"),
                },
            )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/{contrato_id}/salidas/{salida_id}/cantidad")
def route_update_salida_cantidad(
    contrato_id: int,
    salida_id: int,
    body: SalidaCantidadUpdateBody,
    current_user=Depends(get_current_user),
):
    """Edición sensible: solo Contratista Gerencial o Desarrollador."""
    _check_contrato(current_user, contrato_id)
    require_editar_cantidad_salida_almacen(current_user)
    try:
        result = update_salida_cantidad(contrato_id, salida_id, body.cantidad_salida)
        anterior = result.get("cantidad_salida_anterior")
        nuevo = result.get("cantidad_salida")
        registrar_log(
            current_user,
            "EDITAR",
            "ALMACEN",
            "salida",
            salida_id,
            {
                "campo": "cantidad_salida",
                "entrada_item_id": result.get("entrada_item_id"),
                "numero_salida": result.get("numero_salida"),
            },
            valor_anterior={"cantidad_salida": anterior},
            valor_nuevo={"cantidad_salida": nuevo},
        )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/salidas/{salida_id}")
def route_eliminar_salida(contrato_id: int, salida_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "editar")
    try:
        prev = get_salida(contrato_id, salida_id)
        result = eliminar_salida(contrato_id, salida_id)
        log_almacen(
            current_user, "ELIMINAR", "salida", salida_id,
            {"numero_salida": prev.get("numero_salida")},
            valor_anterior=snapshot_salida(prev),
            valor_nuevo={"deleted": True, "id": salida_id},
        )
        ei_id = prev.get("entrada_item_id")
        if ei_id is not None:
            log_almacen(
                current_user, "REVERTIR_DESPACHO", "entrada_item", ei_id,
                {"salida_id": salida_id},
                valor_anterior=snapshot_salida(prev),
                valor_nuevo={"salida_eliminada": salida_id},
            )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/salidas/{salida_id}/recibo/download")
def route_download_salida_pdf(contrato_id: int, salida_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    try:
        data, fname = download_salida_pdf(contrato_id, salida_id)
        return StreamingResponse(
            io.BytesIO(data),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


class DevolucionCreateBody(BaseModel):
    receptor_usuario_id: int
    fecha_hora_devolucion: Optional[str] = None
    pk_id: str = Field(..., min_length=1)
    pk_id_id: Optional[int] = None
    tramo: Optional[str] = None
    costado: str = Field(..., min_length=1)
    abscisa_inicial: str = Field(..., min_length=1)
    abscisa_final: str = Field(..., min_length=1)
    salida_id: int
    cantidad: float = Field(..., gt=0)
    observaciones: Optional[str] = None


@router.get("/{contrato_id}/devoluciones")
def route_list_devoluciones(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return list_devoluciones(contrato_id)


@router.post("/{contrato_id}/devoluciones")
def route_create_devolucion(contrato_id: int, body: DevolucionCreateBody, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "crear")
    try:
        salida_prev = get_salida(contrato_id, int(body.salida_id))
        result = create_devolucion(contrato_id, _uid(current_user), body.dict())
        snap_dev = snapshot_devolucion({
            **result,
            "entrada_item_id": salida_prev.get("entrada_item_id"),
        })
        log_almacen(
            current_user, "CREAR", "devolucion", result.get("id"),
            {
                "salida_id": body.salida_id,
                "entrada_item_id": salida_prev.get("entrada_item_id"),
            },
            valor_anterior=None,
            valor_nuevo=snap_dev,
        )
        # Antes/después en la salida (devuelto / neto).
        dev_antes = float(salida_prev.get("cantidad_devuelta") or 0)
        qty = float(result.get("cantidad") or body.cantidad or 0)
        sal_despues = {
            **snapshot_salida(salida_prev),
            "cantidad_devuelta": round(dev_antes + qty, 4),
            "cantidad_neta": max(
                0.0,
                round(float(salida_prev.get("cantidad_salida") or 0) - (dev_antes + qty), 4),
            ),
        }
        log_almacen(
            current_user, "DEVOLUCION", "salida", body.salida_id,
            {"devolucion_id": result.get("id"), "cantidad": qty},
            valor_anterior=snapshot_salida(salida_prev),
            valor_nuevo=sal_despues,
        )
        ei_id = salida_prev.get("entrada_item_id")
        if ei_id is not None:
            log_almacen(
                current_user, "DEVOLUCION", "entrada_item", ei_id,
                {
                    "devolucion_id": result.get("id"),
                    "salida_id": body.salida_id,
                    "cantidad": qty,
                },
                valor_anterior={"cantidad_devuelta_salida": dev_antes},
                valor_nuevo={"cantidad_devuelta_salida": round(dev_antes + qty, 4), "cantidad": qty},
            )
        return result
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/inventario/graficos")
def route_inventario_graficos(
    contrato_id: int,
    capitulo: Optional[str] = Query(None),
    item: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_almacen(current_user, "ver")
    return get_inventario_graficos(contrato_id, capitulo=capitulo, item=item)


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
