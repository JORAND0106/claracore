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
from rrhh_permissions import require_admin_catalogo_rrhh, require_permiso_rrhh, tiene_permiso_rrhh
from rrhh_service import (
    create_tipo_contrato,
    create_trabajador,
    ensure_tipos_contrato_default,
    list_empresas_contratantes,
    list_tipos_contrato,
    list_trabajadores,
    soft_delete_trabajador,
    update_tipo_contrato,
    update_trabajador,
    get_trabajador,
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


class TipoContratoBody(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=200)
    descripcion: Optional[str] = Field(None, max_length=1000)
    activo: bool = True
    orden: int = 0


class TipoContratoPatchBody(BaseModel):
    nombre: Optional[str] = Field(None, min_length=2, max_length=200)
    descripcion: Optional[str] = Field(None, max_length=1000)
    activo: Optional[bool] = None
    orden: Optional[int] = None


class TrabajadorBody(BaseModel):
    nombres: str = Field(..., min_length=1, max_length=200)
    apellidos: str = Field(..., min_length=1, max_length=200)
    tipo_documento: str = Field("CC", max_length=20)
    numero_documento: str = Field(..., min_length=3, max_length=40)
    fecha_nacimiento: Optional[str] = None
    genero: Optional[str] = None
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
    subsidio_transporte: bool = False
    tipo_contrato_id: Optional[int] = None
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
    fecha_nacimiento: Optional[str] = None
    genero: Optional[str] = None
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
    subsidio_transporte: Optional[bool] = None
    tipo_contrato_id: Optional[int] = None
    empresa_tipo: Optional[str] = Field(None, max_length=40)
    empresa_subcontratista_id: Optional[int] = None
    empresa_nombre: Optional[str] = None
    empresa_nit: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None


class GenerarContratoBody(BaseModel):
    tipo_contrato_id: Optional[int] = None
    numero_contrato_laboral: Optional[str] = Field(None, max_length=80)
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None


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


# ── Tipos de contrato ─────────────────────────────────────────────────────────

@router.get("/{contrato_id}/tipos-contrato")
def route_list_tipos(
    contrato_id: int,
    solo_activos: bool = Query(False),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_permiso_rrhh(current_user, "ver", contrato_id)
    ensure_tipos_contrato_default(supabase, contrato_id, current_user)
    return {"items": list_tipos_contrato(supabase, contrato_id, solo_activos=solo_activos)}


@router.post("/{contrato_id}/tipos-contrato")
def route_create_tipo(
    contrato_id: int,
    body: TipoContratoBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_admin_catalogo_rrhh(current_user, contrato_id)
    try:
        row = create_tipo_contrato(supabase, contrato_id, body.model_dump(), current_user)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "CREAR",
        "RRHH",
        "rrhh_tipos_contrato",
        str(row.get("id")),
        f"Tipo contrato laboral: {row.get('nombre')}",
    )
    return row


@router.put("/{contrato_id}/tipos-contrato/{tipo_id}")
def route_update_tipo(
    contrato_id: int,
    tipo_id: int,
    body: TipoContratoPatchBody,
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, contrato_id)
    require_admin_catalogo_rrhh(current_user, contrato_id)
    try:
        row = update_tipo_contrato(
            supabase,
            contrato_id,
            tipo_id,
            body.model_dump(exclude_unset=True),
            current_user,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    registrar_log(
        _audit(current_user, contrato_id),
        "EDITAR",
        "RRHH",
        "rrhh_tipos_contrato",
        str(tipo_id),
        f"Tipo contrato laboral actualizado: {row.get('nombre')}",
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
            tipo_contrato_id=body.tipo_contrato_id,
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
