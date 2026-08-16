"""
Rutas HTTP — almacenamiento Azure por contrato (solo Desarrollador).

Prefijo: /admin/storage/...
También: GET /contratos/{id}/storage (usuarios con acceso al contrato).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from main import get_current_user, require_solo_desarrollador
from storage_quota_service import (
    GIB,
    assign_contrato_plan,
    delete_tarifa,
    get_config,
    get_contrato_usage,
    list_contratos_usage,
    list_tarifas,
    reconcile_storage_from_azure,
    schema_available,
    update_config,
    upsert_tarifa,
)

_log = logging.getLogger("claracore.storage_quota.routes")

router = APIRouter(tags=["storage-quota"])


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


class ConfigBody(BaseModel):
    umbral_gratuito_bytes: int = Field(..., ge=0)
    # Alternativa cómoda para el panel (GB)
    umbral_gratuito_gb: Optional[float] = Field(None, ge=0)


class TarifaBody(BaseModel):
    id: Optional[int] = None
    nombre: str = Field(..., min_length=1, max_length=120)
    capacidad_bytes: Optional[int] = Field(None, gt=0)
    capacidad_gb: Optional[float] = Field(None, gt=0)
    precio_cop_mes: float = Field(0, ge=0)
    orden: int = Field(100, ge=0)
    activo: bool = True
    notas: Optional[str] = Field(None, max_length=500)


class ContratoPlanBody(BaseModel):
    tarifa_id: Optional[int] = Field(
        None, description="ID de tarifa; 0 o null desasigna el plan"
    )
    limite_override_bytes: Optional[int] = Field(None, ge=0)
    limite_override_gb: Optional[float] = Field(None, ge=0)
    clear_override: bool = False


def _bytes_from_gb(gb: Optional[float], fallback_bytes: Optional[int]) -> Optional[int]:
    if gb is not None:
        return int(float(gb) * GIB)
    return fallback_bytes


@router.get("/admin/storage/config")
def admin_storage_config(current_user=Depends(require_solo_desarrollador)):
    return get_config()


@router.put("/admin/storage/config")
def admin_storage_config_update(
    body: ConfigBody,
    current_user=Depends(require_solo_desarrollador),
):
    umbral = _bytes_from_gb(body.umbral_gratuito_gb, body.umbral_gratuito_bytes)
    if umbral is None:
        raise HTTPException(status_code=400, detail="umbral_gratuito_bytes requerido")
    try:
        return update_config(umbral_gratuito_bytes=int(umbral), updated_by=_uid(current_user))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/admin/storage/tarifas")
def admin_storage_tarifas(
    solo_activas: bool = False,
    current_user=Depends(require_solo_desarrollador),
):
    return list_tarifas(solo_activas=solo_activas)


@router.post("/admin/storage/tarifas")
def admin_storage_tarifas_upsert(
    body: TarifaBody,
    current_user=Depends(require_solo_desarrollador),
):
    cap = _bytes_from_gb(body.capacidad_gb, body.capacidad_bytes)
    if cap is None:
        raise HTTPException(status_code=400, detail="capacidad_bytes o capacidad_gb requerido")
    try:
        return upsert_tarifa(
            {
                "id": body.id,
                "nombre": body.nombre,
                "capacidad_bytes": int(cap),
                "precio_cop_mes": body.precio_cop_mes,
                "orden": body.orden,
                "activo": body.activo,
                "notas": body.notas,
            }
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/admin/storage/tarifas/{tarifa_id}")
def admin_storage_tarifas_delete(
    tarifa_id: int,
    current_user=Depends(require_solo_desarrollador),
):
    try:
        delete_tarifa(int(tarifa_id))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/admin/storage/contratos")
def admin_storage_contratos(current_user=Depends(require_solo_desarrollador)):
    return {
        "schema_ready": schema_available(),
        "config": get_config(),
        "tarifas": list_tarifas(),
        "contratos": list_contratos_usage(),
    }


@router.put("/admin/storage/contratos/{contrato_id}")
def admin_storage_contrato_plan(
    contrato_id: int,
    body: ContratoPlanBody,
    current_user=Depends(require_solo_desarrollador),
):
    override = _bytes_from_gb(body.limite_override_gb, body.limite_override_bytes)
    try:
        return assign_contrato_plan(
            int(contrato_id),
            tarifa_id=body.tarifa_id,
            limite_override_bytes=override,
            clear_override=body.clear_override,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class ReconciliarBody(BaseModel):
    """Opcional: limitar a un contrato. Sin body o contrato_id null = todos."""

    contrato_id: Optional[int] = Field(None, gt=0)
    zero_missing: bool = Field(
        True,
        description="En reconciliación global, poner en 0 contratos sin blobs en Azure",
    )


@router.post("/admin/storage/reconciliar")
def admin_storage_reconciliar(
    body: Optional[ReconciliarBody] = None,
    current_user=Depends(require_solo_desarrollador),
):
    """
    Recalcula consumo histórico desde Azure Blob Storage y actualiza Postgres.
    Repetible bajo demanda (idempotente respecto al estado actual de blobs).
    """
    payload = body or ReconciliarBody()
    try:
        return reconcile_storage_from_azure(
            contrato_id=payload.contrato_id,
            zero_missing=bool(payload.zero_missing),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        _log.exception("reconciliar storage falló")
        raise HTTPException(
            status_code=500, detail=f"Error al reconciliar almacenamiento: {exc}"
        ) from exc


@router.get("/contratos/{contrato_id}/storage")
def contrato_storage_resumen(
    contrato_id: int,
    current_user=Depends(get_current_user),
):
    """Visibilidad de uso para usuarios con acceso al contrato (y admin)."""
    from main import _require_contract_access

    _require_contract_access(current_user, int(contrato_id))
    return get_contrato_usage(int(contrato_id))