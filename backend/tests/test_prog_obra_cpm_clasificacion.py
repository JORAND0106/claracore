"""Clasificación CPM: ruta crítica real vs actividad final del tramo."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm


def test_ruta_critica_solo_nodos_con_sucesores():
    cache = CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])
    n1 = NodoCPM("PK1", "01", 5, date(2025, 3, 3), date(2025, 3, 7))
    n2 = NodoCPM("PK1", "02", 3, date(2025, 3, 10), date(2025, 3, 12))
    n3 = NodoCPM("PK1", "03", 2, date(2025, 3, 13), date(2025, 3, 14))
    deps = [
        DependenciaCPM("PK1", "01", "PK1", "02", "FS", 0),
        DependenciaCPM("PK1", "02", "PK1", "03", "FS", 0),
    ]
    res = calcular_cpm([n1, n2, n3], deps, 1, cache)
    assert res.ok
    by_cap = {n.capitulo: n for n in res.nodos}
    assert by_cap["01"].es_ruta_critica is True
    assert by_cap["01"].tiene_sucesores is True
    assert by_cap["01"].es_actividad_final_tramo is False
    assert by_cap["02"].es_ruta_critica is True
    assert by_cap["02"].tiene_sucesores is True
    assert by_cap["03"].es_ruta_critica is False
    assert by_cap["03"].es_actividad_final_tramo is True
    assert by_cap["03"].tiene_sucesores is False
    assert ("PK1", "01", "") in res.ruta_critica
    assert ("PK1", "02", "") in res.ruta_critica
    assert ("PK1", "03", "") not in res.ruta_critica
