"""CPM: horizonte de versión, anclas manuales y holgura negativa."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_backward_pass_usa_fecha_fin_proyecto():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 5, date(2025, 3, 3), date(2025, 3, 7))
    n2 = NodoCPM("PK1", "02", 3, date(2025, 3, 10), date(2025, 3, 12))
    deps = [DependenciaCPM("PK1", "01", "PK1", "02", "FS", 0)]
    res = calcular_cpm(
        [n1, n2],
        deps,
        1,
        cache,
        fecha_fin_proyecto=date(2025, 3, 14),
    )
    assert res.ok
    by_cap = {n.capitulo: n for n in res.nodos}
    assert by_cap["02"].fecha_fin_tardia == date(2025, 3, 14)


def test_ancla_manual_no_se_mueve_en_forward_pass():
    cache = _cache()
    n1 = NodoCPM(
        "PK1", "01", 5, date(2025, 3, 3), date(2025, 3, 7),
        agrupador_id="101", es_ancla=True,
    )
    n2 = NodoCPM(
        "PK1", "01", 3, date(2025, 3, 20), date(2025, 3, 24),
        agrupador_id="102",
    )
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "101", "102")]
    res = calcular_cpm([n1, n2], deps, 1, cache)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["101"].fecha_inicio_temprana == date(2025, 3, 3)
    assert by_ag["102"].fecha_inicio_temprana > date(2025, 3, 7)


def test_holgura_negativa_cuando_excede_fecha_fin():
    cache = _cache()
    n1 = NodoCPM("PK1", "01", 10, date(2025, 3, 3), date(2025, 3, 14))
    res = calcular_cpm(
        [n1],
        [],
        1,
        cache,
        fecha_inicio_proyecto=date(2025, 3, 3),
        fecha_fin_proyecto=date(2025, 3, 10),
    )
    assert res.ok
    assert res.nodos[0].holgura_total < 0


def test_nodos_sin_fecha_manual_usan_inicio_proyecto():
    """Agrupadores sin ancla manual: raíz en fecha versión; sucesor por dependencia FS."""
    cache = _cache()
    ver_ini = date(2025, 4, 1)
    n1 = NodoCPM(
        "PK1", "01", 3, ver_ini, date(2025, 4, 3),
        agrupador_id="10", es_ancla=False,
    )
    n2 = NodoCPM(
        "PK1", "01", 2, ver_ini, date(2025, 4, 2),
        agrupador_id="20", es_ancla=False,
    )
    deps = [DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "10", "20")]
    res = calcular_cpm(
        [n1, n2],
        deps,
        1,
        cache,
        fecha_inicio_proyecto=ver_ini,
    )
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["10"].fecha_inicio_temprana == ver_ini
    assert by_ag["20"].fecha_inicio_temprana > by_ag["10"].fecha_fin_temprana


def test_forward_pass_independiente_orden_nodos_y_dependencias():
    """El forward pass usa orden topológico; no depende del orden de creación en BD."""
    cache = _cache()
    ver_ini = date(2025, 4, 1)

    def _n(ag: str, dur: int) -> NodoCPM:
        return NodoCPM(
            f"PK1", "01", dur, ver_ini, ver_ini,
            agrupador_id=ag, es_ancla=False,
        )

    n_a, n_b, n_c = _n("10", 2), _n("20", 3), _n("30", 2)
    deps_ab = DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "10", "20")
    deps_bc = DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "20", "30")
    deps_rev = [deps_bc, deps_ab]

    res_nodes_abc = calcular_cpm([n_a, n_b, n_c], deps_rev, 1, cache, fecha_inicio_proyecto=ver_ini)
    res_nodes_cba = calcular_cpm([n_c, n_a, n_b], deps_rev, 1, cache, fecha_inicio_proyecto=ver_ini)
    res_deps_fwd = calcular_cpm([n_a, n_b, n_c], [deps_ab, deps_bc], 1, cache, fecha_inicio_proyecto=ver_ini)

    assert res_nodes_abc.ok and res_nodes_cba.ok and res_deps_fwd.ok

    def _by_ag(res):
        return {n.agrupador_id: n for n in res.nodos}

    a1, b1, c1 = _by_ag(res_nodes_abc)["10"], _by_ag(res_nodes_abc)["20"], _by_ag(res_nodes_abc)["30"]
    a2, b2, c2 = _by_ag(res_nodes_cba)["10"], _by_ag(res_nodes_cba)["20"], _by_ag(res_nodes_cba)["30"]
    a3, b3, c3 = _by_ag(res_deps_fwd)["10"], _by_ag(res_deps_fwd)["20"], _by_ag(res_deps_fwd)["30"]

    assert a1.fecha_inicio_temprana == a2.fecha_inicio_temprana == a3.fecha_inicio_temprana == ver_ini
    assert b1.fecha_inicio_temprana == b2.fecha_inicio_temprana == b3.fecha_inicio_temprana
    assert c1.fecha_inicio_temprana == c2.fecha_inicio_temprana == c3.fecha_inicio_temprana
    assert c1.fecha_inicio_temprana > b1.fecha_fin_temprana > a1.fecha_fin_temprana
