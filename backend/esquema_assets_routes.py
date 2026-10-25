"""Rutas HTTP — archivos de esquema por contrato. Prefijo: /esquema/assets"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from esquema_assets_service import (
    download_asset,
    list_assets,
    mint_temp_token,
    temp_download_path,
    upload_asset,
    verify_temp_token,
)
from main import _require_contract_access, get_current_user

_log = logging.getLogger("claracore.esquema_assets.routes")
router = APIRouter(prefix="/esquema/assets", tags=["esquema-assets"])


class TempUrlBody(BaseModel):
    contrato_id: int
    blob_path: str = Field(..., min_length=3, max_length=500)
    ttl_seconds: int = 300


@router.post("/upload")
async def route_upload(
    contrato_id: int = Form(...),
    modulo: str = Form("esquema"),
    kind: str = Form("png"),
    title: str = Form("esquema"),
    reporte_id: Optional[str] = Form(None),
    reporte_nombre: Optional[str] = Form(None),
    registro_id: Optional[str] = Form(None),
    registro_nombre: Optional[str] = Form(None),
    replace_path: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, int(contrato_id))
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande")
    try:
        meta = upload_asset(
            contrato_id=int(contrato_id),
            modulo=modulo or "esquema",
            kind=kind or "png",
            data=data,
            title=title or "esquema",
            content_type=file.content_type,
            replace_path=replace_path,
            reporte_id=reporte_id,
            reporte_nombre=reporte_nombre,
            registro_id=registro_id,
            registro_nombre=registro_nombre,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        _log.exception("upload esquema asset")
        raise HTTPException(status_code=500, detail=str(exc) or "No se pudo subir") from exc
    return {"ok": True, **meta}


@router.get("/list")
def route_list(
    contrato_id: int = Query(...),
    modulo: str = Query("esquema"),
    reporte_id: Optional[str] = Query(None),
    registro_id: Optional[str] = Query(None),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, int(contrato_id))
    try:
        files = list_assets(
            contrato_id=int(contrato_id),
            modulo=modulo or "esquema",
            reporte_id=reporte_id,
            registro_id=registro_id,
        )
    except Exception as exc:
        _log.exception("list esquema assets")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True, "files": files}


@router.get("/download")
def route_download(
    contrato_id: int = Query(...),
    path: str = Query(..., min_length=3),
    current_user=Depends(get_current_user),
):
    _require_contract_access(current_user, int(contrato_id))
    try:
        data, mime = download_asset(path, int(contrato_id))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "No encontrado") from exc
    nombre = path.rsplit("/", 1)[-1]
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.post("/temp-url")
def route_temp_url(body: TempUrlBody, current_user=Depends(get_current_user)):
    _require_contract_access(current_user, int(body.contrato_id))
    try:
        minted = mint_temp_token(body.blob_path, int(body.contrato_id), body.ttl_seconds)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    url = temp_download_path(minted["blob_path"], minted["contrato_id"], minted["token"])
    return {
        "ok": True,
        "url": url,
        "exp": minted["exp"],
        "ttl_seconds": minted["ttl_seconds"],
        "blob_path": minted["blob_path"],
    }


@router.get("/temp-download")
def route_temp_download(
    contrato_id: int = Query(...),
    path: str = Query(..., min_length=3),
    token: str = Query(..., min_length=8),
):
    """Descarga con enlace temporal (sin Bearer). Vence en minutos."""
    if not verify_temp_token(path, int(contrato_id), token):
        raise HTTPException(status_code=403, detail="Enlace inválido o vencido")
    try:
        data, mime = download_asset(path, int(contrato_id))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "No encontrado") from exc
    nombre = path.rsplit("/", 1)[-1]
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )
