"""
Permisos módulo Topografía — fila en `funciones` (nombre «Topografía», código TOPOGR).

Misma semántica de matriz que SICOE Obra (ver/crear/editar/eliminar/validar/exportar).

Resolución por función (no por lote de contrato):
  1) fila Topografía con contrato_id exacto
  2) fila Topografía legacy (contrato_id null)
Nunca reutilizar la matriz de otro contrato. No dejar que permisos scoped de
*otras* funciones oculten una fila legacy de Topografía (regresión «Not Found»/
403 al listar planillas tras el ajuste de alcance por contrato).
"""
from __future__ import annotations

import unicodedata
from typing import Literal, Optional

from fastapi import HTTPException

TopoAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"topografia"})  # tras _norm (sin tilde)
_FUNC_CODIGO = "TOPOGR"


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFD", str(txt or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip().replace("  ", " ")


def _es_funcion_topografia(row: dict) -> bool:
    nombre = _norm(row.get("nombre") or row.get("funcion_nombre") or "")
    codigo = str(row.get("codigo") or row.get("funcion_codigo") or "").strip().upper()
    return nombre in _FUNC_NOMBRES or codigo == _FUNC_CODIGO


def _ids_funcion_topografia() -> list[int]:
    """Ids de `funciones` que corresponden a Topografía / TOPOGR."""
    from main import supabase, supabase_execute

    rows = (
        supabase_execute(
            lambda: supabase.table("funciones")
            .select("id, nombre, codigo")
            .execute()
            .data
        )
        or []
    )
    out: list[int] = []
    for f in rows:
        if not _es_funcion_topografia(f):
            continue
        try:
            out.append(int(f["id"]))
        except (TypeError, ValueError, KeyError):
            continue
    return out


def _permisos_topografia_para_cargo(cargo_id: int, contrato_id: Optional[int]) -> list[dict]:
    """
    Filas de permisos solo de la función Topografía, con prioridad de contrato.

    Alineado con frontend `permisoFuncionContrato`: exacto → legacy → vacío
    (sin caer a otro contrato).
    """
    from main import supabase, supabase_execute

    fids = _ids_funcion_topografia()
    if not fids:
        return []

    cid_cargo = int(cargo_id)
    all_topo = (
        supabase_execute(
            lambda: supabase.table("permisos")
            .select("*")
            .eq("cargo_id", cid_cargo)
            .in_("funcion_id", fids)
            .execute()
            .data
        )
        or []
    )
    if not all_topo:
        return []

    if contrato_id is not None:
        try:
            cid = int(contrato_id)
        except (TypeError, ValueError):
            cid = None
        if cid is not None:
            exact = [
                p
                for p in all_topo
                if p.get("contrato_id") is not None
                and str(p.get("contrato_id")).strip() != ""
                and int(p["contrato_id"]) == cid
            ]
            if exact:
                return exact
            legacy = [
                p
                for p in all_topo
                if p.get("contrato_id") is None or p.get("contrato_id") == ""
            ]
            if legacy:
                return legacy
            return []

    # Sin contrato pedido: preferir legacy, si no cualquiera (mismo cargo).
    legacy = [
        p
        for p in all_topo
        if p.get("contrato_id") is None or p.get("contrato_id") == ""
    ]
    return legacy or all_topo


def _cargo_permiso_topografia(
    current_user,
    accion: TopoAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    """Matriz Topografía; alcance por contrato a nivel de *esta* función."""
    try:
        uid = int(current_user.get("sub"))
    except (TypeError, ValueError):
        return False
    try:
        from main import _es_desarrollador, supabase

        if _es_desarrollador(current_user):
            return True
        urows = (
            supabase.table("usuarios")
            .select("cargo_id")
            .eq("id", uid)
            .limit(1)
            .execute()
            .data
        )
        u = urows[0] if urows else None
        if not u or u.get("cargo_id") is None:
            return False
        perms = _permisos_topografia_para_cargo(
            int(u["cargo_id"]),
            int(contrato_id) if contrato_id is not None else None,
        )
        return any(bool(p.get(accion)) for p in perms)
    except Exception:
        return False


def tiene_permiso_topografia(
    current_user,
    accion: TopoAccion,
    contrato_id: Optional[int] = None,
) -> bool:
    return _cargo_permiso_topografia(current_user, accion, contrato_id)


def require_permiso_topografia(
    current_user,
    accion: TopoAccion,
    contrato_id: Optional[int] = None,
) -> None:
    if not _cargo_permiso_topografia(current_user, accion, contrato_id):
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


def lado_validacion_topo_usuario(
    current_user,
    contrato_id: Optional[int] = None,
) -> Optional[int]:
    """
    Nivel de validación topográfica: 1 = contratista, 2 = interventoría.
    Requiere permiso validar en matriz Topografía (excepto desarrollador).
    Sin lado claro → None (no inventar N1).
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
    if not _cargo_permiso_topografia(current_user, "validar", contrato_id):
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
    if "cadenero" in cargo:
        return 1
    return None


def require_topo_puede_validar_nivel(
    current_user,
    nivel: int,
    contrato_id: Optional[int] = None,
) -> None:
    """Desarrollador: niveles 1 y 2. Resto: matriz validar + lado contratista/interventoría."""
    if nivel not in (1, 2):
        raise HTTPException(status_code=500, detail="Nivel de validación topográfica inválido.")
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return
    except Exception:
        pass
    if not _cargo_permiso_topografia(current_user, "validar", contrato_id):
        raise HTTPException(
            status_code=403,
            detail="No tiene permiso (Topografía · validar). Configúrelo en Control de accesos.",
        )
    lado = lado_validacion_topo_usuario(current_user, contrato_id)
    if lado == 0:
        return
    if lado != nivel:
        lado_txt = "contratista (nivel 1)" if nivel == 1 else "interventoría (nivel 2)"
        raise HTTPException(
            status_code=403,
            detail=f"Su rol no autoriza validar como {lado_txt}.",
        )
