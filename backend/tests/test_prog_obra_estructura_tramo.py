"""Estructura consolidada por tramo (WBS sumado)."""
from datetime import date
from decimal import Decimal

from prog_obra_service import (
    _aggregate_ppto_rows_tramo,
    _build_agrupador_pk_metrics,
    _merge_programacion_agrupador,
    build_estructura_tramo_response,
    expand_tramo_batch_by_pk,
)


def _agr_meta():
    return {
        10: {"id": 10, "nombre": "Preliminares", "codigo_wbs": "1.A", "orden": 1},
        20: {"id": 20, "nombre": "Estabilización", "codigo_wbs": "2.A", "orden": 1},
    }


def test_aggregate_suma_cantidades_y_costos_multi_pk():
    rows = [
        {"pk_id": "120367", "capitulo": "1. CAP", "item": "1.1", "cant_total": 100, "costo_directo": 1000, "und": "M2", "vlr_unitario": 10, "descripcion": "Item A"},
        {"pk_id": "120368", "capitulo": "1. CAP", "item": "1.1", "cant_total": 200, "costo_directo": 2000, "und": "M2", "vlr_unitario": 10},
        {"pk_id": "120367", "capitulo": "2. CAP", "item": "2.1", "cant_total": 50, "costo_directo": 500, "und": "M3", "vlr_unitario": 10, "descripcion": "Item B"},
        {"pk_id": "120368", "capitulo": "1. CAP", "item": "1.2", "cant_total": 30, "costo_directo": 300, "und": "M2", "vlr_unitario": 10, "descripcion": "Item C"},
    ]
    ag_by_item = {("1. CAP", "1.1"): 10, ("1. CAP", "1.2"): 10, ("2. CAP", "2.1"): 20}
    cap_map = _aggregate_ppto_rows_tramo(rows, ag_by_item, _agr_meta())
    assert float(cap_map["1. CAP"][10]["cant_total"]) == 330
    assert float(cap_map["1. CAP"][10]["costo_directo"]) == 3300
    assert cap_map["1. CAP"][10]["pk_ids"] == {"120367", "120368"}
    assert cap_map["2. CAP"][20]["pk_ids"] == {"120367"}
    items = cap_map["1. CAP"][10]["items"]
    assert float(items["1.1"]["cant_total"]) == 300
    assert float(items["1.1"]["costo_directo"]) == 3000
    assert items["1.1"]["descripcion"] == "Item A"
    assert float(items["1.2"]["cant_total"]) == 30


def test_aggregate_excluye_sin_agrupador():
    rows = [
        {"pk_id": "120367", "capitulo": "1. CAP", "item": "9.9", "cant_total": 99, "costo_directo": 99, "und": "U", "vlr_unitario": 1},
    ]
    ag_by_item = {}
    cap_map = _aggregate_ppto_rows_tramo(rows, ag_by_item, _agr_meta())
    assert cap_map == {}


