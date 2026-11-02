"""Salida inmediata pendiente: marca en entrada y limpieza al confirmar salida."""
from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")

from pathlib import Path


def test_migration_salida_inmediata_en_critical():
    root = Path(__file__).resolve().parents[1]
    runner = (root / "schema_migrations_runner.py").read_text(encoding="utf-8")
    sql = root / "migrations" / "20261103010000_almacen_entrada_salida_inmediata.sql"
    assert sql.is_file()
    assert "salida_inmediata_pendiente" in sql.read_text(encoding="utf-8")
    assert "20261103010000_almacen_entrada_salida_inmediata.sql" in runner


def test_routes_exponen_flag_y_clear():
    routes = Path(__file__).resolve().parents[1] / "almacen_routes.py"
    text = routes.read_text(encoding="utf-8")
    assert "salida_inmediata_pendiente" in text
    assert 'salida-inmediata/completar' in text
    assert "clear_salida_inmediata_pendiente" in text


def test_service_clear_y_create_salida_limpian_marca():
    svc = Path(__file__).resolve().parents[1] / "almacen_service.py"
    text = svc.read_text(encoding="utf-8")
    assert "def clear_salida_inmediata_pendiente" in text
    assert "_clear_salida_inmediata_si_aplica" in text
    assert '"salida_inmediata_pendiente": bool(body.get("salida_inmediata_pendiente"))' in text
    assert '"entrada_id": int(ent["id"])' in text
