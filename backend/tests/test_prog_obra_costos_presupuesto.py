"""Tests — costos por versión de presupuesto en programación de obra."""
from unittest.mock import MagicMock, patch

from prog_obra_costos_presupuesto import (
    _aggregate_items_por_agrupador,
    _line_costo,
    apply_ppto_cost_overlay,
    resolve_ppto_vigente_version_id,
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
        "c": {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": 99,
            "label": "2.Z",
            "costo_programado": 5000.0,
        },
    }
    ag_costs = {("PK1", "02", 10): 7500000.0}
    item_costs = {("PK1", "02", "2.9"): 1000.0}
    out = apply_ppto_cost_overlay(nodes, ag_costs, item_costs)
    assert out["a"]["costo_programado"] == 7500000.0
    assert out["a"]["fecha_inicio"] == "2026-01-01"
    assert out["b"]["costo_programado"] == 1000.0
    assert out["c"]["costo_programado"] == 5000.0


def test_scale_monthly_to_target():
    from prog_obra_curva_s import _scale_monthly_to_target

    scaled, total = _scale_monthly_to_target({"2026-06": 100.0, "2026-07": 200.0}, 330.0)
    assert total == 330.0
    assert round(sum(scaled.values()), 2) == 330.0


def test_lookup_item_cost():
    from prog_obra_costos_presupuesto import _lookup_item_cost

    costs = {("PK1", "02", "2.1."): 1000.0}
    assert _lookup_item_cost(costs, "PK1", "02", "2.1") == 1000.0
    assert _lookup_item_cost(costs, "PK1", "02", "2.1.") == 1000.0


def test_build_brecha_presupuesto_sin_programacion():
    from prog_obra_costos_presupuesto import build_brecha_presupuesto_programacion

    ppto_rows = [
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.1",
            "descripcion": "Subbase",
            "cant_total": 1,
            "vlr_unitario": 1000,
            "costo_directo": 500_000,
        },
        {
            "pk_id": "PK1",
            "capitulo": "02",
            "item": "2.9",
            "descripcion": "Sin WBS",
            "cant_total": 1,
            "vlr_unitario": 1000,
            "costo_directo": 50_000,
        },
    ]
    ag_by = {("02", "2.1"): 10, ("02", "2.9"): None}
    ag_meta = {10: {"id": 10, "codigo_wbs": "2.A", "nombre": "Subbase"}}
    nodes = {}

    with patch("prog_obra_costos_presupuesto.fetch_ppto_items_version", return_value=ppto_rows), patch(
        "prog_obra_costos_presupuesto._listado_agrupador_por_item", return_value=(ag_by, {})
    ), patch("prog_obra_costos_presupuesto._fetch_agrupadores_meta", return_value=ag_meta), patch(
        "prog_obra_compare.fetch_compare_nodes", return_value=nodes
    ), patch(
        "prog_obra_costos_presupuesto.build_cost_overlay_maps",
        return_value=({("PK1", "02", 10): 500_000.0}, {("PK1", "02", "2.9"): 50_000.0}),
    ):
        out = build_brecha_presupuesto_programacion(MagicMock(), 1, "prog-v", "ppto-v")

    assert out["presupuesto_total"] == 550_000.0
    assert out["programado_total"] == 0.0
    assert out["diferencia"] == 550_000.0
    assert out["tiene_brecha"] is True
    assert out["resumen"]["n_agrupadores_sin_programar"] == 1
    assert out["resumen"]["n_items_sin_programar"] == 1


def test_apply_ppto_cost_overlay_strict():
    nodes = {
        "c": {
            "pk_id": "PK1",
            "capitulo": "02",
            "agrupador_id": 99,
            "costo_programado": 5000.0,
        },
    }
    out = apply_ppto_cost_overlay(nodes, {}, {}, strict=True)
    assert out["c"]["costo_programado"] == 0.0


class _FakeQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._data})()


class _FakeSb:
    def __init__(self, vigente_rows):
        self._vigente_rows = vigente_rows

    def table(self, name):
        if name == "presupuesto_versiones":
            return _FakeQuery(self._vigente_rows)
        return _FakeQuery([])


def test_resolve_ppto_vigente_force_vigente():
    sb = _FakeSb([{"id": "uuid-vigente-1"}])
    assert resolve_ppto_vigente_version_id(sb, 3, "uuid-sellada", force_vigente=True) == "uuid-vigente-1"


def test_resolve_ppto_vigente_respects_selector_when_not_forced():
    sb = _FakeSb([{"id": "uuid-vigente-1"}])
    assert resolve_ppto_vigente_version_id(sb, 3, "uuid-sellada", force_vigente=False) == "uuid-sellada"


def test_resolve_ppto_vigente_fallback_sin_vigente():
    sb = _FakeSb([])
    assert resolve_ppto_vigente_version_id(sb, 3, "uuid-sellada", force_vigente=True) == "uuid-sellada"
