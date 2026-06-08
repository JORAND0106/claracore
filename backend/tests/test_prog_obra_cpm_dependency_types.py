"""CPM: tipos de dependencia FS, SS, FF, SF."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_ss_lag_tres_dias_habiles():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 5, date(2026, 6, 9), date(2026, 6, 13), agrupador_id="101")
    n2 = NodoCPM("PK1", "04", 10, date(2026, 6, 9), date(2026, 6, 20), agrupador_id="402")
    deps = [DependenciaCPM("PK1", "01", "PK1", "04", "SS", 3, "101", "402")]
    res = calcular_cpm([n1, n2], deps, 1, cache, fecha_inicio_proyecto=date(2026, 6, 9))
    assert res.ok
    by_key = {(n.capitulo, n.agrupador_id): n for n in res.nodos}
    assert by_key[("04", "402")].fecha_inicio_temprana == date(2026, 6, 12)


def test_ss_alinea_inicio_temprano_aunque_destino_estuviera_programado_despues():
    """SS lag 0: el sucesor debe iniciar cuando el origen, no conservar fecha secuencial manual."""
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 5, date(2025, 3, 3), date(2025, 3, 7), agrupador_id="101")
    n2 = NodoCPM("PK1", "01", 5, date(2025, 3, 10), date(2025, 3, 14), agrupador_id="102")
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "SS", 0, "101", "102")]
    res = calcular_cpm([n1, n2], deps, 1, cache)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["102"].fecha_inicio_temprana == by_ag["101"].fecha_inicio_temprana


def test_fs_retarda_sucesor_un_dia_habil_despues_del_fin():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 3, date(2025, 3, 3), date(2025, 3, 5), agrupador_id="101")
    n2 = NodoCPM("PK1", "01", 2, date(2025, 3, 3), date(2025, 3, 4), agrupador_id="102")
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "101", "102")]
    res = calcular_cpm([n1, n2], deps, 1, cache)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["102"].fecha_inicio_temprana > by_ag["101"].fecha_fin_temprana


def test_ff_alinea_fin_temprano():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 5, date(2025, 3, 3), date(2025, 3, 7), agrupador_id="101")
    n2 = NodoCPM("PK1", "01", 3, date(2025, 3, 3), date(2025, 3, 5), agrupador_id="102")
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "FF", 0, "101", "102")]
    res = calcular_cpm([n1, n2], deps, 1, cache)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["102"].fecha_fin_temprana == by_ag["101"].fecha_fin_temprana


def test_tipo_minusculas_funciona():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 3, date(2025, 3, 3), date(2025, 3, 5), agrupador_id="101")
    n2 = NodoCPM("PK1", "01", 2, date(2025, 3, 3), date(2025, 3, 4), agrupador_id="102")
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "ss", 0, "101", "102")]
    res = calcular_cpm([n1, n2], deps, 1, cache)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["102"].fecha_inicio_temprana == by_ag["101"].fecha_inicio_temprana
