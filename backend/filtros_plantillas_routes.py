"""Plantillas de filtros por usuario (presupuesto / sicoe_obra)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from main import get_current_user, supabase

router = APIRouter(prefix="/filtros-plantillas", tags=["filtros-plantillas"])

MODULOS_VALIDOS = ("presupuesto", "sicoe_obra")


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


class CrearFiltroPlantillaBody(BaseModel):
    modulo: Literal["presupuesto", "sicoe_obra"]
    nombre: str = Field(..., min_length=1, max_length=120)
    filtros: Dict[str, Any] = Field(default_factory=dict)


@router.get("/")
def listar_filtros_plantillas(
    modulo: str = Query(..., description="presupuesto | sicoe_obra"),
    current_user=Depends(get_current_user),
):
    mod = str(modulo or "").strip()
    if mod not in MODULOS_VALIDOS:
        raise HTTPException(status_code=422, detail="modulo debe ser presupuesto o sicoe_obra")
    uid = _uid(current_user)
    rows = (
        supabase.table("usuario_filtros_plantillas")
        .select("id, modulo, nombre, filtros, creada_en")
        .eq("usuario_id", uid)
        .eq("modulo", mod)
        .order("creada_en", desc=True)
        .execute()
        .data
        or []
    )
    return rows


@router.post("/")
def crear_filtro_plantilla(body: CrearFiltroPlantillaBody, current_user=Depends(get_current_user)):
    uid = _uid(current_user)
    nombre = str(body.nombre or "").strip()
    if not nombre:
        raise HTTPException(status_code=422, detail="nombre requerido")
    try:
        row = (
            supabase.table("usuario_filtros_plantillas")
            .insert(
                {
                    "usuario_id": uid,
                    "modulo": body.modulo,
                    "nombre": nombre,
                    "filtros": body.filtros or {},
                }
            )
            .execute()
            .data
        )
    except Exception as e:
        msg = str(e)
        if "usuario_filtros_plantillas" in msg and ("does not exist" in msg or "PGRST205" in msg):
            raise HTTPException(
                status_code=503,
                detail="Falta la tabla usuario_filtros_plantillas en la base de datos. Ejecute backend/sql/migration_usuario_filtros_plantillas.sql.",
            )
        raise HTTPException(status_code=500, detail=f"No se pudo crear la plantilla: {msg[:240]}")
    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear la plantilla")
    return row[0]


@router.delete("/{plantilla_id}")
def eliminar_filtro_plantilla(plantilla_id: int, current_user=Depends(get_current_user)):
    uid = _uid(current_user)
    existing = (
        supabase.table("usuario_filtros_plantillas")
        .select("id")
        .eq("id", plantilla_id)
        .eq("usuario_id", uid)
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Plantilla no encontrada")
    supabase.table("usuario_filtros_plantillas").delete().eq("id", plantilla_id).eq("usuario_id", uid).execute()
    return {"ok": True}
