"""
Permisos módulo Seguimiento.

El módulo está abierto a cualquier usuario autenticado (ver/crear/editar/validar/exportar).
La acción «eliminar» (borrado definitivo de actas e ítems) es exclusiva del rol Desarrollador.
No depende de la matriz Control de accesos (a diferencia de Almacén de Obra, etc.).
"""
from __future__ import annotations

from typing import Literal

from fastapi import HTTPException

SegAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]


def _es_desarrollador_seguro(current_user) -> bool:
    try:
        from main import _es_desarrollador

        return bool(_es_desarrollador(current_user))
    except Exception:
        pass
    try:
        import seguimiento_service as svc

        return bool(svc.es_desarrollador_seguimiento(current_user))
    except Exception:
        return False


def _usuario_autenticado(current_user) -> bool:
    if not current_user:
        return False
    sub = current_user.get("sub")
    return sub is not None and str(sub).strip() != ""


def tiene_permiso_seguimiento(current_user, accion: SegAccion) -> bool:
    if not _usuario_autenticado(current_user):
        return False
    if _es_desarrollador_seguro(current_user):
        return True
    if accion == "eliminar":
        return False
    return True


def require_permiso_seguimiento(current_user, accion: SegAccion) -> None:
    if not tiene_permiso_seguimiento(current_user, accion):
        if accion == "eliminar":
            raise HTTPException(
                status_code=403,
                detail="Solo el rol Desarrollador puede eliminar definitivamente actas o tareas.",
            )
        raise HTTPException(
            status_code=403,
            detail=f"No tiene permiso (Seguimiento · {accion}).",
        )


# Compat tests / callers que aún parchean el helper privado de matriz por cargo
def _cargo_permiso_seguimiento(current_user, accion: SegAccion) -> bool:
    return tiene_permiso_seguimiento(current_user, accion)
