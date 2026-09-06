"""Permisos Almacén — bloqueo por rol y visibilidad económica."""
from almacen_permissions import (
    puede_ver_valores_economicos_almacen,
    rol_excluido_almacen,
    tiene_permiso_almacen,
)


def test_rol_excluido_interventoria():
    assert rol_excluido_almacen({"rol_nombre": "Interventoría"}) is True
    assert rol_excluido_almacen({"rol_nombre": "Interventoría Gerencial"}) is True
    assert rol_excluido_almacen({"rol_nombre": "Supervisión Externa"}) is True


def test_rol_contratista_no_excluido():
    assert rol_excluido_almacen({"rol_nombre": "Contratista"}) is False
    assert rol_excluido_almacen({"rol_nombre": "Operativo Contratista"}) is False


def test_valores_economicos_solo_gerencial():
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Contratista"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Contratista"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Contratista Gerencial"}) is True


def test_valores_economicos_operativo_interventoria():
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Interventoría"}) is False


def test_permiso_bloqueado_si_rol_excluido(monkeypatch):
    monkeypatch.setattr(
        "almacen_permissions._cargo_permiso_almacen",
        lambda u, a: True,
    )
    assert tiene_permiso_almacen({"rol_nombre": "Interventoría"}, "ver") is False
