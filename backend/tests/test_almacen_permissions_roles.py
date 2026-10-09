"""Permisos de Almacén: la visibilidad económica depende solo del rol."""
from __future__ import annotations

from almacen_permissions import (
    es_contratista_gerencial,
    es_gerencia_contratista_rol,
    es_operativo_gerencial,
    es_residente_administrativo,
    es_rol_administrativo,
    puede_ver_valores_economicos_almacen,
)


def test_gerencia_contratista_ve_valores_economicos():
    u = {"rol": "Contratista Gerencial", "cargo": "Gerente de Proyecto"}
    assert es_gerencia_contratista_rol(u) is True
    assert es_contratista_gerencial(u) is True
    assert puede_ver_valores_economicos_almacen(u) is True


def test_gerencia_contratista_con_acentos_y_orden_invertido():
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Gerencia Contratista"}) is True
    assert puede_ver_valores_economicos_almacen({"rol": "  contratista   gerencial "}) is True


def test_rol_administrativo_ve_valores_aunque_el_cargo_no_sea_gerencial():
    u = {"rol": "Administrativo", "cargo": "Residente"}
    assert es_rol_administrativo(u) is True
    assert puede_ver_valores_economicos_almacen(u) is True


def test_cargo_residente_administrativo_no_ve_valores():
    u = {"rol": "Operativo Campo", "cargo": "Residente Administrativo"}
    assert es_residente_administrativo(u) is True
    assert puede_ver_valores_economicos_almacen(u) is False


def test_operativo_gerencial_no_ve_valores():
    u = {"rol": "Operativo Gerencial", "cargo": "Residente de Obra"}
    assert es_operativo_gerencial(u) is True
    assert puede_ver_valores_economicos_almacen(u) is False


def test_desarrollador_ve_todos_los_valores():
    por_rol = {"rol": "Desarrollador", "cargo": "Dev"}
    por_cargo = {"rol": "Operativo Campo", "cargo_nombre": "Desarrollador"}
    assert puede_ver_valores_economicos_almacen(por_rol) is True
    assert puede_ver_valores_economicos_almacen(por_cargo) is True


def test_interventoria_gerencial_no_cuenta_como_gerencia_contratista():
    u = {"rol": "Interventoría Gerencial"}
    assert es_gerencia_contratista_rol(u) is False
    assert puede_ver_valores_economicos_almacen(u) is False


def test_cargo_administrador_no_abre_valores():
    u = {"rol": "Operativo Campo", "cargo": "Administrador"}
    assert puede_ver_valores_economicos_almacen(u) is False
