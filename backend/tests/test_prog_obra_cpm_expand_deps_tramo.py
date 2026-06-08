"""CPM tramo: réplica de dependencias entre agrupadores por PK."""
from __future__ import annotations

from datetime import date

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import DependenciaCPM, NodoCPM, calcular_cpm
from prog_obra_service import _expand_dependencias_agrupador_por_pk


def test_expand_dependencias_agrupador_replica_a_todos_los_pks():
    deps = [
        DependenciaCPM("PK1", "01", "PK1", "01", "FS", 0, "101", "102"),
    ]
    nodos = [
        NodoCPM("PK1", "01", 5, date(2025, 6, 9), date(2025, 6, 13), agrupador_id="101"),
        NodoCPM("PK1", "01", 3, date(2025, 6, 9), date(2025, 6, 11), agrupador_id="102"),
        NodoCPM("PK2", "01", 5, date(2025, 6, 9), date(2025, 6, 13), agrupador_id="101"),
        NodoCPM("PK2", "01", 3, date(2025, 6, 9), date(2025, 6, 11), agrupador_id="102"),
    ]
    expanded = _expand_dependencias_agrupador_por_pk(deps, nodos)
    sigs = {(d.pk_id_origen, d.pk_id_destino, d.agrupador_id_origen, d.agrupador_id_destino) for d in expanded}
    assert ("PK1", "PK1", "101", "102") in sigs
    assert ("PK2", "PK2", "101", "102") in sigs


def test_cpm_cadena_fs_propaga_en_pk_replicado():
    cache = CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])
    ver_ini = date(2025, 6, 9)
    nodos = [
        NodoCPM("PK2", "01", 15, ver_ini, date(2025, 6, 27), agrupador_id="101"),
        NodoCPM("PK2", "01", 10, ver_ini, date(2025, 6, 20), agrupador_id="102"),
    ]
    deps = [DependenciaCPM("PK2", "01", "PK2", "01", "FS", 0, "101", "102")]
    res = calcular_cpm(nodos, deps, 1, cache, fecha_inicio_proyecto=ver_ini)
    assert res.ok
    by_ag = {n.agrupador_id: n for n in res.nodos}
    assert by_ag["102"].fecha_inicio_temprana > by_ag["101"].fecha_fin_temprana
