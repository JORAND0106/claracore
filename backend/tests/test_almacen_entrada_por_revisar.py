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


def test_create_entrada_no_bloquea_por_foto_ni_saldo_en_codigo():
    src = (ROOT / "almacen_service.py").read_text(encoding="utf-8")
    # La función debe marcar motivos, no raise por remisión faltante en recibo.
    assert "MOTIVO_SIN_FOTO" in src
    assert "MOTIVO_SUPERA_SALDO" in src
    assert "Adjunte el soporte fotográfico o PDF de la remisión." not in src.split("def create_entrada")[1].split("def ")[0]
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


def test_ruta_create_ya_no_exige_remision():
    routes = (ROOT / "almacen_routes.py").read_text(encoding="utf-8")
    # El bloque duro de remisión obligatoria debe haber desaparecido del POST entradas.
    create = routes.split("async def route_create_entrada")[1].split("@router.")[0]
    assert "Adjunte el soporte fotográfico" not in create
    assert "Indique el número de remisión" not in create
