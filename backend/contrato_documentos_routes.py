"""
Rutas HTTP — documentos contractuales de licenciamiento (solo Desarrollador).

Prefijo: /admin/contratos/.../documentos-contractuales
"""
from __future__ import annotations

import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from contrato_documentos_pdf import PDFGeneracionNoDisponibleError, generar_pdf_contrato_licencia
from contrato_documentos_service import (
    download_documento_bytes,
    eliminar_documento_contractual,
    get_documento,
    licenciatario_desde_contrato,
    matriz_resumen,
    registrar_firmado,
    registrar_generado,
    resumen_contrato,
    update_doc_estado,
    upsert_licenciatario,
    validate_doc_estado,
)
from main import get_supabase, registrar_log, require_solo_desarrollador

_log = logging.getLogger("claracore.contrato_documentos.routes")

router = APIRouter(tags=["contratos-documentos-contractuales"])


def _http_value_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    if "no encontrado" in msg.lower():
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


class LicenciatarioBody(BaseModel):
    razon_social: str = Field(..., min_length=1, max_length=500)
    nit: Optional[str] = Field(None, max_length=80)
    representante_nombre: Optional[str] = Field(None, max_length=300)
    representante_cedula: Optional[str] = Field(None, max_length=40)
    direccion: Optional[str] = Field(None, max_length=500)
    email_notificaciones: Optional[str] = Field(None, max_length=200)
    identificacion_obra: Optional[str] = Field(None, max_length=500)
    valor_mensual: Optional[float] = Field(None, ge=0, description="Legacy: valor digitado si no hay valor_mensual_digitado")
    valor_mensual_digitado: Optional[float] = Field(None, ge=0)
    valor_mensual_iva_incluido: bool = False


class EstadoDocumentalBody(BaseModel):
    estado: str = Field(..., min_length=1, max_length=32)


class GenerarContratoBody(LicenciatarioBody):
    """Guarda licenciatario y genera PDF (Fase 3)."""


@router.get("/admin/contratos/documentos-contractuales/matriz")
def listar_matriz_documentos_contractuales(
    current_user=Depends(require_solo_desarrollador),
):
    """Vista matricial: todos los contratos con estado documental y firmado cargado."""
    sb = get_supabase()
    return {"filas": matriz_resumen(sb)}


