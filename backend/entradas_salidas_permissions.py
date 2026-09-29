"""
Permisos «Entradas y Salidas» — fila en `funciones` (código ENTSAL).
Controla Entradas, Salidas, Despacho y Devoluciones. Independiente de Almacén y CATINS.
"""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import HTTPException

EntradasSalidasAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"entradas y salidas", "entradas y salida"})
_ACCIONES = ("ver", "crear", "editar", "eliminar", "validar", "exportar")


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("  ", " ")


def _cargo_permiso_entsal(current_user, accion: EntradasSalidasAccion) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase, supabase_execute, _es_desarrollador

        if _es_desarrollador(current_user):
            return True
        # Roles excluidos del módulo Almacén tampoco usan Entradas/Salidas.
        from almacen_permissions import rol_excluido_almacen

        if rol_excluido_almacen(current_user):
            return False
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
            if _norm(f.get("nombre") or "") in _FUNC_NOMBRES:
                return True
            if str(f.get("codigo") or "").strip().upper() == "ENTSAL":
                return True
    except Exception:
        return False
    return False


def tiene_permiso_entradas_salidas(current_user, accion: EntradasSalidasAccion) -> bool:
    return _cargo_permiso_entsal(current_user, accion)


def tiene_alguna_accion_entradas_salidas(current_user) -> bool:
    for accion in _ACCIONES:
        if _cargo_permiso_entsal(current_user, accion):  # type: ignore[arg-type]
            return True
    return False


def require_permiso_entradas_salidas(current_user, accion: EntradasSalidasAccion) -> None:
    from almacen_permissions import rol_excluido_almacen

    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    if not _cargo_permiso_entsal(current_user, accion):
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Entradas y Salidas · {accion}). Configúrelo en Control de accesos.",
        )


def require_lectura_entradas_salidas(current_user) -> None:
    """GET de Entradas/Salidas/Devoluciones: basta cualquier flag propio en ENTSAL."""
    from almacen_permissions import rol_excluido_almacen

    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    if tiene_alguna_accion_entradas_salidas(current_user):
        return
    raise HTTPException(
        status_code=403,
        detail="No tiene permiso (Entradas y Salidas). Configúrelo en Control de accesos.",
    )
