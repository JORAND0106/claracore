"""CPM: resolución de duración alineada con estructura-tramo."""
from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

from prog_obra_calendar import CalendarioNoHabilesCache
from prog_obra_cpm import NodoCPM
from prog_obra_service import (
    _build_capitulo_resolver,
    _construir_dependencias_cpm,
    _resolve_duracion_cpm_nodo,
)


def _cache() -> CalendarioNoHabilesCache:
    return CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])


def test_resolve_duracion_desde_span_fechas_cuando_columna_null():
    cache = _cache()
    row = {
        "duracion_dias_habiles": None,
        "fecha_inicio": "2026-06-09",
        "fecha_fin_calculada": "2026-06-24",
    }
    dur = _resolve_duracion_cpm_nodo(row, [row], "4. CAP", 402, "PK1", 1, cache)
    assert dur > 1


def test_resolve_duracion_cross_pk():
    cache = _cache()
    acts = [
        {"pk_id": "PK1", "capitulo": "2. CAP", "agrupador_id": 10, "duracion_dias_habiles": 12},
        {
            "pk_id": "PK2",
            "capitulo": "2. CAP",
            "agrupador_id": 10,
            "duracion_dias_habiles": None,
            "fecha_inicio": "2026-06-09",
            "fecha_fin_calculada": "2026-06-09",
        },
    ]
    row = acts[1]
    dur = _resolve_duracion_cpm_nodo(row, acts, "2. CAP", 10, "PK2", 1, cache)
    assert dur == 12


def test_capitulo_resolver_alinea_prefijo_numerico():
    nodos = [
        NodoCPM("PK1", "1. PRELIMINARES", 5, date(2026, 6, 9), date(2026, 6, 13), agrupador_id="101"),
        NodoCPM("PK1", "4. ESTRUCTURA", 10, date(2026, 6, 9), date(2026, 6, 20), agrupador_id="402"),
    ]
    resolve = _build_capitulo_resolver(nodos)
    assert resolve("PK1", "1") == "1. PRELIMINARES"
    assert resolve("PK1", "4") == "4. ESTRUCTURA"


def test_stored_duracion_alinea_capitulo_por_prefijo():
    acts = [
        {"pk_id": "PK1", "capitulo": "4. ESTRUCTURA", "agrupador_id": 401, "duracion_dias_habiles": 14},
        {"pk_id": "PK2", "capitulo": "4", "agrupador_id": 401, "duracion_dias_habiles": None},
    ]
    from prog_obra_service import _stored_duracion_agrupador

    assert _stored_duracion_agrupador(acts, "4. ESTRUCTURA", 401, pk_ids=["PK2"]) == 14
    assert _stored_duracion_agrupador(acts, "4", 401) == 14


def test_sync_merge_tramo_duracion_cap4():
    cache = _cache()
    acts = [
        {
            "pk_id": "PK1",
            "capitulo": "4. ESTRUCTURA",
            "agrupador_id": 401,
            "item": "4.A",
            "codigo_wbs": "4.A",
            "duracion_dias_habiles": 12,
            "fecha_inicio": "2026-07-01",
            "fecha_fin_calculada": "2026-07-01",
        },
        {
            "pk_id": "PK2",
            "capitulo": "4. ESTRUCTURA",
            "agrupador_id": 401,
            "item": "4.A",
            "codigo_wbs": "4.A",
            "duracion_dias_habiles": None,
            "fecha_inicio": "2026-07-01",
            "fecha_fin_calculada": "2026-07-01",
        },
    ]
    from prog_obra_service import _sync_duraciones_merge_tramo_antes_cpm

    out = _sync_duraciones_merge_tramo_antes_cpm(acts, 1, cache)
    assert out.get(("PK2", "4. ESTRUCTURA", "401")) == 12


def test_construir_dependencias_con_capitulo_corto_en_bd():
    cache = CalendarioNoHabilesCache(loader=lambda *_a, **_k: [])
    ver_ini = date(2026, 6, 9)
    nodos = [
        NodoCPM("PK1", "1. PRELIMINARES", 15, ver_ini, date(2026, 6, 27), agrupador_id="101"),
        NodoCPM("PK1", "4. ESTRUCTURA", 10, ver_ini, date(2026, 6, 20), agrupador_id="402"),
    ]
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[
            {
                "pk_id_origen": "PK1",
                "capitulo_origen": "1",
                "pk_id_destino": "PK1",
                "capitulo_destino": "4",
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
    assert len(ss) == 1
    assert ss[0].capitulo_origen == "1. PRELIMINARES"
    assert ss[0].capitulo_destino == "4. ESTRUCTURA"
