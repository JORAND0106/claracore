"""Tests — ROL Administrativo: solo salarios RRHH si la matriz del cargo habilita RRHH."""
from __future__ import annotations

from rrhh_permissions import _es_rol_administrativo, puede_ver_salario_rrhh, tiene_permiso_rrhh


def test_rol_administrativo_sin_matriz_no_accede_ni_ve_salario(monkeypatch):
    """Sin RRHH·ver en matriz: el rol no abre el módulo ni salarios."""
    u = {"sub": "1", "rol_nombre": "Administrativo", "cargo_nombre": "Residente"}
    assert _es_rol_administrativo(u) is True

    def _sin_matriz(_user, _accion, _cid=None):
        return False

    monkeypatch.setattr("rrhh_permissions._cargo_permiso_rrhh", _sin_matriz)
    assert tiene_permiso_rrhh(u, "ver", 10) is False
    assert tiene_permiso_rrhh(u, "crear", 10) is False
    assert tiene_permiso_rrhh(u, "editar", 10) is False
    assert tiene_permiso_rrhh(u, "eliminar", 10) is False
    assert tiene_permiso_rrhh(u, "validar", 10) is False
    assert tiene_permiso_rrhh(u, "exportar", 10) is False
    assert puede_ver_salario_rrhh(u, 10) is False


def test_rol_administrativo_con_rrhh_ver_solo_salario(monkeypatch):
    """Con RRHH·ver: puede ver salarios; CRUD sigue siendo solo matriz."""
    u = {"sub": "1", "rol_nombre": "Administrativo", "cargo_nombre": "Residente"}

    def _solo_ver(_user, accion, _cid=None):
        return accion == "ver"

    monkeypatch.setattr("rrhh_permissions._cargo_permiso_rrhh", _solo_ver)
    assert tiene_permiso_rrhh(u, "ver", 10) is True
    assert tiene_permiso_rrhh(u, "crear", 10) is False
    assert tiene_permiso_rrhh(u, "editar", 10) is False
    assert puede_ver_salario_rrhh(u, 10) is True


def test_cargo_administrativo_ya_no_bypassea(monkeypatch):
    u = {"sub": "2", "cargo_nombre": "Administrativo", "rol_nombre": "Contratista"}
    assert _es_rol_administrativo(u) is False

    def _sin_matriz(_user, _accion, _cid=None):
        return False

    monkeypatch.setattr("rrhh_permissions._cargo_permiso_rrhh", _sin_matriz)
    assert tiene_permiso_rrhh(u, "ver", 10) is False
    assert puede_ver_salario_rrhh(u, 10) is False


def test_residente_sin_matriz_no_tiene_acceso(monkeypatch):
    u = {"sub": "3", "cargo_nombre": "Residente", "rol_nombre": "Contratista"}

    def _sin_matriz(_user, _accion, _cid=None):
        return False

    monkeypatch.setattr("rrhh_permissions._cargo_permiso_rrhh", _sin_matriz)
    assert tiene_permiso_rrhh(u, "ver", 10) is False
    assert puede_ver_salario_rrhh(u, 10) is False


def test_cargo_administrador_con_rrhh_ver_ve_salario(monkeypatch):
    u = {"sub": "4", "cargo_nombre": "Administrador", "rol_nombre": "Contratista"}

    def _solo_ver(_user, accion, _cid=None):
        return accion == "ver"

    monkeypatch.setattr("rrhh_permissions._cargo_permiso_rrhh", _solo_ver)
    assert puede_ver_salario_rrhh(u, 10) is True
    assert tiene_permiso_rrhh(u, "crear", 10) is False
