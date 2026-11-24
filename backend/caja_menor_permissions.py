"""
Permisos Caja Menor — función «Caja Menor» (código CAJMEN).
Ver, Crear, Editar, Eliminar, Validar, Exportar.
El cargo o rol Desarrollador entra sin matriz y sin reglas de visibilidad.
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

CajaAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]
ACCIONES = ("ver", "crear", "editar", "eliminar", "validar", "exportar")

_FUNC_NOMBRES = frozenset({"caja menor", "cajamenor"})
_FUNC_CODIGOS = frozenset({"CAJMEN", "CAJA_MENOR"})


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().split())


def _jwt_es_desarrollador(current_user) -> bool:
    user = current_user or {}
    cargo = _norm(user.get("cargo_nombre") or user.get("cargo") or "")
    rol = _norm(user.get("rol_nombre") or user.get("rol") or "")
    if cargo == "desarrollador" or rol == "desarrollador":
        return True
    if user.get("es_desarrollador") is True or user.get("acceso_total") is True:
        return True
    try:
        return int(user.get("rol_id") or 0) == 1
    except (TypeError, ValueError):
        return False


def _rol_desarrollador_en_bd(current_user) -> bool:
    """El token a veces no trae el rol. El id 1 y el nombre Desarrollador sí entran."""
    try:
        uid = int((current_user or {}).get("sub") or (current_user or {}).get("id"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase

        rows = supabase.table("usuarios").select("rol_id").eq("id", uid).limit(1).execute().data or []
        if not rows or rows[0].get("rol_id") is None:
            return False
        rol_id = int(rows[0]["rol_id"])
        if rol_id == 1:
            return True
        roles = supabase.table("roles").select("nombre").eq("id", rol_id).limit(1).execute().data or []
        return bool(roles) and _norm(roles[0].get("nombre")) == "desarrollador"
    except Exception:
        return False


def es_desarrollador_usuario(current_user) -> bool:
    if _jwt_es_desarrollador(current_user):
        return True
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return True
    except Exception:
        pass
    return _rol_desarrollador_en_bd(current_user)


def _es_funcion(row: dict) -> bool:
    nombre = _norm(row.get("nombre") or row.get("funcion_nombre") or "")
    codigo = str(row.get("codigo") or row.get("funcion_codigo") or "").strip().upper()
    return nombre in _FUNC_NOMBRES or codigo in _FUNC_CODIGOS


def _permisos_matriz(cargo_id: int, contrato_id: Optional[int]):
    from main import supabase, supabase_execute

    cid_cargo = int(cargo_id)
    if contrato_id is not None:
        scoped = supabase_execute(
            lambda: supabase.table("permisos")
            .select("*")
            .eq("cargo_id", cid_cargo)
            .eq("contrato_id", int(contrato_id))
            .execute()
            .data
        ) or []
        if scoped:
            return scoped
    return supabase_execute(
        lambda: supabase.table("permisos")
        .select("*")
        .eq("cargo_id", cid_cargo)
        .is_("contrato_id", "null")
        .execute()
        .data
    ) or []


# El cargo Administrador ve, valida y exporta cualquier caja del contrato.
# Crear, editar y eliminar siguen en la matriz de Gestión de Cargos.
_ACCIONES_CARGO_ADMINISTRADOR = ("ver", "validar", "exportar")


def _cargo_administrador(current_user, nombre_bd: str = "") -> bool:
    from caja_menor_calc import es_cargo_administrador

    user = current_user or {}
    cargo = user.get("cargo_nombre") or user.get("cargo") or ""
    return es_cargo_administrador(cargo) or es_cargo_administrador(nombre_bd)


def tiene_permiso_caja_menor(current_user, accion: CajaAccion, contrato_id: Optional[int] = None) -> bool:
    if es_desarrollador_usuario(current_user):
        return True
    # Gerencia es el cargo Administrador, aunque su rol sea Contratista Gerencial.
    # No incluye el rol Administrativo ni un rol llamado Administrador.
    if accion in _ACCIONES_CARGO_ADMINISTRADOR and _cargo_administrador(current_user):
        return True
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError, AttributeError):
        return False
    try:
        from main import supabase

        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        if accion in _ACCIONES_CARGO_ADMINISTRADOR:
            crows = (
                supabase.table("cargos")
                .select("nombre")
                .eq("id", int(u["cargo_id"]))
                .limit(1)
                .execute()
                .data
            )
            nombre = (crows[0].get("nombre") if crows else "") or ""
            if _cargo_administrador(None, nombre):
                return True
        perms = _permisos_matriz(int(u["cargo_id"]), contrato_id)
        flagged = [p for p in perms if p.get(accion)]
        if not flagged:
            return False
        for p in flagged:
            if _es_funcion(p):
                return True
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
        return any(_es_funcion(f) for f in funcs)
    except Exception:
        return False


def acceso_caja_menor(current_user, contrato_id: Optional[int] = None) -> dict:
    flags = {a: tiene_permiso_caja_menor(current_user, a, contrato_id) for a in ACCIONES}
    flags["puedeEntrar"] = bool(flags["ver"])
    return flags


def require_permiso_caja_menor(current_user, accion: CajaAccion, contrato_id: Optional[int] = None) -> None:
    if tiene_permiso_caja_menor(current_user, accion, contrato_id):
        return
    try:
        from fastapi import HTTPException
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(f"No tiene permiso (Caja Menor · {accion}).") from exc
    raise HTTPException(status_code=403, detail=f"No tiene permiso (Caja Menor · {accion}).")
