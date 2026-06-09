"""CPM: nodos stub desde dependencias heredan duración cross-PK."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache, add_dias_habiles
from prog_obra_cpm import NodoCPM
from prog_obra_service import (
    _completar_nodos_cpm_desde_dependencias,
    _duraciones_agrupador_para_cpm,
    _resolve_duracion_stub_cpm_nodo,
)


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_resolve_duracion_stub_hereda_de_otro_pk():
    cap = "2. ESTRUCTURA DE PAVIMENTO Y ADOQUINES"
    raw_ags = [
        {
            "pk_id": "120369",
            "capitulo": cap,
            "agrupador_id": 14,
            "item": "2.A",
            "codigo_wbs": "2.A",
            "duracion_dias_habiles": 15,
        },
    ]
    merge = _duraciones_agrupador_para_cpm(raw_ags)
    dur = _resolve_duracion_stub_cpm_nodo(
        "120367", cap, "14", {}, merge, raw_ags,
    )
    assert dur == 15


def test_completar_stub_nodo_usa_duracion_cross_pk():
    cache = _cache()
    ver_ini = date(2026, 6, 9)
    add_dh = add_dias_habiles
    cap = "2. ESTRUCTURA DE PAVIMENTO Y ADOQUINES"
    raw_ags = [
        {
            "pk_id": "120369",
            "capitulo": cap,
            "agrupador_id": 14,
            "item": "2.A",
            "codigo_wbs": "2.A",
            "duracion_dias_habiles": 15,
        },
    ]
    merge = _duraciones_agrupador_para_cpm(raw_ags)
    nodos = [
        NodoCPM(
            "120367", "1. ACTIVIDADES PRELIMINARES, EXPLANACIONES Y EXCAVACIONES",
            17, ver_ini, add_dh(1, ver_ini, 17, cache), agrupador_id="13",
        ),
    ]
    seen_ag = {n.key for n in nodos}
    caps_con_ag = {("120367", nodos[0].capitulo)}

    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {
                "pk_id_origen": "120367",
                "capitulo_origen": "1. ACTIVIDADES PRELIMINARES, EXPLANACIONES Y EXCAVACIONES",
                "pk_id_destino": "120367",
                "capitulo_destino": cap,
                "agrupador_id_origen": 13,
                "agrupador_id_destino": 14,
                "tipo": "SS",
                "lag_dias": 3,
            },
        ]
    )

    _completar_nodos_cpm_desde_dependencias(
        sb,
        "vid",
        nodos,
        seen_ag,
        caps_con_ag,
        ver_ini,
        1,
        cache,
        add_dh,
        dur_lookup={},
        merge_dur_by_ag=merge,
        raw_ags=raw_ags,
    )

    stub = next(n for n in nodos if n.agrupador_id == "14")
    assert stub.duracion == 15
    assert stub.fecha_fin_base > stub.fecha_inicio_base
