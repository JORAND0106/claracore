"""
Rutas HTTP — pólizas y documentos de subcontratistas.

Complementa los endpoints de CRUD/cortes/precios en main.py.
"""
from __future__ import annotations

import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from main import (
    _require_contract_access,
    get_current_user,
    registrar_log,
    supabase,
)
from subcontratistas_docs_service import (
    alertas_polizas_contrato,
    checklist_docs_corte,
    create_documento,
    create_poliza,
    download_documento,
    download_poliza,
    emitir_notificaciones_polizas,
    get_alerta_config,
    list_documentos,
    list_polizas,
    replace_archivo_poliza,
    resumen_alerta_polizas_sub,
    set_documento_vigente,
    soft_delete_documento,
    update_poliza_meta,
    upsert_alerta_config,
)

_log = logging.getLogger("claracore.subcontratistas.docs.routes")

router = APIRouter(tags=["subcontratistas-docs"])


def _m():
    """Lazy access a helpers definidos tarde en main.py (evita import circular)."""
    import main as m
    return m


def _es_admin_o_desarrollador(current_user):
    return _m()._es_admin_o_desarrollador(current_user)


def _es_desarrollador(current_user):
    return _m()._es_desarrollador(current_user)


def _fetch_subcontratista_row(sub_id: int) -> dict:
    return _m()._fetch_subcontratista_row(sub_id)


def _puede_gestionar_subcontratistas_admin(current_user, contrato_id=None) -> bool:
    return _m()._puede_gestionar_subcontratistas_admin(current_user, contrato_id)


def _require_acceso_cortes_subcontratista(current_user, sub_id: int, *, escribir: bool = False) -> dict:
    return _m()._require_acceso_cortes_subcontratista(current_user, sub_id, escribir=escribir)

def _uid(current_user) -> Optional[int]:
    try:
        return int(current_user.get("sub") or current_user.get("id") or 0) or None
    except (TypeError, ValueError):
        return None


def _require_admin_docs(current_user, contrato_id: int):
    _require_contract_access(current_user, contrato_id)
    if not _puede_gestionar_subcontratistas_admin(current_user, contrato_id):
        raise HTTPException(
            status_code=403,
            detail="No tiene permiso para gestionar documentación de subcontratistas.",
        )


def _destinatarios_subcontratistas_admin(contrato_id: int) -> List[int]:
    """Usuarios del contrato con permiso sobre subcontratistas (o admin/dev)."""
    ids: List[int] = []
    try:
        ucs = (
            supabase.table("usuario_contratos")
            .select("usuario_id")
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
            or []
        )
        uids = [int(u["usuario_id"]) for u in ucs if u.get("usuario_id") is not None]
        if not uids:
            return []
        users = (
            supabase.table("usuarios")
            .select("id, activo, rol_nombre, cargo_id")
            .in_("id", uids)
            .eq("activo", True)
            .execute()
            .data
            or []
        )
        for u in users:
            # Amplio: cualquier usuario activo del contrato con cargo admin-like,
            # más quienes tengan función subcontratistas en permisos.
            rol = (u.get("rol_nombre") or "").lower()
            if "desarrollador" in rol or "admin" in rol:
                ids.append(int(u["id"]))
                continue
            try:
                perms = (
                    supabase.table("permisos_cargo")
                    .select("funcion_nombre, ver, editar, crear")
                    .eq("cargo_id", u.get("cargo_id"))
                    .eq("contrato_id", int(contrato_id))
                    .execute()
                    .data
                    or []
                )
                for p in perms:
                    if (p.get("funcion_nombre") or "").lower() == "subcontratistas" and (
                        p.get("ver") or p.get("editar") or p.get("crear")
                    ):
                        ids.append(int(u["id"]))
                        break
            except Exception:
                continue
    except Exception:
        _log.exception("destinatarios alertas pólizas contrato=%s", contrato_id)
    return sorted(set(ids))


class PolizaMetaUpdate(BaseModel):
    tipo: Optional[str] = None
    tipo_otro_texto: Optional[str] = None
    fecha_vencimiento: Optional[str] = None
    valor_asegurado: Optional[float] = None
    notas: Optional[str] = None


class AlertaConfigUpdate(BaseModel):
    dias_alerta_1: int = Field(30, ge=1, le=365)
    dias_alerta_2: int = Field(15, ge=1, le=365)


