"""Tests — costos por versión de presupuesto en programación de obra."""
from prog_obra_costos_presupuesto import (
    _aggregate_items_por_agrupador,
    _line_costo,
    apply_ppto_cost_overlay,
    version_ppto_es_aprobada,
    version_ppto_ui_estado,
)


def test_line_costo_desde_campo():
    assert _line_costo({"costo_directo": 1000, "cant_total": 10, "vlr_unitario": 50}) == 1000.0


def test_line_costo_desde_cantidad():
    assert _line_costo({"costo_directo": 0, "cant_total": 10, "vlr_unitario": 45000}) == 450000.0


def test_version_ppto_ui_estado():
    assert version_ppto_ui_estado({"es_vigente_aprobada": True}) == "vigente"
    assert version_ppto_ui_estado({"sellado": True, "es_vigente_aprobada": False}) == "aprobado"
    assert version_ppto_ui_estado({"estado": "borrador"}) == "borrador"


def test_version_ppto_es_aprobada():
    assert version_ppto_es_aprobada({"es_vigente_aprobada": True}) is True
    assert version_ppto_es_aprobada({"sellado": True}) is True
    assert version_ppto_es_aprobada({"estado": "borrador"}) is False


def test_aggregate_items_por_agrupador():
    rows = [
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.1",
            "descripcion": "Subbase",
            "cant_total": 100,
            "vlr_unitario": 45000,
            "costo_directo": 4500000,
        },
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.2",
            "descripcion": "Base",
            "cant_total": 50,
            "vlr_unitario": 60000,
            "costo_directo": 3000000,
        },
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.9",
            "descripcion": "Sin WBS",
            "cant_total": 1,
            "vlr_unitario": 1000,
            "costo_directo": 1000,
        },
    ]
    ag_by_item = {("02", "2.1"): 10, ("02", "2.2"): 10, ("02", "2.9"): None}
    ag_buckets, item_map, sin_ag = _aggregate_items_por_agrupador(rows, ag_by_item, {})
    assert len(ag_buckets) == 1
    key = ("PK1", "02", 10)
    assert ag_buckets[key]["costo_directo"] == 7500000.0
    assert len(ag_buckets[key]["items"]) == 2
    assert len(sin_ag) == 1
    assert sin_ag[0]["item"] == "2.9"
    assert item_map[("PK1", "02", "2.1")]["subtotal"] == 4500000.0


def test_apply_ppto_cost_overlay():
    nodes = {
        "a": {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": 10,
            "label": "2.A",
            "costo_programado": 1.0,
            "fecha_inicio": "2026-01-01",
        },
        "b": {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": None,
            "label": "2.9",
            "costo_programado": 2.0,
        },
    }
    ag_costs = {("PK1", "02", 10): 7500000.0}
    item_costs = {("PK1", "02", "2.9"): 1000.0}
    out = apply_ppto_cost_overlay(nodes, ag_costs, item_costs)
    assert out["a"]["costo_programado"] == 7500000.0
    assert out["a"]["fecha_inicio"] == "2026-01-01"
    assert out["b"]["costo_programado"] == 1000.0
