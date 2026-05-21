"""CPM calendar cache: una sola carga BD por rango, no por día."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import _build_wd_index


def test_fechas_extra_expands_cache_without_extra_loader_calls():
    calls = []

    def loader(_cid, desde, hasta):
        calls.append((desde, hasta))
        return [{"fecha": "2025-06-15"}]

    cache = CalendarioNoHabilesCache(loader=loader)
    cache.fechas_extra(1, date(2025, 6, 1), date(2025, 6, 30))
    cache.fechas_extra(1, date(2025, 5, 1), date(2025, 7, 31))
    assert len(calls) == 2
    assert calls[0] == (date(2025, 6, 1), date(2025, 6, 30))
    assert calls[1] == (date(2025, 5, 1), date(2025, 7, 31))
    # Tercera petición dentro del rango ya cacheado: sin nueva consulta
    cache.fechas_extra(1, date(2025, 6, 10), date(2025, 6, 20))
    assert len(calls) == 2


def test_build_wd_index_single_loader_call_for_whole_range():
    calls = []

    def loader(_cid, desde, hasta):
        calls.append((desde, hasta))
        return []

    cache = CalendarioNoHabilesCache(loader=loader)
    d0 = date(2025, 3, 3)  # lunes
    d1 = date(2025, 3, 28)  # viernes
    working_days, wd_to_idx = _build_wd_index(d0, d1, 1, cache, padding_days=30)
    assert len(calls) == 1
    assert working_days
    assert d0 in wd_to_idx
    assert d1 in wd_to_idx
