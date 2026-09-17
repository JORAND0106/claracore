"""Tests — bypass cargo Administrativo en permisos RRHH."""
from __future__ import annotations

from rrhh_permissions import tiene_permiso_rrhh


def test_administrativo_tiene_acceso_sin_matriz():
    u = {"sub": "1", "cargo_nombre": "Administrativo", "cargo": "Administrativo"}
    assert tiene_permiso_rrhh(u, "ver", 10) is True
    assert tiene_permiso_rrhh(u, "crear", 10) is True
    assert tiene_permiso_rrhh(u, "validar", 10) is True


def test_residente_sin_matriz_no_tiene_acceso():
    u = {"sub": "2", "cargo_nombre": "Residente", "cargo": "Residente"}
    # Sin filas de permisos en BD el helper de matriz falla → False
    assert tiene_permiso_rrhh(u, "ver", 10) is False