def test_merge_programacion_consistente():
    acts = [
        {"pk_id": "120367", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-14"},
        {"pk_id": "120368", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-14"},
    ]
    prog = _merge_programacion_agrupador(acts, "1. CAP", 10, ["120367", "120368"])
    assert prog["consistente"] is True
    assert prog["fecha_inicio"] == "2026-03-01"
    assert prog["duracion_dias_habiles"] == 10


def test_merge_programacion_inconsistente_fechas_distintas():
    acts = [
        {"pk_id": "120367", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-14"},
        {"pk_id": "120368", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-04-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-04-15"},
    ]
    prog = _merge_programacion_agrupador(acts, "1. CAP", 10, ["120367", "120368"])
    assert prog["consistente"] is False
    assert prog["fecha_inicio"] == "2026-03-01"
    assert prog["fecha_fin_calculada"] == "2026-04-15"
    assert prog["duracion_dias_habiles"] == 10


def test_merge_programacion_conserva_duracion_usuario_si_fechas_cpm_span_corto():
    """Tras write-back CPM, la duración manual no se infiere del rango fi–ff."""
    acts = [
        {"pk_id": "120367", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-01"},
        {"pk_id": "120368", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-01"},
    ]
    prog = _merge_programacion_agrupador(acts, "1. CAP", 10, ["120367", "120368"])
    assert prog["duracion_dias_habiles"] == 10


def test_merge_programacion_parcial():
    acts = [
        {"pk_id": "120367", "capitulo": "1. CAP", "agrupador_id": 10, "fecha_inicio": "2026-03-01", "duracion_dias_habiles": 10, "fecha_fin_calculada": "2026-03-14"},
    ]
    prog = _merge_programacion_agrupador(acts, "1. CAP", 10, ["120367", "120368"])
    assert prog["consistente"] is False
    assert prog["fecha_inicio"] == "2026-03-01"
    assert prog["fecha_fin_calculada"] == "2026-03-14"


def test_merge_programacion_solo_duracion_sin_fecha():
    acts = [
        {"pk_id": "120367", "capitulo": "1. CAP", "agrupador_id": 10, "duracion_dias_habiles": 15},
        {"pk_id": "120368", "capitulo": "1. CAP", "agrupador_id": 10, "duracion_dias_habiles": 15},
    ]
    prog = _merge_programacion_agrupador(acts, "1. CAP", 10, ["120367", "120368"])
    assert prog["consistente"] is True
    assert prog["duracion_dias_habiles"] == 15
    assert prog["fecha_inicio"] is None


def test_build_response_orden_capitulos_y_agrupadores():
    cap_map = {
        "2. CAP": {
            20: {
                "agrupador_id": 20,
                "agrupador_nombre": "Estabilización",
                "codigo_wbs": "2.A",
                "orden": 1,
                "cant_total": Decimal("100"),
                "costo_directo": Decimal("5000"),
                "und": "M3",
                "pk_ids": {"120368", "120367"},
            }
        },
        "1. CAP": {
            10: {
                "agrupador_id": 10,
                "agrupador_nombre": "Preliminares",
                "codigo_wbs": "1.A",
                "orden": 1,
                "cant_total": Decimal("300"),
                "costo_directo": Decimal("3000"),
                "und": "M2",
                "pk_ids": {"120367"},
                "items": {
                    "1.1": {
                        "item": "1.1",
                        "descripcion": "Preliminares item",
                        "cant_total": Decimal("300"),
                        "costo_directo": Decimal("3000"),
                        "und": "M2",
                        "vlr_unitario": Decimal("10"),
                    },
                },
            }
        },
    }
    out = build_estructura_tramo_response("TRAMO 7", ["120367", "120368"], cap_map, [])
    assert out["tramo"] == "TRAMO 7"
    assert [c["capitulo"] for c in out["capitulos"]] == ["1. CAP", "2. CAP"]
    ag1 = out["capitulos"][0]["agrupadores"][0]
    assert ag1["items"][0]["item"] == "1.1"
    assert ag1["items"][0]["cant_total"] == 300
    ag2 = out["capitulos"][1]["agrupadores"][0]
    assert ag2["codigo_wbs"] == "2.A"
    assert ag2["pk_ids"] == ["120367", "120368"]
    assert ag2["programacion"]["consistente"] is True


def test_expand_batch_genera_fila_por_pk_con_cantidad_propia():
    rows = [
        {"pk_id": "120367", "capitulo": "1. CAP", "item": "1.1", "cant_total": 100, "costo_directo": 1000, "und": "M2", "vlr_unitario": 10},
        {"pk_id": "120368", "capitulo": "1. CAP", "item": "1.1", "cant_total": 250, "costo_directo": 2500, "und": "M2", "vlr_unitario": 10},
    ]
    ag_by_item = {("1. CAP", "1.1"): 10}
    cap_map = _aggregate_ppto_rows_tramo(rows, ag_by_item, _agr_meta())
    metrics = _build_agrupador_pk_metrics(rows, ag_by_item, _agr_meta())
    by_pk = expand_tramo_batch_by_pk(
        [{
            "capitulo": "1. CAP",
            "item": "1.A",
            "codigo_wbs": "1.A",
            "agrupador_id": 10,
            "fecha_inicio": date(2026, 3, 1),
            "duracion_dias_habiles": 12,
        }],
        cap_map,
        metrics,
    )
    assert set(by_pk.keys()) == {"120367", "120368"}
    c367 = next(r for r in by_pk["120367"] if r["agrupador_id"] == 10)
    c368 = next(r for r in by_pk["120368"] if r["agrupador_id"] == 10)
    assert c367["cantidad_programada"] == 100
    assert c368["cantidad_programada"] == 250
    assert c367["fecha_inicio"] == "2026-03-01"
    assert c368["duracion_dias_habiles"] == 12
