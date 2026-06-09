"""CPM forward pass: dependencias FS mueven agrupadores no anclados."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_fs_dependencia_mueve_destino_sin_ancla():
    ver_ini = date(2026, 6, 9)
    nodos = [
        NodoCPM("PK1", "2. CAP", 15, ver_ini, date(2026, 6, 27), agrupador_id="201", es_ancla=False),
        NodoCPM("PK1", "2. CAP", 10, ver_ini, date(2026, 6, 20), agrupador_id="202", es_ancla=False),
    ]
    deps = [
        DependenciaCPM(
            pk_id_origen="PK1",
            capitulo_origen="2. CAP",
            pk_id_destino="PK1",
            capitulo_destino="2. CAP",
            tipo="FS",
            lag_dias=0,
            agrupador_id_origen="201",
            agrupador_id_destino="202",
        ),
    ]
    res = calcular_cpm(nodos, deps, 1, _cache(), fecha_inicio_proyecto=ver_ini)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["201"].fecha_inicio_temprana == ver_ini
    assert by_ag["202"].fecha_inicio_temprana > by_ag["201"].fecha_fin_temprana


def test_ancla_manual_no_se_mueve_pero_sucesor_si():
    ver_ini = date(2026, 6, 9)
    manual = date(2026, 6, 12)
    nodos = [
        NodoCPM("PK1", "2. CAP", 5, manual, date(2026, 6, 16), agrupador_id="201", es_ancla=True),
        NodoCPM("PK1", "2. CAP", 10, ver_ini, date(2026, 6, 20), agrupador_id="202", es_ancla=False),
    ]
    deps = [
        DependenciaCPM(
            pk_id_origen="PK1",
            capitulo_origen="2. CAP",
            pk_id_destino="PK1",
            capitulo_destino="2. CAP",
            tipo="FS",
            agrupador_id_origen="201",
            agrupador_id_destino="202",
        ),
    ]
    res = calcular_cpm(nodos, deps, 1, _cache(), fecha_inicio_proyecto=ver_ini)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["201"].fecha_inicio_temprana == manual
    assert by_ag["202"].fecha_inicio_temprana > by_ag["201"].fecha_fin_temprana
