"""Entradas tablet: marca por revisar y rutas."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_motivos_helpers():
    import sys

    sys.path.insert(0, str(ROOT))
    from almacen_entrada_por_revisar import (
        MOTIVO_SIN_FOTO,
        MOTIVO_SIN_OC,
        MOTIVO_SUPERA_SALDO,
        patch_por_revisar,
        unir_motivos,
    )

    assert "Sin orden" in unir_motivos([MOTIVO_SIN_OC, MOTIVO_SIN_FOTO])
    p = patch_por_revisar([MOTIVO_SUPERA_SALDO])
    assert p["por_revisar"] is True
    assert "Supera" in (p["por_revisar_motivos"] or "")
    assert patch_por_revisar([])["por_revisar"] is False


def test_create_entrada_motivos_y_recibo_fotos():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    create = src.split("def create_entrada")[1].split("\ndef ")[0]
    assert "MOTIVO_SIN_FOTO" in src
    assert "MOTIVO_SUPERA_SALDO" in src
    # Mensaje legacy de remisión como PDF/foto genérico ya no aplica.
    assert "Adjunte el soporte fotográfico o PDF de la remisión." not in create
    # Recibo: remisión + foto descargue obligatorias (única excepción a no bloquear).
    assert "foto del descargue" in create.lower()
    assert "remisión" in create.lower() or "remision" in create.lower()
    assert "almacen_entrada_soporte_hash" in src or "_assert_soporte_hash_libre" in create
    assert "def list_ocs_pendientes_tarjeta" in src
    assert "def completar_revision_entrada" in src


def test_migration_y_rutas():
    mig = ROOT / "migrations" / "20261030120000_almacen_entrada_por_revisar.sql"
    assert mig.is_file()
    assert "por_revisar" in mig.read_text(encoding="utf-8")
    runner = (ROOT / "schema_migrations_runner.py").read_text(encoding="utf-8")
    assert "20261030120000_almacen_entrada_por_revisar.sql" in runner
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    assert "ocs-pendientes" in routes
    assert "completar-revision" in routes
    assert "COMPLETAR_REVISION_ENTRADA" in routes
    assert "proveedor_nombre_texto" in routes


def test_ruta_create_recibo_exige_dos_fotos_no_numero():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    create = routes.split("async def route_create_entrada")[1].split("@router.")[0]
    assert "Adjunte el soporte fotográfico" not in create
    assert "Indique el número de remisión" not in create
    assert "material_foto" in create
    assert "foto del descargue" in create.lower()
    assert "check-soporte-hash" in routes
    assert "remision_content_hash" in create
    assert "material_content_hash" in create


def test_migration_soporte_hash_en_runner():
    mig = ROOT / "migrations" / "20261102210000_almacen_entrada_soporte_hash.sql"
    assert mig.is_file()
    text = mig.read_text(encoding="utf-8")
    assert "almacen_entrada_soporte_hash" in text
    assert "content_hash" in text
    runner = (ROOT / "schema_migrations_runner.py").read_text(encoding="utf-8")
    assert "20261102210000_almacen_entrada_soporte_hash.sql" in runner
