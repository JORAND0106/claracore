"""Tests — zona horaria Colombia en RRHH."""
from __future__ import annotations

from datetime import datetime, timezone

from rrhh_timezone import (
    TZ_BOGOTA,
    format_fecha_hora_colombia,
    now_iso_bogota,
    parse_to_bogota,
)


def test_now_iso_bogota_tiene_offset_colombia():
    s = now_iso_bogota()
    assert "-05:00" in s or s.endswith("-0500")
    assert "T" in s


def test_parse_utc_a_colombia():
    # 21:32 UTC → 16:32 Colombia
    dt = parse_to_bogota("2026-10-15T21:32:00+00:00")
    assert dt is not None
    assert dt.tzinfo is not None
    assert dt.hour == 16
    assert dt.minute == 32


def test_parse_z_suffix():
    dt = parse_to_bogota("2026-10-15T21:32:00Z")
    assert dt is not None
    assert dt.astimezone(TZ_BOGOTA).hour == 16


def test_format_corrige_registros_utc_antiguos():
    # Auditoría guardada en UTC: 21:32Z = 16:32 Colombia
    txt = format_fecha_hora_colombia("2026-10-15T21:32:00.123456+00:00")
    assert "15/10/2026" in txt
    assert "16:32" in txt


def test_format_naive_asume_utc():
    txt = format_fecha_hora_colombia("2026-10-15T21:32:00")
    assert "16:32" in txt


def test_format_ya_en_colombia():
    txt = format_fecha_hora_colombia("2026-10-15T17:32:00-05:00", with_seconds=True)
    assert txt == "15/10/2026 17:32:00"


def test_format_vacio():
    assert format_fecha_hora_colombia(None) == "—"
    assert format_fecha_hora_colombia("") == "—"


def test_auditoria_now_iso_usa_bogota():
    from rrhh_auditoria_docs import _now_iso

    s = _now_iso()
    assert "-05:00" in s
