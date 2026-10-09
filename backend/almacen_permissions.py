"""
Permisos módulo Almacén — fila en `funciones` (nombre «Almacén», código ALMACEN).
"""
from __future__ import annotations

import unicodedata
from typing import Literal

from fastapi import HTTPException

AlmacenAccion = Literal["ver", "crear", "editar", "eliminar", "validar", "exportar"]

_FUNC_NOMBRES = frozenset({"almacén", "almacen"})
_ACCIONES = ("ver", "crear", "editar", "eliminar", "validar", "exportar")

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


def _cargo_norm(current_user) -> str:
    return _norm(current_user.get("cargo_nombre") or current_user.get("cargo") or "")


def es_operativo_gerencial(current_user) -> bool:
    """Rol Operativo Gerencial (no interventoría / no contratista gerencial)."""
    rol = _norm_rol(current_user)
    if rol == "operativo gerencial":
        return True
    if "operativo" in rol and "gerencial" in rol and "intervent" not in rol:
        return True
    return False


def es_residente_administrativo(current_user) -> bool:
    """Cargo Residente Administrativo — excepción para ver valores económicos."""
    return _cargo_norm(current_user) == "residente administrativo"


def es_gerencia_contratista_rol(current_user) -> bool:
    """Rol de tipo gerencia contratista. No incluye el bypass de Desarrollador."""
    rol = _norm_rol(current_user)
    if "intervent" in rol:
        return False
    if rol in ("contratista gerencial", "gerencia contratista"):
        return True
    return "contrat" in rol and "gerencial" in rol


def es_rol_administrativo(current_user) -> bool:
    """Rol de plataforma Administrativo (no el cargo)."""
    return _norm_rol(current_user) == "administrativo"


def es_desarrollador_almacen(current_user) -> bool:
    """Rol o cargo Desarrollador: acceso total, también a las cifras en dinero."""
    if _norm_rol(current_user) == "desarrollador":
        return True
    return _cargo_norm(current_user) == "desarrollador"


def puede_ver_valores_economicos_almacen(current_user) -> bool:
    """
    Cifras en dinero para gerencia contratista, el rol Administrativo y Desarrollador.
    Desarrollador las ve siempre, sin depender de los permisos por función.
    Los demás roles ven solo cantidades.
    """
    if es_desarrollador_almacen(current_user):
        return True
    if es_gerencia_contratista_rol(current_user):
        return True
    if es_rol_administrativo(current_user):
        return True
    return False


def es_contratista_gerencial(current_user) -> bool:
    """Rol Contratista Gerencial (o Desarrollador). Usado para aprobar y corregir post-OC, no para eco."""
    try:
        from main import _es_desarrollador

        if _es_desarrollador(current_user):
            return True
    except Exception:
        pass
    rol = _norm_rol(current_user)
    if rol == "contratista gerencial":
        return True
    if "contrat" in rol and "gerencial" in rol and "intervent" not in rol:
        return True
    return False


def require_contratista_gerencial_almacen(current_user) -> None:
    """Validar + Contratista Gerencial.

    La aprobación de ítems, el rechazo y generar la OC ya no usan este gate:
    bastan Almacén · validar y un estado que lo permita. El rol no reemplaza
    ni anula Validar. La visibilidad de valores la definen gerencia
    contratista, el rol Administrativo y Desarrollador. Este gate sigue en correcciones
    post-OC y en la cantidad de salidas.
    """
    require_permiso_almacen(current_user, "validar")
    if not es_contratista_gerencial(current_user):
        raise HTTPException(
            status_code=403,
            detail="Solo el rol Contratista Gerencial puede realizar esta acción.",
        )


def require_editar_cantidad_salida_almacen(current_user) -> None:
    """Gate duro: solo Contratista Gerencial o Desarrollador editan cantidad de salida."""
    from entradas_salidas_permissions import require_permiso_entradas_salidas

    require_permiso_entradas_salidas(current_user, "editar")
    if not es_contratista_gerencial(current_user):
        raise HTTPException(
            status_code=403,
            detail=(
                "Solo Contratista Gerencial o Desarrollador puede editar "
                "la cantidad de una salida registrada."
            ),
        )


