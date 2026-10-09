"""Runner de migraciones críticas."""
from __future__ import annotations

import schema_migrations_runner as runner


def test_critical_includes_cierre_motivo_and_rrhh_flag():
    names = set(runner.CRITICAL_MIGRATIONS)
    assert "20261009010000_bitacora_cierre_motivo_automatico_atrasado.sql" in names
    assert "20261009140000_almacen_solicitud_proveedor_seleccionado.sql" in names
    assert "20260925120000_bitacora_asistencia_rrhh_activa.sql" in names
    paths = runner.list_migration_files(only=runner.CRITICAL_MIGRATIONS)
    assert {p.name for p in paths} == names


def test_ensure_without_db_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    out = runner.ensure_critical_migrations()
    assert out["ok"] is False
    assert out["reason"] == "missing_SUPABASE_DB_URL"
    assert out["applied"] == []
