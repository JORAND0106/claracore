"""Permisos independientes: Almacén / Entradas y Salidas / Catálogo (inspección + lógica pura)."""
from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_sql_y_funciones_requeridas_entsal():
    sql = (ROOT / "sql" / "funcion_entradas_salidas.sql").read_text(encoding="utf-8")
    main = (ROOT / "main.py").read_text(encoding="utf-8")
    assert "ENTSAL" in sql
    assert "Entradas y Salidas" in sql
    assert '"ENTSAL"' in main


def test_routes_separan_entsal_de_almacen():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "require_permiso_entradas_salidas(current_user, \"crear\")" in routes
    assert "require_permiso_entradas_salidas(current_user, \"editar\")" in routes
    assert "_require_almacen_o_entsal(current_user, \"ver\")" in routes
    # Crear insumo ya no exige Almacén·editar junto a CATINS
    assert 'require_permiso_almacen(current_user, "editar")\n    require_permiso_catalogo_insumos' not in routes
    assert "require_contratista_gerencial_almacen" in routes
    assert "require_acceso_ui_modulo_almacen" in routes


def test_permissions_modules_existen():
    alm = (ROOT / "almacen_permissions.py").read_text(encoding="utf-8")
    cat = (ROOT / "catalogo_insumos_permissions.py").read_text(encoding="utf-8")
    ent = (ROOT / "entradas_salidas_permissions.py").read_text(encoding="utf-8")
    assert "def tiene_acceso_ui_modulo_almacen" in alm
    assert "def tiene_alguna_accion_almacen" in alm
    assert "require_permiso_entradas_salidas" in alm  # editar cantidad salida
    assert "def tiene_alguna_accion_catalogo_insumos" in cat
    assert "ENTSAL" in ent
    assert "def tiene_alguna_accion_entradas_salidas" in ent


def test_logica_acceso_ui_or():
    """Regla documental: CATINS ∪ ENTSAL ∪ ALMACEN → entrada UI."""

    def acceso(alm, cat, ent, excluido=False):
        if excluido:
            return False
        return bool(alm or cat or ent)

    assert acceso(False, True, False) is True
    assert acceso(False, False, True) is True
    assert acceso(True, False, False) is True
    assert acceso(False, False, False) is False
    assert acceso(True, True, True, excluido=True) is False


def test_crear_solicitud_exige_ver_y_crear():
    def puede(ver, crear):
        return bool(ver and crear)

    assert puede(True, False) is False
    assert puede(False, True) is False
    assert puede(True, True) is True
