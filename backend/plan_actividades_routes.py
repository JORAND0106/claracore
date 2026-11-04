"""
Rutas HTTP — Plan de actividades (submódulo de Seguimiento).
Prefijo: /seguimiento/{contrato_id}/plan-actividades

Acceso gobernado solo por la matriz de permisos (función PLANACT /
«Plan de actividades»). Sin flag de habilitación por contrato.
"""
from __future__ import annotations

import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from main import _require_contract_access, get_current_user, registrar_log, supabase
from plan_actividades_permissions import (
    require_permiso_plan_actividades,
)
from plan_actividades_service import (
    actualizar_actividad,
    cambiar_estado_actividad,
    comentar_actividad,
    crear_actividad,
    editar_comentario,
    eliminar_actividad,
    exportar_xlsx,
    get_actividad,
    list_actividades,
    list_colaboradores_plan,
    list_grupos,
)

_log = logging.getLogger("claracore.plan_actividades.routes")

router = APIRouter(prefix="/seguimiento", tags=["plan-actividades"])

_MSG_BD = (
    "No se pudo completar la operación del Plan de actividades. "
    "Verifique permisos y que la base de datos esté actualizada, o contacte a soporte."
)


def _uid(current_user) -> int:
    try:
        return int(current_user.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Token inválido") from exc


def _check_contrato(current_user, contrato_id: int) -> None:
    _require_contract_access(current_user, contrato_id)


def _http_err(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, PermissionError):
        detail = str(exc).strip() or (
            "No tiene permiso para esta acción en Plan de actividades. "
            "Solicítelo en Gestión de Cargos → Control de accesos."
        )
        return HTTPException(status_code=403, detail=detail)
    if isinstance(exc, ValueError):
        msg = str(exc).strip() or _MSG_BD
        code = 404 if "no encontrad" in msg.lower() else 400
        return HTTPException(status_code=code, detail=msg)
    # Errores de PostgREST / red: mensaje institucional, sin filtrar stack al cliente
    raw = str(exc or "")
    low = raw.lower()
    if any(x in low for x in ("pgrst", "postgrest", "could not find", "column", "relation", "schema cache")):
        _log.exception("plan actividades (bd): %s", exc)
        return HTTPException(status_code=400, detail=_MSG_BD)
    _log.exception("plan actividades: %s", exc)
    return HTTPException(status_code=400, detail=_MSG_BD)


class ActividadBody(BaseModel):
    grupo_id: Optional[int] = None
    grupo_nombre: Optional[str] = None
    grupo: Optional[str] = None
    titulo: Optional[str] = None
    actividad: Optional[str] = None
    descripcion: Optional[str] = ""
    comentario_comite: Optional[str] = ""
    solicitante_id: Optional[int] = None
    solicitante_nombre: Optional[str] = None
    asignados: Optional[List[Any]] = None
    asignaciones: Optional[List[Any]] = None
    prioridad: Optional[int] = 3
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    periodicidad: Optional[str] = "ninguna"
    periodicidad_hasta: Optional[str] = None
    acta_id: Optional[int] = None
    idea_id: Optional[int] = None
    confirmar_solape: Optional[bool] = False


class ComentarioBody(BaseModel):
    mensaje: str = Field(..., min_length=1)


class EstadoBody(BaseModel):
    estado_gestion: str = Field(..., min_length=1)


@router.get("/{contrato_id}/plan-actividades/grupos")
def route_list_grupos(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        return list_grupos(supabase, contrato_id)
    except Exception as exc:
        raise _http_err(exc) from exc


@router.get("/{contrato_id}/plan-actividades/colaboradores")
def route_colaboradores(contrato_id: int, current_user=Depends(get_current_user)):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        return list_colaboradores_plan(supabase, contrato_id)
    except Exception as exc:
        raise _http_err(exc) from exc


@router.get("/{contrato_id}/plan-actividades")
def route_list_actividades(
    contrato_id: int,
    colaborador_id: Optional[int] = Query(None),
    ver_todos: bool = Query(False),
    incluir_cerrados: bool = Query(True),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        return list_actividades(
            supabase,
            contrato_id,
            _uid(current_user),
            current_user,
            colaborador_id=colaborador_id,
            incluir_cerrados=incluir_cerrados,
            ver_todos=ver_todos,
        )
    except Exception as exc:
        raise _http_err(exc) from exc


@router.post("/{contrato_id}/plan-actividades")
def route_crear_actividad(
    contrato_id: int,
    body: ActividadBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "crear", contrato_id)
    try:
        payload = body.model_dump() if hasattr(body, "model_dump") else body.dict()
        row = crear_actividad(
            supabase,
            contrato_id,
            _uid(current_user),
            current_user,
            payload,
            confirmar_solape=bool(body.confirmar_solape),
        )
        if row.get("requiere_confirmacion_solape"):
            return row
        registrar_log(
            current_user,
            "CREAR",
            "SEGUIMIENTO",
            "plan_actividad",
            str(row.get("id")),
            {
                "titulo": row.get("titulo"),
                "grupo": row.get("grupo_nombre"),
                "prioridad": row.get("prioridad"),
                "acta_id": row.get("acta_id"),
                "idea_id": row.get("idea_id"),
            },
        )
        return row
    except Exception as exc:
        raise _http_err(exc) from exc


@router.get("/{contrato_id}/plan-actividades/export.xlsx")
def route_export(
    contrato_id: int,
    colaborador_id: Optional[int] = Query(None),
    ver_todos: bool = Query(True),
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "exportar", contrato_id)
    try:
        data = exportar_xlsx(
            supabase,
            contrato_id,
            _uid(current_user),
            current_user,
            colaborador_id=colaborador_id,
            ver_todos=ver_todos,
        )
        registrar_log(
            current_user,
            "EXPORTAR",
            "SEGUIMIENTO",
            "plan_actividades",
            str(contrato_id),
            {"colaborador_id": colaborador_id, "ver_todos": ver_todos},
        )
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="plan_actividades_{contrato_id}.xlsx"',
            },
        )
    except Exception as exc:
        raise _http_err(exc) from exc


@router.patch("/{contrato_id}/plan-actividades/comentarios/{comentario_id}")
def route_editar_comentario(
    contrato_id: int,
    comentario_id: int,
    body: ComentarioBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        row = editar_comentario(
            supabase, comentario_id, _uid(current_user), current_user, body.mensaje,
        )
        registrar_log(
            current_user,
            "EDITAR",
            "SEGUIMIENTO",
            "plan_actividad_comentario",
            str(comentario_id),
            {
                "antes": row.get("mensaje_anterior"),
                "despues": row.get("mensaje"),
            },
        )
        return row
    except Exception as exc:
        raise _http_err(exc) from exc


@router.get("/{contrato_id}/plan-actividades/{item_id}")
def route_get_actividad(
    contrato_id: int,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        row = get_actividad(supabase, item_id, _uid(current_user), current_user)
        if int(row.get("contrato_id") or 0) != int(contrato_id):
            raise HTTPException(status_code=404, detail="Actividad no encontrada en este contrato")
        return row
    except Exception as exc:
        raise _http_err(exc) from exc


@router.put("/{contrato_id}/plan-actividades/{item_id}")
def route_actualizar_actividad(
    contrato_id: int,
    item_id: int,
    body: ActividadBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "editar", contrato_id)
    try:
        payload = body.model_dump(exclude_unset=True) if hasattr(body, "model_dump") else body.dict(exclude_unset=True)
        row = actualizar_actividad(
            supabase,
            item_id,
            _uid(current_user),
            current_user,
            payload,
        )
        if row.get("requiere_confirmacion_solape"):
            return row
        if int(row.get("contrato_id") or 0) != int(contrato_id):
            raise HTTPException(status_code=404, detail="Actividad no encontrada en este contrato")
        registrar_log(
            current_user,
            "EDITAR",
            "SEGUIMIENTO",
            "plan_actividad",
            str(item_id),
            {"titulo": row.get("titulo"), "prioridad": row.get("prioridad")},
        )
        return row
    except Exception as exc:
        raise _http_err(exc) from exc


@router.delete("/{contrato_id}/plan-actividades/{item_id}")
def route_eliminar_actividad(
    contrato_id: int,
    item_id: int,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "eliminar", contrato_id)
    try:
        row = get_actividad(supabase, item_id, _uid(current_user), current_user)
        if int(row.get("contrato_id") or 0) != int(contrato_id):
            raise HTTPException(status_code=404, detail="Actividad no encontrada en este contrato")
        eliminar_actividad(supabase, item_id, _uid(current_user), current_user)
        registrar_log(
            current_user,
            "ELIMINAR",
            "SEGUIMIENTO",
            "plan_actividad",
            str(item_id),
            {"titulo": row.get("titulo")},
        )
        return {"ok": True}
    except Exception as exc:
        raise _http_err(exc) from exc


@router.post("/{contrato_id}/plan-actividades/{item_id}/comentarios")
def route_comentar(
    contrato_id: int,
    item_id: int,
    body: ComentarioBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        row = comentar_actividad(
            supabase, item_id, _uid(current_user), current_user, body.mensaje,
        )
        registrar_log(
            current_user,
            "CREAR",
            "SEGUIMIENTO",
            "plan_actividad_comentario",
            str(row.get("id")),
            {"item_id": item_id},
        )
        return row
    except Exception as exc:
        raise _http_err(exc) from exc


@router.patch("/{contrato_id}/plan-actividades/{item_id}/estado")
def route_estado(
    contrato_id: int,
    item_id: int,
    body: EstadoBody,
    current_user=Depends(get_current_user),
):
    _check_contrato(current_user, contrato_id)
    require_permiso_plan_actividades(current_user, "ver", contrato_id)
    try:
        prev = get_actividad(supabase, item_id, _uid(current_user), current_user)
        row = cambiar_estado_actividad(
            supabase,
            item_id,
            _uid(current_user),
            current_user,
            body.estado_gestion,
        )
        registrar_log(
            current_user,
            "EDITAR",
            "SEGUIMIENTO",
            "plan_actividad_estado",
            str(item_id),
            {
                "antes": {"estado_gestion": prev.get("estado_gestion")},
                "despues": {"estado_gestion": row.get("estado_gestion")},
            },
        )
        return row
    except Exception as exc:
        raise _http_err(exc) from exc
