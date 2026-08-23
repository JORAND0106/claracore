"""
Permisos Bitácora de Obra — fila en `funciones` (nombre «Bitácora», código BITACORA).
Matriz Control de accesos: Ver, Crear, Editar, Eliminar, Validar, Exportar.

Importante: la matriz es por (cargo, contrato). Al evaluar un endpoint de
`/seguimiento/{contrato_id}/bitacora/...` debe pasarse ese contrato_id para
no reutilizar permisos de otro contrato del mismo cargo.
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

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


def _es_funcion_bitacora(row: dict) -> bool:
    nombre = _norm(row.get("nombre") or row.get("funcion_nombre") or "")
    codigo = str(row.get("codigo") or row.get("funcion_codigo") or "").strip().upper()
    return nombre in _FUNC_NOMBRES or codigo == "BITACORA"


def _permisos_matriz_cargo(cargo_id: int, contrato_id: Optional[int]):
    """
    Filas de `permisos` aplicables al cargo en el contrato solicitado.

    Prioridad (igual que `_permisos_rows_para_cargo` cuando hay contrato):
      1) filas con contrato_id exacto
      2) filas legacy (contrato_id null)
    No se mezclan permisos de otros contratos.
    """
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


def _cargo_permiso_bitacora(
    current_user,
    accion: BitacoraAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import supabase

        if _es_desarrollador_seguro(current_user):
            return True
        urows = supabase.table("usuarios").select("cargo_id").eq("id", uid).limit(1).execute().data
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        cargo_id = int(u["cargo_id"])
        perms = _permisos_matriz_cargo(cargo_id, contrato_id)
        # Filas con flag de acción activo
        flagged = [p for p in perms if p.get(accion)]
        if not flagged:
            return False
        # Si la fila ya trae nombre/código de función embebido, úsalo
        for p in flagged:
            if _es_funcion_bitacora(p):
                return True
        fids = [p["funcion_id"] for p in flagged if p.get("funcion_id") is not None]
        if not fids:
            return False
        from main import supabase_execute

        funcs = supabase_execute(
            lambda: supabase.table("funciones")
            .select("id, nombre, codigo")
            .in_("id", fids)
            .execute()
            .data
        ) or []
        for f in funcs:
            if _es_funcion_bitacora(f):
                return True
    except Exception:
        return False
    return False


def tiene_permiso_bitacora(
    current_user,
    accion: BitacoraAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    if _es_desarrollador_seguro(current_user):
        return True
    return _cargo_permiso_bitacora(current_user, accion, contrato_id)


def require_permiso_bitacora(
    current_user,
    accion: BitacoraAccion,
    contrato_id: Optional[int] = None,
) -> None:
    if not tiene_permiso_bitacora(current_user, accion, contrato_id):
        raise _http_exc(
            403,
            f"No tiene permiso (Bitácora · {accion}). Configúrelo en Control de accesos.",
        )
