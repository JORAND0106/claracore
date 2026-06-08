"""Dependencias CPM tramo: réplica por PK y SS entre capítulos."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import NodoCPM, calcular_cpm
from prog_obra_service import _construir_dependencias_cpm, _consolidar_fila_agrupador_cpm


def test_consolidar_fila_preserva_duracion_con_fechas_cpm_en_hijo():
    rows = [
        {
            "item": "4.D",
            "codigo_wbs": "4.D",
            "duracion_dias_habiles": 15,
            "fecha_inicio": None,
            "fecha_fin_calculada": None,
        },
        {
            "item": "040101",
            "codigo_wbs": "4.D",
            "duracion_dias_habiles": None,
            "fecha_inicio": "2026-08-25",
            "fecha_fin_calculada": "2026-09-10",
        },
    ]
    out = _consolidar_fila_agrupador_cpm(rows)
    assert out["duracion_dias_habiles"] == 15
    assert out["item"] == "4.D"


def test_construir_dependencias_replica_ss_entre_capitulos_en_todos_los_pks():
    cache = CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])
    ver_ini = date(2026, 6, 9)
    nodos = [
        NodoCPM("PK1", "1. CAP", 15, ver_ini, date(2026, 6, 27), agrupador_id="101"),
        NodoCPM("PK1", "4. CAP", 10, ver_ini, date(2026, 6, 20), agrupador_id="402"),
        NodoCPM("PK2", "1. CAP", 15, ver_ini, date(2026, 6, 27), agrupador_id="101"),
        NodoCPM("PK2", "4. CAP", 10, ver_ini, date(2026, 6, 20), agrupador_id="402"),
    ]
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {
                "pk_id_origen": "PK1",
                "capitulo_origen": "1. CAP",
                "pk_id_destino": "PK1",
                "capitulo_destino": "4. CAP",
                "tipo": "SS",
                "lag_dias": 3,
                "agrupador_id_origen": 101,
                "agrupador_id_destino": 402,
            }
        ]
    )
    sb.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    deps = _construir_dependencias_cpm(sb, "vid", nodos)
    ss = [d for d in deps if d.tipo == "SS" and d.agrupador_id_destino == "402"]
    assert len(ss) == 2
    assert {d.pk_id_origen for d in ss} == {"PK1", "PK2"}

    res = calcular_cpm(nodos, deps, 1, cache, fecha_inicio_proyecto=ver_ini)
    assert res.ok
    dest_pk1 = next(n for n in res.nodos if n.pk_id == "PK1" and n.agrupador_id == "402")
    assert dest_pk1.fecha_inicio_temprana == date(2026, 6, 12)
