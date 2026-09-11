"""
Rutas HTTP — módulo RRHH (Documentación para contratación).
Prefijo: /rrhh
"""
from __future__ import annotations

import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from main import _require_contract_access, get_current_user, registrar_log, supabase
from rrhh_docs_service import (
    catalogo_tipos_documento,
    create_documento,
    download_contrato_generado,
    download_documento,
    generar_contrato_laboral,
    list_contratos_generados,
    list_documentos,
    marcar_documento_vigente,
    soft_delete_contrato_generado,
    soft_delete_documento,
)
from rrhh_permissions import require_permiso_rrhh, tiene_permiso_rrhh
from rrhh_banco_ocr import ocr_certificacion_bancaria
from rrhh_documentacion_service import (
    consolidar_documentacion,
    download_doc_consolidado,
    eliminar_tipo_documento_otro,
    set_validacion,
)
from rrhh_nomina_service import (
    anular_nomina,
    cerrar_nomina,
    create_hora_extra,
    create_novedad,
    download_desprendible,
    download_liquidacion_pdf,
    download_nomina_xlsx,
    generar_liquidacion,
    generar_nomina,
    get_liquidacion,
    get_nomina,
    get_provisiones,
    list_horas_extras,
    list_liquidaciones,
    list_nomina_items,
    list_nominas,
    list_novedades,
    regenerar_nomina_borrador,
    soft_delete_hora_extra,
    soft_delete_novedad,
)
from rrhh_service import (
    add_catalogo_opcion,
    clear_trabajador_imagen,
    create_trabajador,
    download_trabajador_imagen,
    get_trabajador,
    list_catalogo,
    list_catalogo_todos,
    list_empresas_contratantes,
    list_trabajadores,
    set_trabajador_imagen,
    soft_delete_trabajador,
    update_trabajador,
)

_log = logging.getLogger("claracore.rrhh.routes")

router = APIRouter(prefix="/rrhh", tags=["rrhh"])


def _http_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "no encontrado" in msg.lower():
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=400, detail=msg)


def _audit(current_user, contrato_id: int) -> dict:
    u = dict(current_user or {})
    u["contrato_id"] = int(contrato_id)
    return u


class CatalogoOpcionBody(BaseModel):
    valor: str = Field(..., min_length=1, max_length=200)


class TrabajadorBody(BaseModel):
    nombres: str = Field(..., min_length=1, max_length=200)
    apellidos: str = Field(..., min_length=1, max_length=200)
    tipo_documento: str = Field("CC", max_length=20)
    numero_documento: str = Field(..., min_length=3, max_length=40)
    lugar_expedicion: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    genero: Optional[str] = None
    tipo_sangre: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    emergencia_nombre: Optional[str] = None
    emergencia_parentesco: Optional[str] = None
    emergencia_telefono: Optional[str] = None
    eps: Optional[str] = None
    pension: Optional[str] = None
    cesantias: Optional[str] = None
    arl: Optional[str] = None
    caja_compensacion: Optional[str] = None
    cargo_aspira: Optional[str] = None
    salario: Optional[float] = None
    salario_liquidable: bool = True
    subsidio_transporte: bool = False
    periodicidad: str = Field("mensual", max_length=20)
    arl_nivel_riesgo: str = Field("I", max_length=5)
    fecha_ingreso: Optional[str] = None
    fecha_retiro: Optional[str] = None
    banco_entidad: Optional[str] = None
    banco_tipo_cuenta: Optional[str] = None
    banco_numero_cuenta: Optional[str] = None
    tipo_contrato: Optional[str] = None
    empresa_key: Optional[str] = Field(None, max_length=80)
    empresa_tipo: str = Field("consorcio", max_length=40)
    empresa_subcontratista_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    empresa_nit: Optional[str] = None
    estado: Optional[str] = "activo"
    notas: Optional[str] = None


