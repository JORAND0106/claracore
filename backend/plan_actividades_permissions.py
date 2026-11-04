"""
Permisos Plan de actividades — fila en `funciones` (nombre «Plan de actividades», código PLANACT).
Matriz Control de accesos: Ver, Crear, Editar, Eliminar, Exportar.
Editar/Eliminar en API solo aplican sobre actividades creadas por el propio usuario
(regla de negocio adicional en plan_actividades_service).
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

PlanAccion = Literal["ver", "crear", "editar", "eliminar", "exportar"]

_FUNC_NOMBRES = frozenset({"plan de actividades", "planactividades", "plan actividades"})


def _http_exc(status_code: int, detail: str):
    try:
        from fastapi import HTTPException

        return HTTPException(status_code=status_code, detail=detail)
    except ImportError:
        return RuntimeError(f"{status_code}: {detail}")


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("  ", " ")


def _es_desarrollador_seguro(current_user) -> bool:
    try:
        from main import _es_desarrollador

        return bool(_es_desarrollador(current_user))
    except Exception:
        pass
    cargo = _norm(current_user.get("cargo_nombre") or current_user.get("cargo") or "")
    rol = _norm(current_user.get("rol_nombre") or current_user.get("rol") or "")
    return cargo == "desarrollador" or rol == "desarrollador"


def _es_funcion_plan(row: dict) -> bool:
    nombre = _norm(row.get("nombre") or row.get("funcion_nombre") or "")
    codigo = str(row.get("codigo") or row.get("funcion_codigo") or "").strip().upper()
    return nombre in _FUNC_NOMBRES or codigo in ("PLANACT", "PLAN_ACTIVIDADES")


def _permisos_matriz_cargo(cargo_id: int, contrato_id: Optional[int]):
    try:
        from main import supabase, supabase_execute
    except Exception:
        return []

    cid_cargo = int(cargo_id)
    if contrato_id is not None:
        try:
            cid = int(contrato_id)
        except (TypeError, ValueError):
            cid = None
        if cid is not None:
            scoped = supabase_execute(
                lambda: supabase.table("permisos")
                .select("*")
                .eq("cargo_id", cid_cargo)
                .eq("contrato_id", cid)
                .execute()
                .data
            ) or []
            if scoped:
                return scoped

    legacy = supabase_execute(
        lambda: supabase.table("permisos")
        .select("*")
        .eq("cargo_id", cid_cargo)
        .is_("contrato_id", "null")
        .execute()
        .data
    ) or []
    return legacy


def _cargo_permiso_plan(
    current_user,
    accion: PlanAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase

        if _es_desarrollador_seguro(current_user):
            return True
        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        cargo_id = int(u["cargo_id"])
        perms = _permisos_matriz_cargo(cargo_id, contrato_id)
        flagged = [p for p in perms if p.get(accion)]
        if not flagged:
            return False
        for p in flagged:
            if _es_funcion_plan(p):
                return True
        # Resolver función_id → funciones
        fids = list({int(p["funcion_id"]) for p in flagged if p.get("funcion_id") is not None})
        if not fids:
            return False
        funcs = (
            supabase.table("funciones")
            .select("id, codigo, nombre")
            .in_("id", fids)
            .execute()
            .data
            or []
        )
        by_id = {int(f["id"]): f for f in funcs}
        for p in flagged:
            fid = p.get("funcion_id")
            if fid is not None and _es_funcion_plan(by_id.get(int(fid), {})):
                return True
        return False
    except Exception:
        return False


def tiene_permiso_plan_actividades(
    current_user,
    accion: PlanAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    if not current_user:
        return False
    if _es_desarrollador_seguro(current_user):
        return True
    return _cargo_permiso_plan(current_user, accion, contrato_id)


def require_permiso_plan_actividades(
    current_user,
    accion: PlanAccion,
    contrato_id: Optional[int] = None,
):
    if tiene_permiso_plan_actividades(current_user, accion, contrato_id):
        return True
    raise _http_exc(
        403,
        "No tiene permiso para esta acción en Plan de actividades.",
    )
