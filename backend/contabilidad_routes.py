"""
Rutas HTTP — módulo Contabilidad (Desarrollador y Contador).

Prefijo: /contabilidad
"""
from __future__ import annotations

import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from contabilidad_documentos_service import (
    alertas_vencimiento_documentos,
    create_documento_empresa,
    delete_documento_empresa,
    download_documento_empresa,
    get_documento_empresa,
    list_documentos_empresa,
    replace_archivo_documento_empresa,
    update_documento_empresa,
)
from contabilidad_export import build_export_xlsx
from contabilidad_permissions import (
    require_firma_cierre,
    require_permiso_contabilidad,
    require_solo_desarrollador_categorias,
)
from contabilidad_reportes import EXPORT_TIPOS, REPORTE_TIPOS, obtener_reporte
from contabilidad_service import (
    anular_transaccion,
    aprobar_cierre_mensual,
    create_categoria,
    create_transaccion,
    create_transaccion_desde_orden,
    delete_soporte_transaccion,
    download_soporte_transaccion,
    firmar_cierre_mensual,
    generar_cierre_mensual,
    get_cierre,
    get_cuentas_especiales,
    get_transaccion,
    list_categorias,
    list_cierres,
    list_contratos_centro_costo,
    list_movimientos_cuentas,
    list_ordenes_pago_pendientes,
    list_transacciones,
    update_categoria,
    update_notas_cierre,
    update_transaccion,
    upload_soporte_transaccion,
)
from main import get_current_user, get_supabase, registrar_log

_log = logging.getLogger("claracore.contabilidad.routes")

router = APIRouter(prefix="/contabilidad", tags=["contabilidad"])


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


def _require_ver(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "ver")
    return current_user


def _require_crear(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "crear")
    return current_user


def _require_editar(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "editar")
    return current_user


def _require_eliminar(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "eliminar")
    return current_user


def _require_validar(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "validar")
    return current_user


def _require_exportar(current_user=Depends(get_current_user)):
    require_permiso_contabilidad(current_user, "exportar")
    return current_user


class CategoriaCreateBody(BaseModel):
    codigo: str = Field(..., min_length=2, max_length=16)
    nombre: str = Field(..., min_length=2, max_length=120)
    tipo: str = Field(..., pattern="^(ingreso|egreso)$")
    orden: int = Field(0, ge=0, le=9999)


class CategoriaUpdateBody(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=120)
    orden: Optional[int] = Field(None, ge=0, le=9999)
    activo: Optional[bool] = None


class TransaccionBody(BaseModel):
    fecha: str = Field(..., description="YYYY-MM-DD")
    tipo: str = Field(..., pattern="^(ingreso|egreso)$")
    valor_bruto: float = Field(..., ge=0)
    retencion_fuente_tasa: float = Field(0, ge=0)
    retencion_fuente_valor: float = Field(0, ge=0)
    iva_tasa: float = Field(0, ge=0)
    iva_valor: float = Field(0, ge=0)
    iva_sentido: Optional[str] = Field(None, pattern="^(recaudado|pagado)$")
    categoria_id: int = Field(..., ge=1)
    centro_costo_tipo: str = Field("empresa", pattern="^(contrato|empresa)$")
    contrato_id: Optional[int] = Field(None, ge=1)
    fuente_ingreso: Optional[str] = Field(None, pattern="^(licenciamiento|servicios)$")
    notas: Optional[str] = Field(None, max_length=4000)


class TransaccionDesdeOrdenBody(BaseModel):
    fecha: Optional[str] = Field(None, description="YYYY-MM-DD; default fecha_emision de la orden")
    retencion_fuente_tasa: float = Field(0, ge=0)
    retencion_fuente_valor: float = Field(0, ge=0)
    categoria_id: Optional[int] = Field(None, ge=1)
    notas: Optional[str] = Field(None, max_length=4000)


class CierreGenerarBody(BaseModel):
    anio: int = Field(..., ge=2020, le=2100)
    mes: int = Field(..., ge=1, le=12)


class CierreNotasBody(BaseModel):
    notas: Optional[str] = Field(None, max_length=8000)


class CierreFirmarBody(BaseModel):
    notas: Optional[str] = Field(None, max_length=8000)


