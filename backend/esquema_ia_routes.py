"""Rutas HTTP — Dibujar con IA en el editor de esquema. Prefijo: /esquema/ia"""
from __future__ import annotations

import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from esquema_ia_service import (
    generar_esquema_ia,
    leer_uso,
    normalize_ambito,
    normalize_doc_key,
    registrar_uso,
)
from main import _require_contract_access, get_current_user, supabase

_log = logging.getLogger("claracore.esquema_ia.routes")
router = APIRouter(prefix="/esquema/ia", tags=["esquema-ia"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


class GenerarBody(BaseModel):
    contrato_id: Optional[int] = None
    ambito: str = Field(..., min_length=2, max_length=40)
    doc_key: str = Field(..., min_length=2, max_length=120)
    instruccion: str = Field(..., min_length=2, max_length=800)
    modo: str = "generacion"
    scene: Optional[List[Any]] = None


@router.get("/uso")
def route_uso(current_user=Depends(get_current_user)):
    return leer_uso(supabase, _uid(current_user))


@router.post("/generar")
async def route_generar(body: GenerarBody, current_user=Depends(get_current_user)):
    if body.contrato_id is not None:
        _require_contract_access(current_user, int(body.contrato_id))
    uid = _uid(current_user)
    normalize_ambito(body.ambito)
    normalize_doc_key(body.doc_key)
    cupo = leer_uso(supabase, uid)
    if cupo["blocked"]:
        raise HTTPException(
            status_code=429,
            detail="Hoy ya usó las 20 consultas de Dibujar con IA. Podrá volver a usarlo mañana.",
        )
    parsed = await generar_esquema_ia(
        instruccion=body.instruccion,
        modo=body.modo,
        scene=body.scene,
    )
    uso = registrar_uso(supabase, uid)
    return {**parsed, **uso}
