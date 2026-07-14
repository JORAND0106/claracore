"""
Permisos módulo Almacén — fila en `funciones` (nombre «Almacén», código ALMACEN).
"""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import HTTPException

AlmacenAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"almacén", "almacen"})

_ROLES_EXCLUIDOS_ALMACEN = frozenset({
    "interventoria",
    "interventoria gerencial",
    "supervision externa",
})


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("  ", " ")


def _norm_rol(current_user) -> str:
    return _norm(current_user.get("rol_nombre") or current_user.get("rol") or "")


def rol_excluido_almacen(current_user) -> bool:
    """Interventoría, Interventoría Gerencial y Supervisión Externa — sin acceso al módulo."""
    rol = _norm_rol(current_user)
    if rol in _ROLES_EXCLUIDOS_ALMACEN:
        return True
    if "intervent" in rol and "gerencial" in rol:
        return True
    if "supervis" in rol and "extern" in rol:
        return True
    return False


def puede_ver_valores_economicos_almacen(current_user) -> bool:
    """Contratista y gerencial contratista ven costos/cobros; roles operativos no."""
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return True
    except Exception:
        pass
    rol = _norm_rol(current_user)
    if rol in ("contratista", "operativo contratista"):
        return True
    if "contrat" in rol and "gerencial" in rol and "intervent" not in rol:
        return True
    return False


def _es_validador_almacen_por_cargo(current_user) -> bool:
    cargo = _norm(current_user.get("cargo_nombre") or "")
    return cargo in ("director de obra", "administrador")


def _cargo_permiso_almacen(current_user, accion: AlmacenAccion) -> bool:
    if rol_excluido_almacen(current_user):
        return False
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
    if rol_excluido_almacen(current_user):
        return False
    return _cargo_permiso_almacen(current_user, accion)


def require_acceso_almacen(current_user, accion: AlmacenAccion) -> None:
    """Bloqueo duro por rol + permiso de acción."""
    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    require_permiso_almacen(current_user, accion)


_ROLES_RECEPTOR_OBRA_IDS = frozenset({3, 5, 7})  # Contratista, Operativo Contratista, Contratista Gerencial


def es_rol_receptor_obra(rol_nombre: str) -> bool:
    """Solo operativo/contratista/contratista gerencial; nunca interventoría."""
    rol = _norm(rol_nombre or "")
    if not rol:
        return False
    if rol in _ROLES_EXCLUIDOS_ALMACEN:
        return False
    if "intervent" in rol:
        return False
    if "supervis" in rol and "extern" in rol:
        return False
    if rol in ("contratista", "operativo contratista", "contratista gerencial"):
        return True
    if "operativo" in rol and "intervent" not in rol and "contrat" in rol:
        return True
    if "contrat" in rol and "gerencial" in rol and "intervent" not in rol:
        return True
    return False


def require_permiso_almacen(current_user, accion: AlmacenAccion) -> None:
    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    if not _cargo_permiso_almacen(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Almacén · {accion}). Configúrelo en Control de accesos.",
        )
