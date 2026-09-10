"""Permisos de Almacén: roles/cargos y valores económicos."""
from __future__ import annotations

from almacen_permissions import (
    es_contratista_gerencial,
    es_operativo_gerencial,
    es_residente_administrativo,
    puede_ver_valores_economicos_almacen,
)


def test_operativo_gerencial_ve_valores_economicos():
    u = {"rol": "Operativo Gerencial", "cargo": "Residente de Obra"}
    assert es_operativo_gerencial(u) is True
    assert puede_ver_valores_economicos_almacen(u) is True


def test_residente_administrativo_ve_valores_economicos_aunque_no_sea_operativo_gerencial():
    u = {"rol": "Operativo Campo", "cargo": "Residente Administrativo"}
    assert es_operativo_gerencial(u) is False
    assert es_residente_administrativo(u) is True
    assert puede_ver_valores_economicos_almacen(u) is True


def test_contratista_gerencial_ya_no_ve_valores_economicos_por_rol():
    """La regla económica dejó de usar Contratista Gerencial; sigue existiendo para mapear/aprobar."""
    u = {"rol": "Contratista Gerencial", "cargo": "Gerente de Proyecto"}
    assert es_contratista_gerencial(u) is True
    assert puede_ver_valores_economicos_almacen(u) is False


def test_contratista_gerencial_con_cargo_residente_admin_si_ve_economicos():
    u = {"rol": "Contratista Gerencial", "cargo": "Residente Administrativo"}
    assert puede_ver_valores_economicos_almacen(u) is True


def test_operativo_campo_sin_cargo_especial_no_ve_economicos():
    u = {"rol": "Operativo Campo", "cargo": "Ayudante"}
    assert puede_ver_valores_economicos_almacen(u) is False


def test_desarrollador_ve_valores_economicos():
    u = {"rol": "Desarrollador", "cargo": "Dev"}
    assert puede_ver_valores_economicos_almacen(u) is True


def test_match_normalizado_acentos_y_espacios():
    u = {"rol": "  operativo   gerencial ", "cargo": "residente administrativo"}
    assert es_operativo_gerencial(u) is True
    assert es_residente_administrativo(u) is True
    assert puede_ver_valores_economicos_almacen(u) is True
