"""Tests de mitigación PGRST diagnóstico (columna periodo en snapshots email)."""
from __future__ import annotations

import notificaciones_email_service as nes
from notificaciones_email_service import NotificacionesEmailRunner


def test_is_missing_periodo_detects_pgrst204():
    e = Exception(
        "Could not find the 'periodo' column of "
        "'notificaciones_email_resumen_snapshot' in the schema cache"
    )
    assert nes._is_missing_periodo_column_error(e) is True


def test_is_missing_periodo_detects_42703():
    e = Exception(
        "42703: column notificaciones_email_resumen_snapshot.periodo does not exist"
    )
    assert nes._is_missing_periodo_column_error(e) is True


def test_is_missing_periodo_ignora_otros():
    assert nes._is_missing_periodo_column_error(Exception("timeout")) is False
    assert nes._is_missing_periodo_column_error(Exception("PGRST203 overload")) is False


def test_snapshot_periodo_probe_cachea_false():
    nes._snapshot_periodo_schema_ok = None

    class FakeTable:
        def select(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            raise Exception(
                "Could not find the 'periodo' column of "
                "'notificaciones_email_resumen_snapshot' in the schema cache"
            )

    class FakeSb:
        def table(self, _name):
            return FakeTable()

    inst = object.__new__(NotificacionesEmailRunner)
    inst.supabase = FakeSb()
    assert inst._snapshot_periodo_disponible() is False
    assert nes._snapshot_periodo_schema_ok is False
    assert inst._snapshot_periodo_disponible() is False