class TrabajadorPatchBody(BaseModel):
    nombres: Optional[str] = Field(None, min_length=1, max_length=200)
    apellidos: Optional[str] = Field(None, min_length=1, max_length=200)
    tipo_documento: Optional[str] = Field(None, max_length=20)
    numero_documento: Optional[str] = Field(None, min_length=3, max_length=40)
    lugar_expedicion: Optional[str] = None
    fecha_nacimiento: Optional[str] = None
    genero: Optional[str] = None
    tipo_sangre: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    emergencia_nombre: Optional[str] = None
    emergencia_parentesco: Optional[str] = None
    emergencia_telefono: Optional[str] = None
    eps: Optional[str] = None
    pension: Optional[str] = None
    cesantias: Optional[str] = None
    arl: Optional[str] = None
    caja_compensacion: Optional[str] = None
    cargo_aspira: Optional[str] = None
    salario: Optional[float] = None
    salario_liquidable: Optional[bool] = None
    subsidio_transporte: Optional[bool] = None
    periodicidad: Optional[str] = Field(None, max_length=20)
    arl_nivel_riesgo: Optional[str] = Field(None, max_length=5)
    fecha_ingreso: Optional[str] = None
    fecha_retiro: Optional[str] = None
    banco_entidad: Optional[str] = None
    banco_tipo_cuenta: Optional[str] = None
    banco_numero_cuenta: Optional[str] = None
    tipo_contrato: Optional[str] = None
    empresa_key: Optional[str] = Field(None, max_length=80)
    empresa_tipo: Optional[str] = Field(None, max_length=40)
    empresa_subcontratista_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    empresa_nit: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None


class GenerarContratoBody(BaseModel):
    tipo_contrato: Optional[str] = Field(None, max_length=200)
    tipo_contrato_id: Optional[int] = None  # legacy ignored
    numero_contrato_laboral: Optional[str] = Field(None, max_length=80)
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None


class ValidacionDocBody(BaseModel):
    estado: str = Field(..., max_length=20)
    observacion: Optional[str] = None


class EliminarTipoOtroBody(BaseModel):
    categoria: str = Field(..., max_length=40)
    label: str = Field(..., min_length=1, max_length=200)


class NovedadBody(BaseModel):
    trabajador_id: int
    tipo: str = Field(..., max_length=40)
    fecha_inicio: str
    fecha_fin: str
    dias: Optional[float] = None
    porcentaje_pago: float = 0
    notas: Optional[str] = None


class HoraExtraBody(BaseModel):
    trabajador_id: int
    tipo: str = Field(..., max_length=40)
    fecha: str
    cantidad_horas: float = 0
    valor_fijo: Optional[float] = None
    notas: Optional[str] = None


class GenerarNominaBody(BaseModel):
    periodicidad: str = Field(..., max_length=20)
    anio: int
    mes: int
    quincena: Optional[int] = None
    notas: Optional[str] = None


class LiquidacionBody(BaseModel):
    trabajador_id: int
    fecha_retiro: str
    causa: Optional[str] = None
    indemnizacion: float = 0
    salario_pendiente: float = 0
    dias_vacaciones_pendientes: Optional[float] = None


# ── Catálogos auxiliares ──────────────────────────────────────────────────────

