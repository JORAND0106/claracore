"""Plantillas de campos para exportación Excel (por usuario / módulo)."""
from __future__ import annotations

from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from main import get_current_user, supabase

router = APIRouter(prefix="/export-plantillas", tags=["export-plantillas"])

MODULOS_VALIDOS = ("sicoe_obra",)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def _norm_nombre(nombre: str) -> str:
    return str(nombre or "").strip()


def _norm_campos(campos: Optional[List[Any]]) -> List[str]:
    out: List[str] = []
    seen = set()
    for c in campos or []:
        s = str(c or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _tabla_faltante(exc: Exception) -> bool:
    msg = str(exc)
    return "usuario_export_plantillas" in msg and ("does not exist" in msg or "PGRST205" in msg)


class CrearExportPlantillaBody(BaseModel):
    modulo: Literal["sicoe_obra"]
    nombre: str = Field(..., min_length=1, max_length=120)
    campos: List[str] = Field(default_factory=list)


class ActualizarExportPlantillaBody(BaseModel):
    nombre: Optional[str] = Field(None, min_length=1, max_length=120)
    campos: Optional[List[str]] = None


@router.get("/")
def listar_export_plantillas(
    modulo: str = Query(..., description="sicoe_obra"),
    current_user=Depends(get_current_user),
):
    mod = str(modulo or "").strip()
    if mod not in MODULOS_VALIDOS:
        raise HTTPException(status_code=422, detail="modulo debe ser sicoe_obra")
    uid = _uid(current_user)
    try:
        rows = (
            supabase.table("usuario_export_plantillas")
            .select("id, modulo, nombre, campos, creada_en, actualizada_en")
            .eq("usuario_id", uid)
            .eq("modulo", mod)
            .order("creada_en", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as e:
        if _tabla_faltante(e):
            raise HTTPException(
                status_code=503,
                detail="Falta la tabla usuario_export_plantillas en la base de datos. Ejecute backend/sql/migration_usuario_export_plantillas.sql.",
            )
        raise
    return rows


@router.post("/")
def crear_export_plantilla(body: CrearExportPlantillaBody, current_user=Depends(get_current_user)):
    uid = _uid(current_user)
    nombre = _norm_nombre(body.nombre)
    if not nombre:
        raise HTTPException(status_code=422, detail="nombre requerido")
    campos = _norm_campos(body.campos)
    if not campos:
        raise HTTPException(status_code=422, detail="Debe incluir al menos un campo en la plantilla.")
    try:
        row = (
            supabase.table("usuario_export_plantillas")
            .insert(
                {
                    "usuario_id": uid,
                    "modulo": body.modulo,
                    "nombre": nombre,
                    "campos": campos,
                }
            )
            .execute()
            .data
        )
    except Exception as e:
        msg = str(e)
        if _tabla_faltante(e):
            raise HTTPException(
                status_code=503,
                detail="Falta la tabla usuario_export_plantillas en la base de datos. Ejecute backend/sql/migration_usuario_export_plantillas.sql.",
            )
        if "uq_usuario_export_plantillas" in msg or "duplicate key" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe una plantilla con el nombre «{nombre}».",
            )
        raise HTTPException(status_code=500, detail=f"No se pudo crear la plantilla: {msg[:240]}")
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear la plantilla")
    return row[0]


@router.put("/{plantilla_id}")
def actualizar_export_plantilla(
    plantilla_id: int,
    body: ActualizarExportPlantillaBody,
    current_user=Depends(get_current_user),
):
    uid = _uid(current_user)
    if body.nombre is None and body.campos is None:
        raise HTTPException(status_code=422, detail="Indique nombre y/o campos a actualizar")

    existing = (
        supabase.table("usuario_export_plantillas")
        .select("id")
        .eq("id", plantilla_id)
        .eq("usuario_id", uid)
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")

    patch: dict = {}
    if body.nombre is not None:
        nombre = _norm_nombre(body.nombre)
        if not nombre:
            raise HTTPException(status_code=422, detail="nombre requerido")
        patch["nombre"] = nombre
    if body.campos is not None:
        campos = _norm_campos(body.campos)
        if not campos:
            raise HTTPException(status_code=422, detail="Debe incluir al menos un campo en la plantilla.")
        patch["campos"] = campos

    # actualizada_en: la DB puede tener DEFAULT, forzamos vía now() en cliente ISO si PostgREST no tiene trigger.
    from datetime import datetime, timezone

    patch["actualizada_en"] = datetime.now(timezone.utc).isoformat()

    try:
        row = (
            supabase.table("usuario_export_plantillas")
            .update(patch)
            .eq("id", plantilla_id)
            .eq("usuario_id", uid)
            .execute()
            .data
        )
    except Exception as e:
        msg = str(e)
        if _tabla_faltante(e):
            raise HTTPException(
                status_code=503,
                detail="Falta la tabla usuario_export_plantillas en la base de datos. Ejecute backend/sql/migration_usuario_export_plantillas.sql.",
            )
        if "uq_usuario_export_plantillas" in msg or "duplicate key" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Ya existe otra plantilla con ese nombre.",
            )
        raise HTTPException(status_code=500, detail=f"No se pudo actualizar la plantilla: {msg[:240]}")
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo actualizar la plantilla")
    return row[0]


@router.delete("/{plantilla_id}")
def eliminar_export_plantilla(plantilla_id: int, current_user=Depends(get_current_user)):
    uid = _uid(current_user)
    existing = (
        supabase.table("usuario_export_plantillas")
        .select("id")
        .eq("id", plantilla_id)
        .eq("usuario_id", uid)
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    supabase.table("usuario_export_plantillas").delete().eq("id", plantilla_id).eq("usuario_id", uid).execute()
    return {"ok": True}
