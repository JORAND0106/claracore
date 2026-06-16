"""
Permisos módulo Topografía — fila en `funciones` (nombre «Topografía», código TOPOGR).
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

from fastapi import HTTPException

TopoAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRE = "topografía"


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("  ", " ")


def _cargo_permiso_topografia(current_user, accion: TopoAccion) -> bool:
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
            nombre = (f.get("nombre") or "").strip().lower()
            if nombre == _FUNC_NOMBRE or nombre == "topografia":
                return True
    except Exception:
        return False
    return False


def tiene_permiso_topografia(current_user, accion: TopoAccion) -> bool:
    return _cargo_permiso_topografia(current_user, accion)


def require_permiso_topografia(current_user, accion: TopoAccion) -> None:
    if not _cargo_permiso_topografia(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Topografía · {accion}). Configúrelo en Control de accesos.",
        )


def _usuario_topo_validacion(uid: int) -> dict:
    from main import supabase

    rows = (
        supabase.table("usuarios")
        .select("id, rol_id, cargo_id, roles(nombre), cargos(nombre)")
        .eq("id", uid)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return {}
    u = rows[0]
    rol_row = u.get("roles") or {}
    cargo_row = u.get("cargos") or {}
    if isinstance(rol_row, list):
        rol_row = rol_row[0] if rol_row else {}
    if isinstance(cargo_row, list):
        cargo_row = cargo_row[0] if cargo_row else {}
    return {
        "rol": _norm(rol_row.get("nombre") or ""),
        "cargo": _norm(cargo_row.get("nombre") or ""),
    }


def lado_validacion_topo_usuario(current_user) -> Optional[int]:
    """
    Nivel de validación topográfica del usuario: 1 = contratista, 2 = interventoría.
    Requiere permiso validar en matriz Topografía (excepto desarrollador).
    """
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return None
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return 0  # acceso a ambos niveles
    except Exception:
        pass
    if not _cargo_permiso_topografia(current_user, "validar"):
        return None
    info = _usuario_topo_validacion(uid)
    rol = info.get("rol") or ""
    cargo = info.get("cargo") or ""
    if rol in ("interventoria", "operativo interventoria"):
        return 2
    if rol in ("contratista", "operativo contratista", "subcontratista"):
        return 1
    if "topograf" in cargo:
        if "intervent" in cargo:
            return 2
        return 1
    return None


def require_topo_puede_validar_nivel(current_user, nivel: int) -> None:
    """Desarrollador: niveles 1 y 2. Resto: matriz validar + lado contratista/interventoría."""
    if nivel not in (1, 2):
        raise HTTPException(status_code=500, detail="Nivel de validación topográfica inválido.")
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return
    except Exception:
        pass
    if not _cargo_permiso_topografia(current_user, "validar"):
        raise HTTPException(
            status_code=403,
            detail="No tiene permiso (Topografía · validar). Configúrelo en Control de accesos.",
        )
    lado = lado_validacion_topo_usuario(current_user)
    if lado == 0:
        return
    if lado != nivel:
        lado_txt = "contratista (nivel 1)" if nivel == 1 else "interventoría (nivel 2)"
        raise HTTPException(
            status_code=403,
            detail=f"Su rol no autoriza validar como {lado_txt}.",
        )
