"""Tests — ROL Administrativo en permisos RRHH (no cargo)."""
from __future__ import annotations

from rrhh_permissions import _es_rol_administrativo, puede_ver_salario_rrhh, tiene_permiso_rrhh


def test_rol_administrativo_tiene_acceso_sin_matriz():
    u = {"sub": "1", "rol_nombre": "Administrativo", "cargo_nombre": "Residente"}
    assert _es_rol_administrativo(u) is True
    assert tiene_permiso_rrhh(u, "ver", 10) is True
    assert tiene_permiso_rrhh(u, "crear", 10) is True
    assert tiene_permiso_rrhh(u, "editar", 10) is True
    assert tiene_permiso_rrhh(u, "eliminar", 10) is True
    assert tiene_permiso_rrhh(u, "validar", 10) is True
    assert tiene_permiso_rrhh(u, "exportar", 10) is True
    assert puede_ver_salario_rrhh(u) is True


def test_cargo_administrativo_ya_no_bypassea():
    u = {"sub": "2", "cargo_nombre": "Administrativo", "rol_nombre": "Contratista"}
    assert _es_rol_administrativo(u) is False
    # Sin matriz en BD → False
    assert tiene_permiso_rrhh(u, "ver", 10) is False
    assert puede_ver_salario_rrhh(u) is False


def test_residente_sin_matriz_no_tiene_acceso():
    u = {"sub": "3", "cargo_nombre": "Residente", "rol_nombre": "Contratista"}
    assert tiene_permiso_rrhh(u, "ver", 10) is False
    assert puede_ver_salario_rrhh(u) is False
