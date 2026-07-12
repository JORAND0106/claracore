"""
Permisos módulo Almacén — fila en `funciones` (nombre «Almacén», código ALMACEN).
"""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import HTTPException

AlmacenAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"almacén", "almacen"})


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def _es_validador_almacen_por_cargo(current_user) -> bool:
    cargo = _norm(current_user.get("cargo_nombre") or "")
    return cargo in ("director de obra", "administrador")


def _cargo_permiso_almacen(current_user, accion: AlmacenAccion) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase, supabase_execute, _es_desarrollador

        if _es_desarrollador(current_user):
            return True
        if accion == "validar" and _es_validador_almacen_por_cargo(current_user):
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


def tiene_permiso_almacen(current_user, accion: AlmacenAccion) -> bool:
    return _cargo_permiso_almacen(current_user, accion)


def require_permiso_almacen(current_user, accion: AlmacenAccion) -> None:
    if not _cargo_permiso_almacen(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Almacén · {accion}). Configúrelo en Control de accesos.",
        )
