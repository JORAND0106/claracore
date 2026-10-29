"""Cambio de proveedor en bloque: un solo insumo; rechazo si se mezclan."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_modulo_define_acciones_y_helpers():
    src = (ROOT / "almacen_proveedor_bloque.py").read_text(encoding="utf-8")
    assert "CAMBIAR_PROVEEDOR_BLOQUE" in src
    assert "DESHACER_PROVEEDOR_BLOQUE" in src
    assert "def vista_previa_cambio_proveedor" in src
    assert "def cambiar_proveedor_bloque" in src
    assert "def ejecutar_deshacer_proveedor" in src
    assert "def _exigir_mismo_insumo" in src
    assert "Solo se puede cambiar el proveedor de un insumo a la vez" in src


def test_exigir_mismo_insumo_comportamiento():
    import sys

    sys.path.insert(0, str(ROOT))
    from almacen_proveedor_bloque import _exigir_mismo_insumo

    try:
        _exigir_mismo_insumo([{"insumo_id": 1}, {"insumo_id": 2}])
        raise AssertionError("debía rechazar dos insumos")
    except ValueError as exc:
        assert "un solo insumo" in str(exc)
    try:
        _exigir_mismo_insumo([{"insumo_id": None}, {"insumo_id": 1}])
        raise AssertionError("debía exigir insumo asignado")
    except ValueError as exc:
        assert "mismo insumo asignado" in str(exc)
    assert _exigir_mismo_insumo([{"insumo_id": 7}, {"insumo_id": 7}]) == 7


def test_routes_exponen_endpoints_bloque():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "proveedor-bloque/vista-previa" in routes
    assert "proveedor-bloque/deshacer" in routes
    assert "CambiarProveedorBloqueBody" in routes
    assert "puede_cambiar_proveedor_linea_aprobada" in routes


def test_mapear_bloque_requiere_mismo_insumo_opcional():
    svc = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    assert "requerir_mismo_insumo" in svc
    assert "edición masiva solo puede incluir filas del mismo insumo" in svc
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "requerir_mismo_insumo" in routes