def _es_validador_almacen_por_cargo(current_user) -> bool:
    # Director de obra: regla operativa de validación.
    # Cargo Administrador debe tener «validar» en la matriz (sin bypass por nombre).
    cargo = _norm(current_user.get("cargo_nombre") or "")
    return cargo == "director de obra"


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


def tiene_alguna_accion_almacen(current_user) -> bool:
    """True si el cargo tiene al menos un flag en la función Almacén (general)."""
    if rol_excluido_almacen(current_user):
        return False
    for accion in _ACCIONES:
        if _cargo_permiso_almacen(current_user, accion):  # type: ignore[arg-type]
            return True
    return False


def tiene_acceso_ui_modulo_almacen(current_user) -> bool:
    """
    Llave de entrada al módulo Almacén:
    - algún permiso en Almacén (general), o
    - algún permiso en Catálogo de insumos, o
    - algún permiso en Entradas y Salidas.

    No otorga por sí solo visibilidad de Solicitudes/Inventario (eso exige
    permiso propio en Almacén).
    """
    if rol_excluido_almacen(current_user):
        return False
    if tiene_alguna_accion_almacen(current_user):
        return True
    try:
        from catalogo_insumos_permissions import tiene_alguna_accion_catalogo_insumos

        if tiene_alguna_accion_catalogo_insumos(current_user):
            return True
    except Exception:
        pass
    try:
        from entradas_salidas_permissions import tiene_alguna_accion_entradas_salidas

        if tiene_alguna_accion_entradas_salidas(current_user):
            return True
    except Exception:
        pass
    return False


def require_acceso_ui_modulo_almacen(current_user) -> None:
    if not tiene_acceso_ui_modulo_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail=(
                "No tiene acceso al módulo Almacén de Obra. "
                "Configure permisos en Almacén, Catálogo de insumos o Entradas y Salidas."
            ),
        )


def require_acceso_almacen(current_user, accion: AlmacenAccion) -> None:
    """Bloqueo duro por rol + permiso de acción en la función Almacén (general)."""
    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    require_permiso_almacen(current_user, accion)


# Roles canónicos (tabla roles): Contratista=3, Operativo Contratista=5.
# Contratista Gerencial (7) NO es receptor de obra en Salidas.
_ROLES_RECEPTOR_OBRA_IDS = frozenset({3, 5})


def es_rol_receptor_obra(rol_nombre: str, rol_id: int | None = None) -> bool:
    """Solo operativo contratista / contratista. Nunca interventoría ni gerencial."""
    if rol_id is not None:
        try:
            rid = int(rol_id)
        except (TypeError, ValueError):
            rid = None
        else:
            if rid in _ROLES_RECEPTOR_OBRA_IDS:
                return True
            # Gerencial / interventoría / supervisor por id conocido
            if rid in (2, 4, 6, 7, 8):
                return False

    rol = _norm(rol_nombre or "")
    if not rol:
        return False
    if rol in _ROLES_EXCLUIDOS_ALMACEN:
        return False
    if "intervent" in rol:
        return False
    if "gerencial" in rol:
        return False
    if "supervis" in rol and "extern" in rol:
        return False
    if rol in ("contratista", "operativo contratista"):
        return True
    # p.ej. "operativo del contratista"
    if "operativo" in rol and "contrat" in rol:
        return True
    # "contratista" sin gerencial/interventoría (ya excluido arriba)
    if rol == "contratista" or (rol.startswith("contratista") and "gerencial" not in rol):
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


def require_crear_o_editar_almacen(current_user) -> None:
    """Crear o Editar: guardar borrador / enviar solicitud a aprobación."""
    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    if _cargo_permiso_almacen(current_user, "editar") or _cargo_permiso_almacen(current_user, "crear"):
        return
    raise HTTPException(
        status_code=403,
        detail="No tiene permiso (Almacén · crear o editar). Configúrelo en Control de accesos.",
    )


def require_lectura_almacen(current_user) -> None:
    """GET de Solicitudes/Inventario: basta cualquier flag propio en Almacén."""
    if rol_excluido_almacen(current_user):
        raise HTTPException(
            status_code=403,
            detail="El módulo Almacén de Obra no está disponible para su rol.",
        )
    if tiene_alguna_accion_almacen(current_user):
        return
    raise HTTPException(
        status_code=403,
        detail="No tiene permiso (Almacén). Configúrelo en Control de accesos.",
    )
