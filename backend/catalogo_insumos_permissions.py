"""
Permisos módulo Catálogo de insumos — fila en `funciones` (nombre «Catálogo de insumos», código CATINS).
Independiente del módulo Almacén.
"""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import HTTPException

CatalogoInsumosAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"catalogo de insumos", "catálogo de insumos"})


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def _cargo_permiso_catalogo(current_user, accion: CatalogoInsumosAccion) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase, supabase_execute, _es_desarrollador

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
        for f in funcs:
            if _norm(f.get("nombre") or "") in _FUNC_NOMBRES:
                return True
    except Exception:
        return False
    return False


def tiene_permiso_catalogo_insumos(current_user, accion: CatalogoInsumosAccion) -> bool:
    return _cargo_permiso_catalogo(current_user, accion)


def require_permiso_catalogo_insumos(current_user, accion: CatalogoInsumosAccion) -> None:
    if not _cargo_permiso_catalogo(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Catálogo de insumos · {accion}). Configúrelo en Control de accesos.",
        )