@router.get("/{contrato_id}/catalogos/documentos")
def route_catalogo_docs(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return catalogo_tipos_documento()


@router.get("/{contrato_id}/empresas-contratantes")
def route_empresas(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return list_empresas_contratantes(supabase, contrato_id)


@router.get("/{contrato_id}/catalogo-opciones")
def route_catalogo_todos(contrato_id: int, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {"categorias": list_catalogo_todos(supabase, contrato_id)}


@router.get("/{contrato_id}/catalogo-opciones/{categoria}")
def route_catalogo_cat(contrato_id: int, categoria: str, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        items = list_catalogo(supabase, contrato_id, categoria)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"items": items, "valores": [r.get("valor") for r in items if r.get("valor")]}


@router.post("/{contrato_id}/catalogo-opciones/{categoria}")
def route_catalogo_add(
    contrato_id: int,
    categoria: str,
    body: CatalogoOpcionBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = add_catalogo_opcion(supabase, contrato_id, categoria, body.valor, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_catalogo_opciones",
        str(row.get("id")),
        f"Catálogo {categoria}: {row.get('valor')}",
    )
    return row


# ── Trabajadores ──────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/trabajadores")
def route_list_trabajadores(
    contrato_id: int,
    q: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {"items": list_trabajadores(supabase, contrato_id, q=q, estado=estado)}


@router.post("/{contrato_id}/trabajadores")
def route_create_trabajador(
    contrato_id: int,
    body: TrabajadorBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = create_trabajador(supabase, contrato_id, body.model_dump(), current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_trabajadores",
        str(row.get("id")),
        f"Trabajador: {row.get('nombres')} {row.get('apellidos')}",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}")
def route_get_trabajador(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        return get_trabajador(supabase, contrato_id, trabajador_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/{contrato_id}/trabajadores/{trabajador_id}")
def route_update_trabajador(
    contrato_id: int,
    trabajador_id: int,
    body: TrabajadorPatchBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        row = update_trabajador(
            supabase,
            contrato_id,
            trabajador_id,
            body.model_dump(exclude_unset=True),
            current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "EDITAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        f"Trabajador actualizado: {row.get('nombres')} {row.get('apellidos')}",
    )
    return row


@router.delete("/{contrato_id}/trabajadores/{trabajador_id}")
def route_delete_trabajador(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        row = soft_delete_trabajador(supabase, contrato_id, trabajador_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ELIMINAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        "Trabajador eliminado (soft)",
    )
    return row


# ── Foto / firma del trabajador ───────────────────────────────────────────────

@router.post("/{contrato_id}/trabajadores/{trabajador_id}/foto")
async def route_upload_foto(
    contrato_id: int,
    trabajador_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not (
        tiene_permiso_rrhh(current_user, "editar", contrato_id)
        or tiene_permiso_rrhh(current_user, "crear", contrato_id)
    ):
        require_permiso_rrhh(current_user, "editar", contrato_id)
    data = await archivo.read()
    try:
        row = set_trabajador_imagen(
            supabase,
            contrato_id,
            trabajador_id,
            kind="foto",
            archivo_bytes=data,
            nombre_archivo=archivo.filename or "foto.jpg",
            content_type=archivo.content_type,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "EDITAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        "Foto del trabajador actualizada",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/foto")
def route_get_foto(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, trab = download_trabajador_imagen(
            supabase, contrato_id, trabajador_id, kind="foto"
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=trab.get("foto_mime_type") or "image/jpeg",
        headers={
            "Content-Disposition": f'inline; filename="{trab.get("foto_nombre_archivo") or "foto.jpg"}"'
        },
    )


@router.delete("/{contrato_id}/trabajadores/{trabajador_id}/foto")
def route_delete_foto(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        row = clear_trabajador_imagen(
            supabase, contrato_id, trabajador_id, kind="foto", current_user=current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return row


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/firma")
async def route_upload_firma(
    contrato_id: int,
    trabajador_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not (
        tiene_permiso_rrhh(current_user, "editar", contrato_id)
        or tiene_permiso_rrhh(current_user, "crear", contrato_id)
    ):
        require_permiso_rrhh(current_user, "editar", contrato_id)
    data = await archivo.read()
    try:
        row = set_trabajador_imagen(
            supabase,
            contrato_id,
            trabajador_id,
            kind="firma",
            archivo_bytes=data,
            nombre_archivo=archivo.filename or "firma.png",
            content_type=archivo.content_type or "image/png",
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "EDITAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        "Firma del trabajador actualizada",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/firma")
def route_get_firma(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, trab = download_trabajador_imagen(
            supabase, contrato_id, trabajador_id, kind="firma"
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=trab.get("firma_mime_type") or "image/png",
        headers={
            "Content-Disposition": f'inline; filename="{trab.get("firma_nombre_archivo") or "firma.png"}"'
        },
    )


@router.delete("/{contrato_id}/trabajadores/{trabajador_id}/firma")
def route_delete_firma(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        row = clear_trabajador_imagen(
            supabase, contrato_id, trabajador_id, kind="firma", current_user=current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return row


# ── Documentos ────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/trabajadores/{trabajador_id}/documentos")
def route_list_docs(
    contrato_id: int,
    trabajador_id: int,
    categoria: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        return {"items": list_documentos(supabase, contrato_id, trabajador_id, categoria=categoria)}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/documentos")
async def route_upload_doc(
    contrato_id: int,
    trabajador_id: int,
    categoria: str = Form(...),
    tipo: str = Form(...),
    archivo: UploadFile = File(...),
    version_label: Optional[str] = Form(None),
    tipo_otro_texto: Optional[str] = Form(None),
    notas: Optional[str] = Form(None),
    marcar_vigente: bool = Form(True),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    data = await archivo.read()
    try:
        row = create_documento(
            supabase,
            contrato_id,
            trabajador_id,
            categoria=categoria,
            tipo=tipo,
            archivo_bytes=data,
            nombre_archivo=archivo.filename or "documento.pdf",
            content_type=archivo.content_type,
            current_user=current_user,
            version_label=version_label,
            tipo_otro_texto=tipo_otro_texto,
            notas=notas,
            marcar_vigente=marcar_vigente,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_trabajador_documentos",
        str(row.get("id")),
        f"Documento {categoria}/{tipo} trabajador {trabajador_id}",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/documentos/{doc_id}/archivo")
def route_download_doc(
    contrato_id: int,
    trabajador_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, doc = download_documento(supabase, contrato_id, trabajador_id, doc_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=doc.get("mime_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{doc.get("nombre_archivo") or "documento"}"'
        },
    )


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/documentos/{doc_id}/vigente")
def route_doc_vigente(
    contrato_id: int,
    trabajador_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        return marcar_documento_vigente(supabase, contrato_id, trabajador_id, doc_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.delete("/{contrato_id}/trabajadores/{trabajador_id}/documentos/{doc_id}")
def route_delete_doc(
    contrato_id: int,
    trabajador_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        row = soft_delete_documento(supabase, contrato_id, trabajador_id, doc_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ELIMINAR",
        "RRHH",
        "rrhh_trabajador_documentos",
        str(doc_id),
        f"Documento eliminado trabajador {trabajador_id}",
    )
    return row


# ── Contratos laborales PDF ───────────────────────────────────────────────────

@router.get("/{contrato_id}/trabajadores/{trabajador_id}/contratos-laborales")
def route_list_contratos_lab(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        return {"items": list_contratos_generados(supabase, contrato_id, trabajador_id)}
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/contratos-laborales/generar")
def route_generar_contrato(
    contrato_id: int,
    trabajador_id: int,
    body: GenerarContratoBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = generar_contrato_laboral(
            supabase,
            contrato_id,
            trabajador_id,
            current_user=current_user,
            tipo_contrato=body.tipo_contrato,
            numero_contrato_laboral=body.numero_contrato_laboral,
            fecha_inicio=body.fecha_inicio,
            fecha_fin=body.fecha_fin,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except Exception as exc:
        _log.exception("Error generando contrato laboral RRHH")
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_contratos_generados",
        str(row.get("id")),
        f"Contrato laboral v{row.get('version_num')} trabajador {trabajador_id}",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/contratos-laborales/{gen_id}/archivo")
def route_download_contrato(
    contrato_id: int,
    trabajador_id: int,
    gen_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not (
        tiene_permiso_rrhh(current_user, "ver", contrato_id)
        or tiene_permiso_rrhh(current_user, "exportar", contrato_id)
    ):
        require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, doc = download_contrato_generado(supabase, contrato_id, trabajador_id, gen_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type=doc.get("mime_type") or "application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{doc.get("nombre_archivo") or "contrato.pdf"}"'
        },
    )


@router.delete("/{contrato_id}/trabajadores/{trabajador_id}/contratos-laborales/{gen_id}")
def route_delete_contrato(
    contrato_id: int,
    trabajador_id: int,
    gen_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        row = soft_delete_contrato_generado(
            supabase, contrato_id, trabajador_id, gen_id, current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ELIMINAR",
        "RRHH",
        "rrhh_contratos_generados",
        str(gen_id),
        f"Contrato laboral anulado trabajador {trabajador_id}",
    )
    return row


# ── Novedades ────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/novedades")
def route_list_novedades(
    contrato_id: int,
    trabajador_id: Optional[int] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {
        "items": list_novedades(
            supabase,
            contrato_id,
            trabajador_id=trabajador_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )
    }


@router.post("/{contrato_id}/novedades")
def route_create_novedad(
    contrato_id: int,
    body: NovedadBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = create_novedad(supabase, contrato_id, body.model_dump(), current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_novedades",
        str(row.get("id")),
        f"Novedad {row.get('tipo')} trabajador {row.get('trabajador_id')}",
    )
    return row


@router.delete("/{contrato_id}/novedades/{novedad_id}")
def route_delete_novedad(
    contrato_id: int,
    novedad_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        soft_delete_novedad(supabase, contrato_id, novedad_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"ok": True}


# ── Horas extras / recargos ──────────────────────────────────────────────────

@router.get("/{contrato_id}/horas-extras")
def route_list_horas_extras(
    contrato_id: int,
    trabajador_id: Optional[int] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {
        "items": list_horas_extras(
            supabase,
            contrato_id,
            trabajador_id=trabajador_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )
    }


@router.post("/{contrato_id}/horas-extras")
def route_create_hora_extra(
    contrato_id: int,
    body: HoraExtraBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = create_hora_extra(supabase, contrato_id, body.model_dump(), current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_horas_extras",
        str(row.get("id")),
        f"Hora extra {row.get('tipo')} trabajador {row.get('trabajador_id')}",
    )
    return row


@router.delete("/{contrato_id}/horas-extras/{he_id}")
def route_delete_hora_extra(
    contrato_id: int,
    he_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        soft_delete_hora_extra(supabase, contrato_id, he_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"ok": True}


# ── Nóminas ──────────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/nominas")
def route_list_nominas(
    contrato_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {"items": list_nominas(supabase, contrato_id)}


@router.post("/{contrato_id}/nominas/generar")
def route_generar_nomina(
    contrato_id: int,
    body: GenerarNominaBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        result = generar_nomina(
            supabase,
            contrato_id,
            periodicidad=body.periodicidad,
            anio=body.anio,
            mes=body.mes,
            quincena=body.quincena,
            current_user=current_user,
            notas=body.notas,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    nom = result["nomina"]
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_nominas",
        str(nom.get("id")),
        f"Nómina {nom.get('periodicidad')} {nom.get('mes')}/{nom.get('anio')}",
    )
    return result


@router.get("/{contrato_id}/nominas/{nomina_id}")
def route_get_nomina(
    contrato_id: int,
    nomina_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        nomina = get_nomina(supabase, contrato_id, nomina_id)
        items = list_nomina_items(supabase, contrato_id, nomina_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"nomina": nomina, "items": items}


@router.post("/{contrato_id}/nominas/{nomina_id}/regenerar")
def route_regenerar_nomina(
    contrato_id: int,
    nomina_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        result = regenerar_nomina_borrador(
            supabase, contrato_id, nomina_id, current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return result


@router.post("/{contrato_id}/nominas/{nomina_id}/cerrar")
def route_cerrar_nomina(
    contrato_id: int,
    nomina_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    try:
        result = cerrar_nomina(supabase, contrato_id, nomina_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ACTUALIZAR",
        "RRHH",
        "rrhh_nominas",
        str(nomina_id),
        "Nómina cerrada — desprendibles, emails y xlsx",
    )
    return result


@router.post("/{contrato_id}/nominas/{nomina_id}/anular")
def route_anular_nomina(
    contrato_id: int,
    nomina_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        row = anular_nomina(supabase, contrato_id, nomina_id, current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return row


@router.get("/{contrato_id}/nominas/{nomina_id}/xlsx")
def route_download_nomina_xlsx(
    contrato_id: int,
    nomina_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, name = download_nomina_xlsx(supabase, contrato_id, nomina_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{contrato_id}/nominas/{nomina_id}/items/{item_id}/desprendible")
def route_download_desprendible(
    contrato_id: int,
    nomina_id: int,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, name = download_desprendible(supabase, contrato_id, nomina_id, item_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


# ── Liquidaciones ────────────────────────────────────────────────────────────

@router.get("/{contrato_id}/liquidaciones")
def route_list_liquidaciones(
    contrato_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return {"items": list_liquidaciones(supabase, contrato_id)}


@router.post("/{contrato_id}/liquidaciones")
def route_generar_liquidacion(
    contrato_id: int,
    body: LiquidacionBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "crear", contrato_id)
    try:
        row = generar_liquidacion(
            supabase, contrato_id, body.model_dump(), current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_liquidaciones",
        str(row.get("id")),
        f"Liquidación trabajador {row.get('trabajador_id')}",
    )
    return row


@router.get("/{contrato_id}/liquidaciones/{liq_id}")
def route_get_liquidacion(
    contrato_id: int,
    liq_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        return get_liquidacion(supabase, contrato_id, liq_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/{contrato_id}/liquidaciones/{liq_id}/pdf")
def route_download_liquidacion_pdf(
    contrato_id: int,
    liq_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    try:
        data, name = download_liquidacion_pdf(supabase, contrato_id, liq_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/provisiones")
def route_get_provisiones(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    return get_provisiones(supabase, contrato_id, trabajador_id)


# ── Documentación consolidada / validación / OCR bancario ────────────────────

def _puede_validar_docs(current_user, contrato_id: int) -> bool:
    from rrhh_permissions import es_desarrollador_rrhh
    try:
        return es_desarrollador_rrhh(current_user) or tiene_permiso_rrhh(
            current_user, "validar", contrato_id
        )
    except Exception:
        # Fallback si helper no existe
        cargo = str(
            (current_user or {}).get("cargo_nombre")
            or (current_user or {}).get("cargo")
            or ""
        ).lower()
        if "desarrollador" in cargo:
            return True
        return tiene_permiso_rrhh(current_user, "validar", contrato_id)


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/documentacion/ocr-bancario")
async def route_ocr_bancario(
    contrato_id: int,
    trabajador_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "editar", contrato_id)
    data = await archivo.read()
    return ocr_certificacion_bancaria(data, archivo.content_type)


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/documentacion/consolidar")
def route_consolidar_documentacion(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not _puede_validar_docs(current_user, contrato_id):
        # También permitir editar para re-ejecutar tras correcciones
        if not (
            tiene_permiso_rrhh(current_user, "editar", contrato_id)
            or tiene_permiso_rrhh(current_user, "crear", contrato_id)
        ):
            raise HTTPException(403, detail="Sin permiso para consolidar documentación.")
    try:
        result = consolidar_documentacion(
            supabase, contrato_id, trabajador_id, current_user
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ACTUALIZAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        "Consolidar documentación / auditoría",
    )
    return result


@router.post("/{contrato_id}/trabajadores/{trabajador_id}/documentacion/validacion")
def route_set_validacion(
    contrato_id: int,
    trabajador_id: int,
    body: ValidacionDocBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not _puede_validar_docs(current_user, contrato_id):
        raise HTTPException(403, detail="Se requiere permiso Validar (o rol Desarrollador).")
    try:
        row = set_validacion(
            supabase,
            contrato_id,
            trabajador_id,
            estado=body.estado,
            observacion=body.observacion,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "ACTUALIZAR",
        "RRHH",
        "rrhh_trabajadores",
        str(trabajador_id),
        f"Validación documental → {body.estado}",
    )
    return row


@router.get("/{contrato_id}/trabajadores/{trabajador_id}/documentacion/consolidado")
def route_download_consolidado(
    contrato_id: int,
    trabajador_id: int,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    if not (
        tiene_permiso_rrhh(current_user, "ver", contrato_id)
        or tiene_permiso_rrhh(current_user, "exportar", contrato_id)
    ):
        raise HTTPException(403, detail="Sin permiso.")
    try:
        data, name = download_doc_consolidado(supabase, contrato_id, trabajador_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{name}"'},
    )


@router.post("/{contrato_id}/documentacion/eliminar-tipo-otro")
def route_eliminar_tipo_otro(
    contrato_id: int,
    body: EliminarTipoOtroBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "eliminar", contrato_id)
    try:
        result = eliminar_tipo_documento_otro(
            supabase,
            contrato_id,
            categoria=body.categoria,
            label=body.label,
            current_user=current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return result
