"""
Permisos módulo RRHH — fila en `funciones` (nombre «RRHH», código RRHH).
Matriz Control de accesos: Ver, Crear, Editar, Eliminar, Validar, Exportar.
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

RrhhAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"rrhh", "recursos humanos", "recursos_humanos"})


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


def _es_funcion_rrhh(row: dict) -> bool:
    nombre = _norm(row.get("nombre") or row.get("funcion_nombre") or "")
    codigo = str(row.get("codigo") or row.get("funcion_codigo") or "").strip().upper()
    return nombre in _FUNC_NOMBRES or codigo == "RRHH"


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
    return (
        supabase_execute(
            lambda: supabase.table("permisos")
            .select("*")
            .eq("cargo_id", cid_cargo)
            .execute()
            .data
        )
        or []
    )


def _cargo_permiso_rrhh(current_user, accion: RrhhAccion, contrato_id: Optional[int]) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase

        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        cargo_id = int(u["cargo_id"])
        perms = _permisos_matriz_cargo(cargo_id, contrato_id)
        fids = [p["funcion_id"] for p in perms if p.get(accion)]
        if not fids:
            return False
        funcs = (
            supabase.table("funciones")
            .select("id, nombre, codigo")
            .in_("id", fids)
            .execute()
            .data
            or []
        )
        return any(_es_funcion_rrhh(f) for f in funcs)
    except Exception:
        return False


def tiene_permiso_rrhh(
    current_user,
    accion: RrhhAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    if _es_desarrollador_seguro(current_user):
        return True
    return _cargo_permiso_rrhh(current_user, accion, contrato_id)


def require_permiso_rrhh(
    current_user,
    accion: RrhhAccion,
    contrato_id: Optional[int] = None,
) -> None:
    if not tiene_permiso_rrhh(current_user, accion, contrato_id):
        raise _http_exc(
            403,
            f"No tiene permiso (Recursos Humanos · {accion}). Configúrelo en Control de accesos.",
        )


def es_admin_plataforma(current_user) -> bool:
    """Administrador de plataforma o Desarrollador — catálogo de tipos de contrato."""
    if _es_desarrollador_seguro(current_user):
        return True
    cargo = _norm(current_user.get("cargo_nombre") or current_user.get("cargo") or "")
    rol = _norm(current_user.get("rol_nombre") or current_user.get("rol") or "")
    return cargo == "administrador" or rol == "administrador"


def require_admin_catalogo_rrhh(current_user, contrato_id: Optional[int] = None) -> None:
    if es_admin_plataforma(current_user):
        return
    require_permiso_rrhh(current_user, "editar", contrato_id)
    if not es_admin_plataforma(current_user) and not _es_desarrollador_seguro(current_user):
        # Permitir editar catálogo con permiso editar + cargo administrador vía JWT ya cubierto;
        # si solo tiene editar RRHH sin ser admin, también puede mantener el catálogo del contrato.
        return
