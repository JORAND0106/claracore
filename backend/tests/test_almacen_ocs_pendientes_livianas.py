"""Consulta liviana de OC pendientes y autocompletar solo lo solicitado."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_list_ocs_pendientes_no_loop_get_orden_compra():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    # Extraer solo el cuerpo de la función liviana.
    start = src.index("def list_ocs_pendientes_tarjeta")
    end = src.index("\ndef list_materiales_solicitados_contrato", start)
    body = src[start:end]
    assert "get_orden_compra(" not in body
    assert "include_timing" in body
    assert "timing_ms" in body
    assert "almacen_orden_compra_item" in body
    assert "def list_materiales_solicitados_contrato" in src
    assert "def list_proveedores_solicitados_contrato" in src


def test_rutas_autocomplete_solicitados():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "materiales-solicitados" in routes
    assert "proveedores-solicitados" in routes
    assert "list_materiales_solicitados_contrato" in routes
    assert "list_proveedores_solicitados_contrato" in routes
    assert "ocs-pendientes" in routes
