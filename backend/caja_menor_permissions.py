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


def es_desarrollador_usuario(current_user) -> bool:
    cargo = _norm((current_user or {}).get("cargo_nombre") or (current_user or {}).get("cargo") or "")
    rol = _norm((current_user or {}).get("rol_nombre") or (current_user or {}).get("rol") or "")
    if cargo == "desarrollador" or rol == "desarrollador":
        return True
    try:
        from main import _es_desarrollador

        return bool(_es_desarrollador(current_user))
    except Exception:
        return False


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


def tiene_permiso_caja_menor(current_user, accion: CajaAccion, contrato_id: Optional[int] = None) -> bool:
    if es_desarrollador_usuario(current_user):
        return True
    # Gerencia (rol Administrador) abre la caja del aviso del 80 %.
    # El resto de acciones sigue en Gestión de Cargos. No incluye el rol Administrativo.
    if accion == "ver":
        from caja_menor_calc import es_rol_administrador_gerencia

        rol = (current_user or {}).get("rol_nombre") or (current_user or {}).get("rol") or ""
        if es_rol_administrador_gerencia(rol):
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
    return {a: tiene_permiso_caja_menor(current_user, a, contrato_id) for a in ACCIONES}


def require_permiso_caja_menor(current_user, accion: CajaAccion, contrato_id: Optional[int] = None) -> None:
    if tiene_permiso_caja_menor(current_user, accion, contrato_id):
        return
    try:
        from fastapi import HTTPException
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(f"No tiene permiso (Caja Menor · {accion}).") from exc
    raise HTTPException(status_code=403, detail=f"No tiene permiso (Caja Menor · {accion}).")
