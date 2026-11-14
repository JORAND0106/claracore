"""Valores económicos: operativo contratista nunca ve dinero ni Resumen."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_operativo_contratista_sin_eco():
    from almacen_permissions import puede_ver_valores_economicos_almacen

    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Contratista"}) is False
    assert puede_ver_valores_economicos_almacen({"rol": "Contratista Operativo"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Gerencial"}) is False
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Operativo Campo"}) is False


def test_gerencial_y_admin_con_eco():
    from almacen_permissions import puede_ver_valores_economicos_almacen

    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Contratista Gerencial"}) is True
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Administrativo"}) is True
    assert puede_ver_valores_economicos_almacen({"rol_nombre": "Desarrollador"}) is True


def test_ruta_resumen_exige_eco():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    bloque = routes.split("def route_resumen_proveedores", 1)[1].split("@router.", 1)[0]
    assert "puede_ver_valores_economicos_almacen" in bloque
    assert "403" in bloque
