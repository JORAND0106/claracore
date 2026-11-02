"""Consulta liviana de OC pendientes consolidadas y autocompletar solicitado."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_list_ocs_pendientes_consolida_y_rpc():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    start = src.index("def list_ocs_pendientes_tarjeta")
    end = src.index("\ndef list_materiales_solicitados_contrato", start)
    body = src[start:end]
    assert "get_orden_compra(" not in body
    assert "include_timing" in body
    assert "timing_ms" in body
    assert "insumos_map" in body or "almacen_ocs_pendientes_tarjeta" in body
    assert "_list_ocs_pendientes_via_rpc" in src
    assert "def list_materiales_solicitados_contrato" in src
    assert "def list_proveedores_solicitados_contrato" in src
    # Causa documentada de repetición
    assert "almacen_orden_compra_item" in body or "Causa histórica" in body


def test_rutas_autocomplete_y_foto_material():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "materiales-solicitados" in routes
    assert "proveedores-solicitados" in routes
    assert "material-foto/download" in routes
    assert "material_foto" in routes
    assert "ocs-pendientes" in routes


def test_migration_foto_material_y_rpc():
    mig = ROOT / "migrations" / "20261102180000_almacen_entrada_foto_material.sql"
    assert mig.is_file()
    txt = mig.read_text(encoding="utf-8")
    assert "material_foto_blob_path" in txt
    assert "almacen_ocs_pendientes_tarjeta" in txt
    runner = (ROOT / "schema_migrations_runner.py").read_text(encoding="utf-8")
    assert "20261102180000_almacen_entrada_foto_material.sql" in runner


def test_recibo_exige_dos_fotos():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    create = src.split("def create_entrada")[1].split("\ndef ")[0]
    assert "foto del recibo" in create.lower() or "remisión) es obligatoria" in create
    assert "material descargado" in create.lower()
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    create_r = routes.split("async def route_create_entrada")[1].split("@router.")[0]
    assert "material descargado" in create_r.lower()