class DocumentoEmpresaUpdateBody(BaseModel):
    categoria: Optional[str] = Field(None, pattern="^(legal|tributario|corporativo|laboral|otros)$")
    nombre: Optional[str] = Field(None, min_length=2, max_length=200)
    descripcion: Optional[str] = Field(None, max_length=4000)
    fecha_documento: Optional[str] = Field(None, description="YYYY-MM-DD")
    fecha_vencimiento: Optional[str] = Field(None, description="YYYY-MM-DD")


@router.get("/categorias")
def obtener_categorias(
    incluir_inactivas: bool = Query(False),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    return {"items": list_categorias(sb, solo_activas=not incluir_inactivas)}


@router.post("/categorias")
def crear_categoria(
    body: CategoriaCreateBody,
    current_user=Depends(_require_crear),
):
    require_solo_desarrollador_categorias(current_user)
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = create_categoria(sb, body.dict(), uid)
        registrar_log(
            current_user, "CREAR", "CONTABILIDAD", "contabilidad_categoria", str(row.get("id")),
            {"codigo": body.codigo, "nombre": body.nombre},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/categorias/{categoria_id}")
def editar_categoria(
    categoria_id: int,
    body: CategoriaUpdateBody,
    current_user=Depends(_require_editar),
):
    require_solo_desarrollador_categorias(current_user)
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = update_categoria(sb, categoria_id, body.dict(exclude_unset=True), uid)
        registrar_log(
            current_user, "EDITAR", "CONTABILIDAD", "contabilidad_categoria", str(categoria_id),
            body.dict(exclude_unset=True),
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/transacciones")
def obtener_transacciones(
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    tipo: Optional[str] = Query(None),
    categoria_id: Optional[int] = Query(None),
    contrato_id: Optional[int] = Query(None),
    estado: Optional[str] = Query("activa"),
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    return list_transacciones(
        sb,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        tipo=tipo,
        categoria_id=categoria_id,
        contrato_id=contrato_id,
        estado=estado,
        limit=limit,
        offset=offset,
    )


@router.get("/transacciones/{transaccion_id}")
def obtener_transaccion(
    transaccion_id: int,
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        return get_transaccion(sb, transaccion_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/transacciones")
def crear_transaccion_route(
    body: TransaccionBody,
    current_user=Depends(_require_crear),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = create_transaccion(sb, body.dict(), uid)
        registrar_log(
            current_user, "CREAR", "CONTABILIDAD", "contabilidad_transaccion", str(row.get("id")),
            {"tipo": body.tipo, "valor_bruto": body.valor_bruto, "fecha": body.fecha},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/transacciones/{transaccion_id}")
def editar_transaccion(
    transaccion_id: int,
    body: TransaccionBody,
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = update_transaccion(sb, transaccion_id, body.dict(), uid)
        registrar_log(
            current_user, "EDITAR", "CONTABILIDAD", "contabilidad_transaccion", str(transaccion_id),
            {"tipo": body.tipo, "valor_bruto": body.valor_bruto},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/transacciones/{transaccion_id}/anular")
def anular_transaccion_route(
    transaccion_id: int,
    current_user=Depends(_require_eliminar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = anular_transaccion(sb, transaccion_id, uid)
        registrar_log(
            current_user, "ANULAR", "CONTABILIDAD", "contabilidad_transaccion", str(transaccion_id), {},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/transacciones/desde-orden/{orden_id}")
def crear_transaccion_desde_orden_route(
    orden_id: int,
    body: TransaccionDesdeOrdenBody,
    current_user=Depends(_require_crear),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = create_transaccion_desde_orden(sb, orden_id, uid, body.dict(exclude_unset=True))
        registrar_log(
            current_user, "CREAR", "CONTABILIDAD", "contabilidad_transaccion", str(row.get("id")),
            {"origen": "orden_pago", "orden_pago_id": orden_id},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/transacciones/{transaccion_id}/soporte")
async def subir_soporte(
    transaccion_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    data = await archivo.read()
    try:
        row = upload_soporte_transaccion(
            sb,
            transaccion_id,
            data,
            archivo.content_type,
            archivo.filename or "soporte",
            uid,
        )
        registrar_log(
            current_user, "SUBIR", "CONTABILIDAD", "contabilidad_transaccion", str(transaccion_id),
            {"archivo": archivo.filename, "bytes": len(data)},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/transacciones/{transaccion_id}/soporte")
def descargar_soporte(
    transaccion_id: int,
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        data, mime, name = download_soporte_transaccion(sb, transaccion_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.delete("/transacciones/{transaccion_id}/soporte")
def eliminar_soporte(
    transaccion_id: int,
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = delete_soporte_transaccion(sb, transaccion_id, uid)
        registrar_log(
            current_user, "ELIMINAR", "CONTABILIDAD", "contabilidad_transaccion_soporte",
            str(transaccion_id), {},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/cuentas-especiales")
def obtener_cuentas_especiales(current_user=Depends(_require_ver)):
    sb = get_supabase()
    return get_cuentas_especiales(sb)


@router.get("/cuentas-especiales/movimientos")
def obtener_movimientos_cuentas(
    cuenta_tipo: Optional[str] = Query(None),
    subcuenta: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=1000),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    return {
        "items": list_movimientos_cuentas(
            sb,
            cuenta_tipo=cuenta_tipo,
            subcuenta=subcuenta,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            limit=limit,
        )
    }


@router.get("/ordenes-pago/pendientes")
def obtener_ordenes_pago_pendientes(current_user=Depends(_require_ver)):
    sb = get_supabase()
    return {"items": list_ordenes_pago_pendientes(sb)}


@router.get("/contratos")
def obtener_contratos_centro_costo(current_user=Depends(_require_ver)):
    sb = get_supabase()
    return {"items": list_contratos_centro_costo(sb)}


@router.get("/cierres")
def obtener_cierres(
    limit: int = Query(120, ge=1, le=200),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    return {"items": list_cierres(sb, limit=limit)}


@router.get("/cierres/{cierre_id}")
def obtener_cierre(
    cierre_id: int,
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        return get_cierre(sb, cierre_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/cierres/generar")
def generar_cierre(
    body: CierreGenerarBody,
    current_user=Depends(_require_crear),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = generar_cierre_mensual(sb, body.anio, body.mes, uid)
        registrar_log(
            current_user, "GENERAR", "CONTABILIDAD", "contabilidad_cierre_mensual",
            str(row.get("id")), {"anio": body.anio, "mes": body.mes},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/cierres/{cierre_id}/notas")
def editar_notas_cierre(
    cierre_id: int,
    body: CierreNotasBody,
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = update_notas_cierre(sb, cierre_id, body.notas, uid)
        registrar_log(
            current_user, "EDITAR", "CONTABILIDAD", "contabilidad_cierre_mensual",
            str(cierre_id), {"notas": bool(body.notas)},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/cierres/{cierre_id}/aprobar")
def aprobar_cierre(
    cierre_id: int,
    current_user=Depends(_require_validar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = aprobar_cierre_mensual(sb, cierre_id, uid)
        registrar_log(
            current_user, "APROBAR", "CONTABILIDAD", "contabilidad_cierre_mensual",
            str(cierre_id), {"anio": row.get("anio"), "mes": row.get("mes")},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/cierres/{cierre_id}/firmar")
def firmar_cierre(
    cierre_id: int,
    body: CierreFirmarBody,
    current_user=Depends(_require_validar),
):
    require_firma_cierre(current_user)
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = firmar_cierre_mensual(sb, cierre_id, uid, notas=body.notas)
        registrar_log(
            current_user, "FIRMAR", "CONTABILIDAD", "contabilidad_cierre_mensual",
            str(cierre_id),
            {"hash": row.get("firma_contenido_hash"), "anio": row.get("anio"), "mes": row.get("mes")},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/reportes/{tipo}")
def obtener_reporte_contabilidad(
    tipo: str,
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    anio: Optional[int] = Query(None, ge=2020, le=2100),
    current_user=Depends(_require_ver),
):
    t = (tipo or "").strip().lower()
    if t not in REPORTE_TIPOS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de reporte inválido. Opciones: {', '.join(sorted(REPORTE_TIPOS))}",
        )
    sb = get_supabase()
    return obtener_reporte(
        sb, t, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, anio=anio,
    )


@router.get("/export/{tipo}")
def exportar_contabilidad_excel(
    tipo: str,
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    anio: Optional[int] = Query(None, ge=2020, le=2100),
    cierre_id: Optional[int] = Query(None, ge=1),
    current_user=Depends(_require_exportar),
):
    t = (tipo or "").strip().lower()
    if t not in EXPORT_TIPOS:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de exportación inválido. Opciones: {', '.join(sorted(EXPORT_TIPOS))}",
        )
    sb = get_supabase()
    try:
        xbytes, filename = build_export_xlsx(
            sb,
            t,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            anio=anio,
            cierre_id=cierre_id,
        )
        registrar_log(
            current_user, "EXPORTAR", "CONTABILIDAD", "contabilidad_export", t,
            {"tipo": t, "anio": anio, "cierre_id": cierre_id},
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except Exception as exc:
        _log.exception("export contabilidad %s: %s", t, exc)
        raise HTTPException(status_code=500, detail=f"No se pudo generar Excel: {exc}") from exc

    return StreamingResponse(
        io.BytesIO(xbytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/documentos")
def obtener_documentos_empresa(
    categoria: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        return list_documentos_empresa(
            sb, categoria=categoria, q=q, limit=limit, offset=offset,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/documentos/alertas-vencimiento")
def obtener_alertas_vencimiento_documentos(
    dias_alerta: int = Query(30, ge=1, le=365),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    return alertas_vencimiento_documentos(sb, dias_alerta=dias_alerta)


@router.get("/documentos/{doc_id}")
def obtener_documento_empresa(
    doc_id: int,
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        return get_documento_empresa(sb, doc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/documentos")
async def subir_documento_empresa(
    archivo: UploadFile = File(...),
    categoria: str = Form(...),
    nombre: str = Form(...),
    descripcion: Optional[str] = Form(None),
    fecha_documento: Optional[str] = Form(None),
    fecha_vencimiento: Optional[str] = Form(None),
    current_user=Depends(_require_crear),
):
    sb = get_supabase()
    uid = _uid(current_user)
    data = await archivo.read()
    try:
        row = create_documento_empresa(
            sb,
            {
                "categoria": categoria,
                "nombre": nombre,
                "descripcion": descripcion,
                "fecha_documento": fecha_documento,
                "fecha_vencimiento": fecha_vencimiento,
            },
            data,
            archivo.content_type,
            archivo.filename or "documento",
            uid,
        )
        registrar_log(
            current_user, "CREAR", "CONTABILIDAD", "contabilidad_documento_empresa",
            str(row.get("id")),
            {"categoria": categoria, "nombre": nombre, "bytes": len(data)},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.patch("/documentos/{doc_id}")
def editar_documento_empresa(
    doc_id: int,
    body: DocumentoEmpresaUpdateBody,
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = update_documento_empresa(sb, doc_id, body.dict(exclude_unset=True), uid)
        registrar_log(
            current_user, "EDITAR", "CONTABILIDAD", "contabilidad_documento_empresa",
            str(doc_id), body.dict(exclude_unset=True),
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/documentos/{doc_id}/archivo")
def descargar_documento_empresa(
    doc_id: int,
    inline: bool = Query(True, description="True para vista previa en navegador"),
    current_user=Depends(_require_ver),
):
    sb = get_supabase()
    try:
        data, mime, name = download_documento_empresa(sb, doc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    dispo = "inline" if inline else "attachment"
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f'{dispo}; filename="{name}"'},
    )


@router.put("/documentos/{doc_id}/archivo")
async def reemplazar_archivo_documento_empresa(
    doc_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(_require_editar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    data = await archivo.read()
    try:
        row = replace_archivo_documento_empresa(
            sb,
            doc_id,
            data,
            archivo.content_type,
            archivo.filename or "documento",
            uid,
        )
        registrar_log(
            current_user, "REEMPLAZAR", "CONTABILIDAD", "contabilidad_documento_empresa",
            str(doc_id),
            {"archivo": archivo.filename, "bytes": len(data)},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/documentos/{doc_id}")
def eliminar_documento_empresa_route(
    doc_id: int,
    current_user=Depends(_require_eliminar),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        row = delete_documento_empresa(sb, doc_id, uid)
        registrar_log(
            current_user, "ELIMINAR", "CONTABILIDAD", "contabilidad_documento_empresa",
            str(doc_id), {"nombre": row.get("nombre")},
        )
        return row
    except ValueError as exc:
        raise _http_value_error(exc) from exc
