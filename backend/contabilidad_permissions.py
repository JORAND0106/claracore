"""
Permisos módulo Contabilidad — función «Contabilidad» (código CONTAB).
Acceso: cargo Desarrollador (bypass) y cargo Contador (acceso exclusivo).
"""
from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

ContabAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRE = "contabilidad"
_CARGO_CONTADOR = "contador"


def _cargo_nombre_usuario(current_user) -> str:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return ""
    try:
        from main import supabase

        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return ""
        crows = (
            supabase.table("cargos")
            .select("nombre")
            .eq("id", int(u["cargo_id"]))
            .limit(1)
            .execute()
            .data
        )
        c = crows[0] if crows else None
        return ((c or {}).get("nombre") or "").strip().lower()
    except Exception:
        return ""


def es_contador(current_user) -> bool:
    return _cargo_nombre_usuario(current_user) == _CARGO_CONTADOR


def _cargo_permiso_contabilidad(current_user, accion: ContabAccion) -> bool:
    try:
        from main import supabase, supabase_execute, _es_desarrollador

        if _es_desarrollador(current_user):
            return True
        if es_contador(current_user):
            return True
        uid = int(current_user.get("sub"))
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
            nom = (f.get("nombre") or "").strip().lower()
            cod = (f.get("codigo") or "").strip().upper()
            if nom == _FUNC_NOMBRE or cod == "CONTAB":
                return True
    except Exception:
        return False
    return False


def tiene_permiso_contabilidad(current_user, accion: ContabAccion) -> bool:
    return _cargo_permiso_contabilidad(current_user, accion)


def require_permiso_contabilidad(current_user, accion: ContabAccion) -> None:
    if not _cargo_permiso_contabilidad(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Contabilidad · {accion}).",
        )


def require_solo_desarrollador_categorias(current_user) -> None:
    """Solo Desarrollador puede crear/editar categorías del plan de cuentas."""
    from main import _es_desarrollador

    if not _es_desarrollador(current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo el cargo Desarrollador puede modificar el plan de cuentas.",
        )


def require_firma_cierre(current_user) -> None:
    """Firma digital de cierre: Contador o Desarrollador."""
    from main import _es_desarrollador

    if not (_es_desarrollador(current_user) or es_contador(current_user)):
        raise HTTPException(
            status_code=403,
            detail="Solo el cargo Contador o Desarrollador puede firmar el cierre mensual.",
        )