# ── Checklist / estado documental ────────────────────────────────────────────

@router.get("/subcontratistas/{sub_id}/docs-checklist")
def get_docs_checklist(
    sub_id: int,
    fecha_inicio: str = Query(..., description="YYYY-MM-DD del corte a evaluar"),
    fecha_fin: Optional[str] = Query(None),
    corte_id: Optional[int] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_acceso_cortes_subcontratista(current_user, sub_id, escribir=False)
    return checklist_docs_corte(
        supabase,
        sub_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        corte_id=corte_id,
    )


# ── Pólizas ──────────────────────────────────────────────────────────────────

@router.get("/subcontratistas/{sub_id}/polizas")
def get_polizas(
    sub_id: int,
    incluir_historico: bool = Query(True),
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    return list_polizas(supabase, sub_id, incluir_historico=incluir_historico)


@router.post("/subcontratistas/{sub_id}/polizas")
async def post_poliza(
    sub_id: int,
    tipo: str = Form(...),
    fecha_vencimiento: str = Form(...),
    tipo_otro_texto: Optional[str] = Form(None),
    valor_asegurado: Optional[str] = Form(None),
    replaces_id: Optional[int] = Form(None),
    notas: Optional[str] = Form(None),
    archivo: Optional[UploadFile] = File(None),
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    contrato_id = int(sub["contrato_id"])
    _require_admin_docs(current_user, contrato_id)
    data = None
    content_type = None
    nombre = None
    if archivo is not None and archivo.filename:
        data = await archivo.read()
        content_type = archivo.content_type
        nombre = archivo.filename
    valor = None
    if valor_asegurado is not None and str(valor_asegurado).strip() != "":
        try:
            valor = float(str(valor_asegurado).replace(",", "").replace("$", "").strip())
        except ValueError as e:
            raise HTTPException(status_code=400, detail="Valor asegurado inválido.") from e
    try:
        nuevo = create_poliza(
            supabase,
            subcontratista_id=sub_id,
            contrato_id=contrato_id,
            tipo=tipo,
            tipo_otro_texto=tipo_otro_texto,
            fecha_vencimiento=fecha_vencimiento,
            valor_asegurado=valor,
            data=data,
            content_type=content_type,
            nombre_archivo=nombre,
            user_id=_uid(current_user),
            replaces_id=replaces_id,
            notas=notas,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    registrar_log(
        current_user, "CREAR", "SUBCONTRATISTAS", "poliza", str(nuevo.get("id", "")),
        {"subcontratista_id": sub_id, "tipo": tipo, "replaces_id": replaces_id},
    )
    return nuevo


@router.put("/subcontratistas/{sub_id}/polizas/{poliza_id}")
def put_poliza_meta(
    sub_id: int,
    poliza_id: int,
    body: PolizaMetaUpdate,
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    try:
        row = update_poliza_meta(
            supabase, poliza_id, sub_id, body.dict(exclude_unset=True), _uid(current_user)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    registrar_log(current_user, "EDITAR", "SUBCONTRATISTAS", "poliza", str(poliza_id), {})
    return row


@router.post("/subcontratistas/{sub_id}/polizas/{poliza_id}/archivo")
async def post_poliza_archivo(
    sub_id: int,
    poliza_id: int,
    archivo: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    contrato_id = int(sub["contrato_id"])
    _require_admin_docs(current_user, contrato_id)
    data = await archivo.read()
    try:
        row = replace_archivo_poliza(
            supabase,
            poliza_id,
            sub_id,
            contrato_id,
            data,
            archivo.content_type,
            archivo.filename or "poliza",
            _uid(current_user),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return row


@router.get("/subcontratistas/{sub_id}/polizas/{poliza_id}/archivo")
def get_poliza_archivo(
    sub_id: int,
    poliza_id: int,
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    try:
        data, mime, nombre = download_poliza(supabase, poliza_id, sub_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


# ── Documentos requeridos ────────────────────────────────────────────────────

@router.get("/subcontratistas/{sub_id}/documentos")
def get_documentos(
    sub_id: int,
    tipo: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    return list_documentos(supabase, sub_id, tipo=tipo)


@router.post("/subcontratistas/{sub_id}/documentos")
async def post_documento(
    sub_id: int,
    tipo: str = Form(...),
    archivo: UploadFile = File(...),
    version_label: Optional[str] = Form(None),
    periodo: Optional[str] = Form(None),
    corte_id: Optional[int] = Form(None),
    notas: Optional[str] = Form(None),
    marcar_vigente: bool = Form(True),
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    contrato_id = int(sub["contrato_id"])
    # Carga de seguridad social también permitida a quien gestiona cortes (admin)
    _require_admin_docs(current_user, contrato_id)
    data = await archivo.read()
    try:
        nuevo = create_documento(
            supabase,
            subcontratista_id=sub_id,
            contrato_id=contrato_id,
            tipo=tipo,
            data=data,
            content_type=archivo.content_type,
            nombre_archivo=archivo.filename or "documento",
            user_id=_uid(current_user),
            version_label=version_label,
            periodo=periodo,
            corte_id=corte_id,
            notas=notas,
            marcar_vigente=marcar_vigente,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    registrar_log(
        current_user, "CREAR", "SUBCONTRATISTAS", "documento", str(nuevo.get("id", "")),
        {"subcontratista_id": sub_id, "tipo": tipo, "periodo": periodo, "corte_id": corte_id},
    )
    return nuevo


@router.get("/subcontratistas/{sub_id}/documentos/{doc_id}/archivo")
def get_documento_archivo(
    sub_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    try:
        data, mime, nombre = download_documento(supabase, doc_id, sub_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return StreamingResponse(
        io.BytesIO(data),
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{nombre}"'},
    )


@router.post("/subcontratistas/{sub_id}/documentos/{doc_id}/vigente")
def post_documento_vigente(
    sub_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    try:
        return set_documento_vigente(supabase, doc_id, sub_id, _uid(current_user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/subcontratistas/{sub_id}/documentos/{doc_id}")
def delete_documento(
    sub_id: int,
    doc_id: int,
    current_user=Depends(get_current_user),
):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    try:
        return soft_delete_documento(supabase, doc_id, sub_id, _uid(current_user))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ── Alertas pólizas ──────────────────────────────────────────────────────────

@router.get("/subcontratistas/{contrato_id}/alertas-polizas")
def get_alertas_polizas(
    contrato_id: int,
    emitir: bool = Query(True, description="Si true, inserta notificaciones SISTEMA deduplicadas"),
    current_user=Depends(get_current_user),
):
    _require_admin_docs(current_user, contrato_id)
    alertas = alertas_polizas_contrato(supabase, contrato_id)
    enviadas = 0
    if emitir:
        dest = _destinatarios_subcontratistas_admin(contrato_id)
        # Asegurar que el usuario actual reciba si está en la lista; si no hay destinos, al menos él
        uid = _uid(current_user)
        if uid and uid not in dest:
            dest.append(uid)
        enviadas = emitir_notificaciones_polizas(
            supabase,
            contrato_id,
            dest,
            remitente_id=uid,
            remitente_nombre=(current_user.get("nombre") or "Sistema"),
        )
    alertas["notificaciones_enviadas"] = enviadas
    return alertas


@router.get("/subcontratistas/{contrato_id}/polizas-alerta-config")
def get_polizas_alerta_config(contrato_id: int, current_user=Depends(get_current_user)):
    _require_admin_docs(current_user, contrato_id)
    return get_alerta_config(supabase, contrato_id)


@router.put("/subcontratistas/{contrato_id}/polizas-alerta-config")
def put_polizas_alerta_config(
    contrato_id: int,
    body: AlertaConfigUpdate,
    current_user=Depends(get_current_user),
):
    _require_admin_docs(current_user, contrato_id)
    if not (
        _es_desarrollador(current_user)
        or _es_admin_o_desarrollador(current_user)
        or _puede_gestionar_subcontratistas_admin(current_user, contrato_id)
    ):
        raise HTTPException(status_code=403, detail="Sin permiso para configurar alertas.")
    return upsert_alerta_config(
        supabase,
        contrato_id,
        body.dias_alerta_1,
        body.dias_alerta_2,
        _uid(current_user),
    )


@router.get("/subcontratistas/{sub_id}/poliza-resumen")
def get_poliza_resumen(sub_id: int, current_user=Depends(get_current_user)):
    sub = _fetch_subcontratista_row(sub_id)
    _require_admin_docs(current_user, int(sub["contrato_id"]))
    cfg = get_alerta_config(supabase, int(sub["contrato_id"]))
    return resumen_alerta_polizas_sub(supabase, sub_id, cfg)
