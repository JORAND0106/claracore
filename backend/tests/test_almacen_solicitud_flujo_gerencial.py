"""Permisos y flujo Gerencial — solicitud de materiales por texto libre."""
from almacen_permissions import (
    es_contratista_gerencial,
    puede_ver_valores_economicos_almacen,
    rol_excluido_almacen,
    tiene_permiso_almacen,
)


def test_es_contratista_gerencial_rol():
    assert es_contratista_gerencial({"rol_nombre": "Contratista Gerencial"}) is True
    assert es_contratista_gerencial({"rol_nombre": "Contratista"}) is False
    assert es_contratista_gerencial({"rol_nombre": "Interventoría Gerencial"}) is False
    assert es_contratista_gerencial({"rol_nombre": "Operativo Contratista"}) is False


def test_es_contratista_gerencial_variantes():
    assert es_contratista_gerencial({"rol": "contratista gerencial"}) is True
    assert es_contratista_gerencial({"rol_nombre": "Contratista  Gerencial"}) is True


def test_rol_excluido_interventoria():
    assert rol_excluido_almacen({"rol_nombre": "Interventoría"}) is True
    assert rol_excluido_almacen({"rol_nombre": "Interventoría Gerencial"}) is True


def test_valores_economicos_solo_gerencial():
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Contratista"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Contratista"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Contratista Gerencial"}) is True


def test_permiso_bloqueado_si_rol_excluido(monkeypatch):
    monkeypatch.setattr(
        "almacen_permissions._cargo_permiso_almacen",
        lambda u, a: True,
    )
    assert tiene_permiso_almacen({"rol_nombre": "Interventoría"}, "ver") is False
