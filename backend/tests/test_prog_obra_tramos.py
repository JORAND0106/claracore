"""Agrupación de tramos desde presupuesto poligonal."""
from prog_obra_service import group_tramos_from_presupuesto_rows


def test_group_tramos_deduplica_pk_y_ignora_vacios():
    rows = [
        {"pk_id": "120114", "tramo": "TRAMO 1"},
        {"pk_id": "120114", "tramo": "TRAMO 1"},
        {"pk_id": "120115", "tramo": "TRAMO 1"},
        {"pk_id": "120122", "tramo": ""},
        {"pk_id": "120123", "tramo": "TRAMO 2"},
    ]
    out = group_tramos_from_presupuesto_rows(rows)
    assert out == [
        {"tramo": "TRAMO 1", "pk_ids": ["120114", "120115"]},
        {"tramo": "TRAMO 2", "pk_ids": ["120123"]},
    ]


def test_group_tramos_orden_natural():
    rows = [
        {"pk_id": "120240", "tramo": "TRAMO 10"},
        {"pk_id": "120122", "tramo": "TRAMO 2"},
        {"pk_id": "120113", "tramo": "TRAMO 1"},
    ]
    out = group_tramos_from_presupuesto_rows(rows)
    assert [t["tramo"] for t in out] == ["TRAMO 1", "TRAMO 2", "TRAMO 10"]


def test_group_tramos_vacio():
    assert group_tramos_from_presupuesto_rows([]) == []
    assert group_tramos_from_presupuesto_rows([{"pk_id": "1", "tramo": None}]) == []
