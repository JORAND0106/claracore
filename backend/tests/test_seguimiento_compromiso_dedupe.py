"""Deduplicación de asignados al crear compromisos (anti-doble fila)."""
from seguimiento_service import _dedupe_asignados_compromiso


def test_dedupe_asignados_por_usuario():
    raw = [
        {"asignado_a_id": 10, "asignado_a_nombre": "Ana"},
        {"asignado_a_id": 10, "asignado_a_nombre": "Ana (dup)"},
        {"asignado_a_id": 20, "asignado_a_nombre": "Luis"},
    ]
    out = _dedupe_asignados_compromiso(raw)
    assert len(out) == 2
    assert [x["asignado_a_id"] for x in out] == [10, 20]


def test_dedupe_asignados_por_externo_y_nombre():
    raw = [
        {"asignado_a_id": None, "asignado_externo_id": 5, "asignado_a_nombre": "Ext A"},
        {"asignado_externo_id": 5, "asignado_a_nombre": "Ext A dup"},
        {"asignado_a_nombre": "Solo Nombre"},
        {"asignado_a_nombre": "solo nombre"},
    ]
    out = _dedupe_asignados_compromiso(raw)
    assert len(out) == 2
    assert out[0]["asignado_externo_id"] == 5
    assert out[1]["asignado_a_nombre"] == "Solo Nombre"


def test_dedupe_ignora_entradas_vacias():
    assert _dedupe_asignados_compromiso([{}, None, "x"]) == []
