"""
Permisos módulo Seguimiento — fila en `funciones` (nombre «Seguimiento», código SEGUIMIENTO).
"""
from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

SegAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRE = "seguimiento"


def _cargo_permiso_seguimiento(current_user, accion: SegAccion) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import _es_desarrollador, supabase, supabase_execute

        if _es_desarrollador(current_user):
            return True
        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        cid = int(u["cargo_id"])
        perms = supabase_execute(
            lambda: supabase.table("permisos")
            .select("funcion_id, " + accion)
            .eq("cargo_id", cid)
            .execute()
            .data
        ) or []
        fids = [p["funcion_id"] for p in perms if p.get(accion)]
        if not fids:
            return False
        funcs = supabase_execute(
            lambda: supabase.table("funciones")
            .select("id, nombre")
            .in_("id", fids)
            .execute()
            .data
        ) or []
        want = _FUNC_NOMBRE
        for f in funcs:
            if (f.get("nombre") or "").strip().lower() == want:
                return True
    except Exception:
        return False
    return False


def tiene_permiso_seguimiento(current_user, accion: SegAccion) -> bool:
    return _cargo_permiso_seguimiento(current_user, accion)


def require_permiso_seguimiento(current_user, accion: SegAccion) -> None:
    if not _cargo_permiso_seguimiento(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Seguimiento · {accion}). Configúrelo en Control de accesos.",
        )
