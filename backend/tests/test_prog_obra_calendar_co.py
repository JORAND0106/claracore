"""
Tests: festivos Colombia (holidays CO) y suma de días hábiles (prog_obra_calendar).
Referencias puntuales verificadas contra el calendario oficial implementado en `holidays`.
"""
from __future__ import annotations

from datetime import date

import holidays

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles, festivos_colombia_año


def _empty_loader(_cid, _a, _b):
    return []


def test_reyes_2023_observado_lunes():
    assert date(2023, 1, 9) in holidays.country_holidays("CO", years=[2023])
    assert date(2023, 1, 9) in festivos_colombia_año(2023)


def test_navidad_2024_es_festivo():
    assert date(2024, 12, 25) in festivos_colombia_año(2024)


def test_2020_bisiesto_san_jose():
    h = holidays.country_holidays("CO", years=[2020])
    assert date(2020, 3, 23) in h


def test_2030_tiene_festivos():
    h = holidays.country_holidays("CO", years=[2030])
    assert len(h) >= 10


def test_add_5_dias_habiles_sin_extra_ni_coincidencia_festivo():
    cache = CalendarioNoHabilesCache(loader=_empty_loader)
    inicio = date(2025, 1, 13)
    assert inicio not in holidays.country_holidays("CO", years=[2025])
    fin = add_dias_habiles(1, inicio, 5, cache)
    assert fin == date(2025, 1, 17)


def test_fin_de_semana_no_cuenta():
    cache = CalendarioNoHabilesCache(loader=_empty_loader)
    sab = date(2025, 1, 11)
    fin = add_dias_habiles(1, sab, 1, cache)
    assert fin == date(2025, 1, 13)
