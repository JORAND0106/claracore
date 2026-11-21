"""CPM SNET: fecha manual = no empezar antes de; deps pueden retrasar."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_snet_sin_deps_conserva_fecha_manual():
    ver_ini = date(2026, 6, 1)
    manual = date(2026, 6, 9)  # hábil (evitar festivos CO)
    nodos = [
        NodoCPM("PK1", "2. CAP", 5, manual, date(2026, 6, 15), agrupador_id="10", es_ancla=True),
    ]
    res = calcular_cpm(nodos, [], 1, _cache(), fecha_inicio_proyecto=ver_ini)
    assert res.ok
    n = res.nodos[0]
    assert n.fecha_inicio_temprana == manual
    assert n.desplazada_por_dependencia is False


def test_snet_deps_pueden_retrasar_pero_no_adelantar():
    ver_ini = date(2026, 6, 1)
    manual = date(2026, 6, 9)
    nodos = [
        NodoCPM("PK1", "2. CAP", 10, ver_ini, date(2026, 6, 12), agrupador_id="1", es_ancla=False),
        NodoCPM("PK1", "2. CAP", 5, manual, date(2026, 6, 13), agrupador_id="2", es_ancla=True),
    ]
    deps = [
        DependenciaCPM(
            pk_id_origen="PK1",
            capitulo_origen="2. CAP",
            pk_id_destino="PK1",
            capitulo_destino="2. CAP",
            tipo="FS",
            agrupador_id_origen="1",
            agrupador_id_destino="2",
        ),
    ]
    res = calcular_cpm(nodos, deps, 1, _cache(), fecha_inicio_proyecto=ver_ini)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    # Pred termina ~12 jun; sucesor SNET piso 10 jun → ES = después del pred
    assert by_ag["2"].fecha_inicio_temprana > manual
    assert by_ag["2"].desplazada_por_dependencia is True


def test_snet_recalculo_idempotente():
    ver_ini = date(2026, 6, 1)
    manual = date(2026, 6, 9)
    def run():
        nodos = [
            NodoCPM("PK1", "2. CAP", 5, ver_ini, date(2026, 6, 5), agrupador_id="1", es_ancla=False),
            NodoCPM("PK1", "2. CAP", 3, manual, date(2026, 6, 11), agrupador_id="2", es_ancla=True),
        ]
        deps = [
            DependenciaCPM(
                "PK1", "2. CAP", "PK1", "2. CAP", "FS",
                agrupador_id_origen="1", agrupador_id_destino="2",
            ),
        ]
        return calcular_cpm(nodos, deps, 1, _cache(), fecha_inicio_proyecto=ver_ini)

    r1 = run()
    r2 = run()
    assert r1.ok and r2.ok
    a1 = {n.agrupador_id: n.fecha_inicio_temprana for n in r1.nodos}
    a2 = {n.agrupador_id: n.fecha_inicio_temprana for n in r2.nodos}
    assert a1 == a2


def test_snet_sin_deps_no_vuelve_a_inicio_proyecto():
    """Regresión auditoría: CPM no debe arrastrar anclas al inicio de versión."""
    ver_ini = date(2026, 5, 4)  # lunes hábil
    manual = date(2026, 7, 2)   # jueves hábil
    nodos = [
        NodoCPM("PK1", "3. CAP", 8, manual, date(2026, 7, 13), agrupador_id="99", es_ancla=True),
    ]
    res = calcular_cpm(nodos, [], 1, _cache(), fecha_inicio_proyecto=ver_ini)
    assert res.ok
    assert res.nodos[0].fecha_inicio_temprana == manual
    assert res.nodos[0].fecha_inicio_temprana != ver_ini
