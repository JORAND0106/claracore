"""Enrich de infraestructura/tramo desde pk_ids para grilla de presupuesto."""
from __future__ import annotations

from presupuesto_ubicacion import enrich_presupuesto_ubicacion_desde_pk_map


def test_enrich_infraestructura_desde_pk_ids():
    pk_ubic = {
        "PK-1": {"tramo": "TRAMO A", "calzada": "CALZADA 1", "infraestructura": "CICLORRUTA"},
        "PK-2": {"tramo": "TRAMO B", "calzada": "CALZADA 2", "infraestructura": "ANDEN"},
    }
    rows = [
        {"id": 1, "pk_id": "PK-1", "tramo": "TRAMO A", "no_inicio": "NODO X", "no_final": "NODO Y"},
        {"id": 2, "pk_id": "PK-2", "tramo": "", "infraestructura": "", "no_inicio": "A", "no_final": "B"},
        {"id": 3, "pk_id": "PK-MISSING", "tramo": "TRAMO C"},
    ]
    out = enrich_presupuesto_ubicacion_desde_pk_map(rows, pk_ubic)
    assert out[0]["infraestructura"] == "CICLORRUTA"
    assert out[0]["tramo"] == "TRAMO A"
    assert out[0]["no_inicio"] == "NODO X"
    assert out[1]["infraestructura"] == "ANDEN"
    assert out[1]["tramo"] == "TRAMO B"
    assert out[2].get("infraestructura", "") in ("", None)
    assert out[2]["tramo"] == "TRAMO C"


def test_enrich_no_pisa_infraestructura_existente():
    pk_ubic = {"PK-1": {"infraestructura": "DEL MAESTRO", "tramo": "T1"}}
    rows = [{"pk_id": "PK-1", "infraestructura": "YA TENIA", "tramo": "T0"}]
    out = enrich_presupuesto_ubicacion_desde_pk_map(rows, pk_ubic)
    assert out[0]["infraestructura"] == "YA TENIA"
    assert out[0]["tramo"] == "T0"