@router.get("/admin/contratos/{contrato_id}/documentos-contractuales")
def obtener_documentos_contractuales_contrato(
    contrato_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    try:
        return resumen_contrato(sb, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.get("/admin/contratos/{contrato_id}/documentos-contractuales/licenciatario-prefill")
def prefill_licenciatario_desde_contrato(
    contrato_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    """Datos sugeridos desde contratos.contratista / nit (botón «Usar datos del contrato»)."""
    sb = get_supabase()
    try:
        return licenciatario_desde_contrato(sb, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc


@router.put("/admin/contratos/{contrato_id}/documentos-contractuales/licenciatario")
def guardar_licenciatario(
    contrato_id: int,
    body: LicenciatarioBody,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        saved = upsert_licenciatario(sb, contrato_id, body.dict(), uid)
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    return {"ok": True, "licenciatario": saved}


@router.patch("/admin/contratos/{contrato_id}/documentos-contractuales/estado")
def actualizar_estado_documental(
    contrato_id: int,
    body: EstadoDocumentalBody,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    try:
        prev = resumen_contrato(sb, contrato_id)
        prev_estado = prev.get("doc_contractual_estado")
        nuevo_estado = validate_doc_estado(body.estado)
        row = update_doc_estado(sb, contrato_id, nuevo_estado)
    except ValueError as exc:
        raise _http_value_error(exc) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "EDITAR",
        "ADMIN",
        "contrato_documento_contractual",
        str(contrato_id),
        {
            "accion": "cambio_estado_documental",
            "estado_anterior": prev_estado,
            "estado_nuevo": nuevo_estado,
        },
        valor_anterior={"doc_contractual_estado": prev_estado},
        valor_nuevo={"doc_contractual_estado": nuevo_estado},
    )
    return {
        "ok": True,
        "doc_contractual_estado": row.get("doc_contractual_estado"),
        "doc_contractual_updated_at": row.get("doc_contractual_updated_at"),
    }


@router.post("/admin/contratos/{contrato_id}/documentos-contractuales/generar")
def generar_contrato_licencia_pdf(
    contrato_id: int,
    body: GenerarContratoBody,
    current_user=Depends(require_solo_desarrollador),
):
    """
    Guarda datos del licenciatario, genera PDF y registra versión en historial.
    Sugiere estado «Generado» (confirmación manual en UI).
    """
    sb = get_supabase()
    uid = _uid(current_user)
    try:
        lic = upsert_licenciatario(sb, contrato_id, body.dict(), uid)
        contrato_row = (
            sb.table("contratos")
            .select("numero")
            .eq("id", int(contrato_id))
            .limit(1)
            .execute()
            .data
        )
        numero_contrato = (contrato_row[0].get("numero") if contrato_row else "") or ""
        pdf_bytes = generar_pdf_contrato_licencia(
            licenciatario=lic,
            numero_contrato=numero_contrato,
        )
        doc = registrar_generado(
            sb,
            contrato_id=contrato_id,
            pdf_bytes=pdf_bytes,
            licenciatario_snapshot={
                **lic,
                "numero_contrato": numero_contrato,
            },
            user_id=uid,
        )
    except PDFGeneracionNoDisponibleError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except RuntimeError as exc:
        _log.exception("generar contrato licencia contrato_id=%s", contrato_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        _log.exception("generar contrato licencia contrato_id=%s", contrato_id)
        raise HTTPException(status_code=500, detail=f"No se pudo generar el PDF: {exc}") from exc

    es_regeneracion = int(doc.get("version_num") or 1) > 1
    registrar_log(
        _audit_user(current_user, contrato_id),
        "CREAR" if not es_regeneracion else "EDITAR",
        "ADMIN",
        "contrato_documento_contractual",
        str(doc.get("id")),
        {
            "accion": "regenerar_pdf_licencia" if es_regeneracion else "generar_pdf_licencia",
            "contrato_id": contrato_id,
            "version_num": doc.get("version_num"),
            "tipo": "generado",
        },
    )
    return {
        "ok": True,
        "documento": doc,
        "sugerencia_estado": "generado",
        "mensaje_sugerencia": "El PDF fue generado. ¿Desea actualizar el estado documental a «Generado»?",
    }


@router.post("/admin/contratos/{contrato_id}/documentos-contractuales/firmado")
async def subir_documento_firmado(
    contrato_id: int,
    file: UploadFile = File(...),
    current_user=Depends(require_solo_desarrollador),
):
    """
    Carga contrato firmado (PDF o imagen). Imágenes se convierten a PDF.
    Sugiere estado «Firmado» (confirmación manual en UI).
    """
    sb = get_supabase()
    uid = _uid(current_user)
    raw = await file.read()
    try:
        doc = registrar_firmado(
            sb,
            contrato_id=contrato_id,
            data=raw,
            content_type=file.content_type,
            nombre_original=file.filename,
            user_id=uid,
        )
    except ValueError as exc:
        raise _http_value_error(exc) from exc
    except RuntimeError as exc:
        _log.exception("subir firmado contrato_id=%s", contrato_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _log.exception("subir firmado contrato_id=%s", contrato_id)
        raise HTTPException(
            status_code=503,
            detail="No se pudo almacenar el documento firmado en Azure Blob Storage.",
        ) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "CREAR",
        "ADMIN",
        "contrato_documento_contractual",
        str(doc.get("id")),
        {
            "accion": "cargar_documento_firmado",
            "contrato_id": contrato_id,
            "version_num": doc.get("version_num"),
            "nombre_archivo": doc.get("nombre_archivo"),
            "tamano_bytes": doc.get("tamano_bytes"),
        },
    )
    return {
        "ok": True,
        "documento": doc,
        "sugerencia_estado": "firmado",
        "mensaje_sugerencia": "Documento firmado cargado. ¿Desea actualizar el estado documental a «Firmado»?",
    }


@router.get("/admin/contratos/{contrato_id}/documentos-contractuales/archivo/{doc_id}")
def descargar_documento_contractual(
    contrato_id: int,
    doc_id: int,
    inline: bool = Query(False, description="True: visualizar en navegador; False: descarga"),
    current_user=Depends(require_solo_desarrollador),
):
    """Descarga autenticada desde contenedor Azure privado (sin URL pública)."""
    sb = get_supabase()
    doc = get_documento(sb, doc_id, contrato_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    try:
        data, mime, filename = download_documento_bytes(doc)
    except Exception as exc:
        _log.warning("descarga doc %s contrato %s: %s", doc_id, contrato_id, exc)
        raise HTTPException(status_code=404, detail="No se pudo leer el archivo almacenado") from exc

    disposition = "inline" if inline else "attachment"
    safe_name = filename.replace('"', "'")
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={
            "Content-Disposition": f'{disposition}; filename="{safe_name}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/admin/contratos/{contrato_id}/documentos-contractuales/{doc_id}")
def eliminar_documento_contractual_route(
    contrato_id: int,
    doc_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    sb = get_supabase()
    uid = _uid(current_user)
    prev = get_documento(sb, doc_id, contrato_id)
    if not prev:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    try:
        result = eliminar_documento_contractual(sb, doc_id, contrato_id)
    except ValueError as exc:
        raise _http_value_error(exc) from exc

    registrar_log(
        _audit_user(current_user, contrato_id),
        "ELIMINAR",
        "ADMIN",
        "contrato_documento_contractual",
        str(doc_id),
        {
            "accion": "eliminar_documento_contractual",
            "contrato_id": contrato_id,
            "tipo": result.get("tipo"),
            "version_num": result.get("version_num"),
            "consecutivo_liberado": result.get("consecutivo_liberado"),
        },
        valor_anterior={
            "tipo": prev.get("tipo"),
            "version_num": prev.get("version_num"),
            "nombre_archivo": prev.get("nombre_archivo"),
        },
    )
    return {"ok": True, **result, "eliminado_por": uid}
