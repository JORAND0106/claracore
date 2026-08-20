"""
Permisos Bitácora de Obra — fila en `funciones` (nombre «Bitácora», código BITACORA).
Matriz Control de accesos: Ver, Crear, Editar, Eliminar, Validar, Exportar.
"""
from __future__ import annotations

import unicodedata
from typing import Literal

BitacoraAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"bitacora", "bitácora"})


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


def _cargo_permiso_bitacora(current_user, accion: BitacoraAccion) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase, supabase_execute

        if _es_desarrollador_seguro(current_user):
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
            .select("id, nombre, codigo")
            .in_("id", fids)
            .execute()
            .data
        ) or []
        for f in funcs:
            nombre = _norm(f.get("nombre") or "")
            codigo = str(f.get("codigo") or "").strip().upper()
            if nombre in _FUNC_NOMBRES or codigo == "BITACORA":
                return True
    except Exception:
        return False
    return False


def tiene_permiso_bitacora(current_user, accion: BitacoraAccion) -> bool:
    if _es_desarrollador_seguro(current_user):
        return True
    return _cargo_permiso_bitacora(current_user, accion)


def require_permiso_bitacora(current_user, accion: BitacoraAccion) -> None:
    if not tiene_permiso_bitacora(current_user, accion):
        raise _http_exc(
            403,
            f"No tiene permiso (Bitácora · {accion}). Configúrelo en Control de accesos.",
        )
