"""Unit tests — ocurrencias y solapes del Plan de actividades."""
from datetime import date

from plan_actividades_service import expandir_ocurrencias, _intervalos_solapan


def test_expandir_sin_fechas():
    assert expandir_ocurrencias(None, None, "ninguna", None) == []


def test_expandir_ninguna():
    occs = expandir_ocurrencias(date(2026, 11, 3), date(2026, 11, 5), "ninguna", None)
    assert len(occs) == 1
    assert occs[0] == (date(2026, 11, 3), date(2026, 11, 5))


def test_expandir_semanal():
    occs = expandir_ocurrencias(
        date(2026, 11, 3), date(2026, 11, 3), "semanal", date(2026, 11, 24),
    )
    assert len(occs) == 4
    assert occs[1][0] == date(2026, 11, 10)


def test_expandir_mensual_clamp():
    occs = expandir_ocurrencias(
        date(2026, 1, 31), date(2026, 1, 31), "mensual", date(2026, 3, 31),
    )
    assert len(occs) >= 3
    assert occs[1][0] == date(2026, 2, 28) or occs[1][0].month == 2


def test_solapan():
    assert _intervalos_solapan(
        date(2026, 11, 1), date(2026, 11, 5),
        date(2026, 11, 5), date(2026, 11, 7),
    )
    assert not _intervalos_solapan(
        date(2026, 11, 1), date(2026, 11, 4),
        date(2026, 11, 5), date(2026, 11, 7),
    )
