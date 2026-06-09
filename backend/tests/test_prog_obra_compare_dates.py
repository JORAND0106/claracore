"""Fechas efectivas en fetch_compare_nodes (Curva S / comparación)."""
from datetime import date

from prog_obra_compare import (
    _effective_fecha_fin,
    _effective_fecha_inicio,
    _effective_schedule_cpm,
    _effective_schedule_programada,
)


def test_schedule_cpm_prefiere_temprana_sobre_programada_vieja():
    row = {
        "fecha_inicio": "2026-06-09",
        "fecha_fin_calculada": "2026-06-18",
        "fecha_inicio_temprana": "2026-08-11",
        "fecha_fin_temprana": "2026-08-20",
    }
    fi, ff = _effective_schedule_cpm(row)
    assert fi == date(2026, 8, 11)
    assert ff == date(2026, 8, 20)


def test_schedule_programada_ignora_temprana():
    row = {
        "fecha_inicio": "2026-06-09",
        "fecha_fin_calculada": "2026-06-18",
        "fecha_inicio_temprana": "2026-08-11",
        "fecha_fin_temprana": "2026-08-20",
    }
    fi, ff = _effective_schedule_programada(row)
    assert fi == date(2026, 6, 9)
    assert ff == date(2026, 6, 18)


def test_effective_fecha_solo_temprana():
    row = {"fecha_inicio_temprana": "2026-08-12", "fecha_fin_temprana": "2026-08-20"}
    assert _effective_fecha_inicio(row) == date(2026, 8, 12)
    assert _effective_fecha_fin(row) == date(2026, 8, 20)
