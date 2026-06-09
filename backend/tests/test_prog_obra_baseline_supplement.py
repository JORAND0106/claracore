"""Baseline Curva S: agrupadores V0 sin programación (2.E)."""
from datetime import date

from prog_obra_compare import _node_key, supplement_nodes_missing_presupuesto


def test_supplement_adds_missing_agrupador_with_chapter_envelope():
    nodes = {
        "a": {
            "pk_id": "PK1",
            "capitulo": "2. CAP",
            "agrupador_id": 15,
            "label": "2.B",
            "fecha_inicio": date(2026, 6, 1),
            "fecha_fin": date(2026, 7, 15),
            "costo_programado": 100.0,
        },
    }
    ag_costs = {
        ("PK1", "2. CAP", 15): 100.0,
        ("PK1", "2. CAP", 25): 500.0,
    }
    ag_meta = {25: {"codigo_wbs": "2.E", "nombre": "Riego asfaltico"}}
    out = supplement_nodes_missing_presupuesto(nodes, ag_costs, ag_meta)
    assert len(out) == 2
    nk = _node_key("PK1", "2. CAP", agrupador_id=25)
    assert nk in out
    assert out[nk]["costo_programado"] == 500.0
    assert out[nk]["fecha_inicio"] == date(2026, 6, 1)
    assert out[nk]["fecha_fin"] == date(2026, 7, 15)
    assert out[nk]["label"] == "2.E"
