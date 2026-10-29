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
    assert "_solicitud_item_ids_en_ocs" in src


def test_vista_previa_no_selecciona_columna_en_orden_compra():
    src = (ROOT / "almacen_proveedor_bloque.py").read_text(encoding="utf-8")
    # El select de vista previa no debe pedir la columna inexistente.
    assert "cotizacion_numero_seleccionada, numero_linea, en_orden_compra" not in src
    assert "en_orden_compra NO es columna" in src
    assert "_solicitud_item_ids_en_ocs" in src
    assert "def _raise_db_clara" in src
    assert "def _ayuda_deshacer" in src


def test_exigir_mismo_insumo_comportamiento():
    import sys

    sys.path.insert(0, str(ROOT))
    from almacen_proveedor_bloque import _exigir_mismo_insumo, _ayuda_deshacer

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
    ayuda = _ayuda_deshacer(
        puede=True,
        resumen="ok",
        proveedor_nuevo="Triturados TG",
        proveedor_volver="Otro",
        lineas=13,
    )
    assert "Triturados TG" in ayuda
    assert "13" in ayuda
    assert "Otro" in ayuda
    assert "nada que deshacer" in _ayuda_deshacer(puede=False, resumen="No hay nada que deshacer.")


def test_routes_exponen_endpoints_bloque():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "proveedor-bloque/vista-previa" in routes
    assert "proveedor-bloque/deshacer" in routes
    assert "CambiarProveedorBloqueBody" in routes
    assert "puede_cambiar_proveedor_linea_aprobada" in routes
    assert "revocar-aprobacion" in routes
    assert "REVOCAR_APROBACION" in routes
    assert "RevocarAprobacionBody" in routes


def test_revocar_aprobacion_en_service():
    svc = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    assert "def revocar_aprobacion_lineas" in svc
    assert "Confirme antes de revocar la aprobación" in svc
    assert "ya están en una orden de compra" in svc


def test_mapear_bloque_requiere_mismo_insumo_opcional():
    svc = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    assert "requerir_mismo_insumo" in svc
    assert "edición masiva solo puede incluir filas del mismo insumo" in svc
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "requerir_mismo_insumo" in routes
