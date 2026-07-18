"""Tests desglose financiero ítems drill dashboard."""
import importlib
import pytest


def _m():
    return importlib.import_module("main")


def test_obra_ejecutada_drill_item_con_ppto_no_iguala_cobrado():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "item_vu": 506_000.0,
        "cant_nr": 0,
        "cant_p": 0,
        "cant_r": 0,
        "cant_a": 210.5,
        "cant_ppto": 210.5,
        "cant_cobrado": 195.81,
        "sicoe_item_vu": 500_000.0,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_cant"] == 210.5
    assert row["total_claracore_costo"] == round(210.5 * 506_000.0, 0)
    assert row["costo_cobrado"] == round(195.81 * 500_000.0, 0)
    assert row["delta_cant"] == round(210.5 - 195.81, 2)
    assert not row.get("claracore_igualado_cobro")


def test_obra_ejecutada_drill_item_solo_cobrado():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": False,
        "cant_nr": 0,
        "costo_nr": 0,
        "cant_p": 0,
        "costo_p": 0,
        "cant_r": 0,
        "costo_r": 0,
        "cant_a": 0,
        "costo_a": 0,
        "cant_cobrado": 12.5,
        "costo_cobrado": 1_500_000,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_costo"] == 1_500_000
    assert row["delta_costo"] == 0
    assert row["delta_cant"] == 0


def test_drill_item_costo_no_suma_buckets():
    from dashboard_costo_agregado import drill_item_costo_total

    vu = 35_162.0
    assert drill_item_costo_total(0.04, vu) == round(0.04 * vu, 0)
    assert drill_item_costo_total(0.04, vu, stored=1408) == round(0.04 * vu, 0)


def test_obra_ejecutada_drill_item_con_ppto_usa_presupuesto_si_total_claracore():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "item_vu": 35_162.0,
        "cant_nr": 0.01,
        "cant_p": 0.01,
        "cant_r": 0.01,
        "cant_a": 0.01,
        "total_claracore_costo": 1406,
        "cant_cobrado": 0.04,
        "sicoe_item_vu": 35_162.0,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_costo"] == 1406
    assert row["costo_cobrado"] == round(0.04 * 35_162.0, 0)
    assert row["delta_costo"] == 0


def test_obra_ejecutada_drill_item_con_ppto():
    m = _m()
    vu = 100.0
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "item_vu": vu,
        "cant_nr": 1,
        "cant_p": 2,
        "cant_r": 0,
        "cant_a": 3,
        "cant_cobrado": 4,
        "sicoe_item_vu": vu,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_costo"] == round(6 * vu, 0)
    assert row["costo_cobrado"] == round(4 * vu, 0)
    assert row["delta_costo"] == round(2 * vu, 0)
    assert row["delta_cant"] == 2


def test_obra_ejecutada_drill_item_pk_solo_cobrado_bajo_item_con_ppto():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": False,
        "cant_cobrado": 19.8,
        "costo_cobrado": 12_364_663,
    }
    m._apply_obra_ejecutada_drill_item(row, item_tiene_ppto=True)
    assert row["total_claracore_cant"] == 0
    assert row["total_claracore_costo"] == 0
    assert row["delta_cant"] == pytest.approx(-19.8, abs=0.01)
    assert not row.get("claracore_igualado_cobro")


def test_presupuesto_obra_drill_item_claracore_bolsa():
    m = _m()
    vu = 35.0
    row = {
        "item_vu": vu,
        "cant_nr": 5,
        "cant_a": 3,
        "cant_cobrado": 2,
        "sicoe_item_vu": vu,
    }
    m._apply_presupuesto_obra_drill_item(row)
    assert row["total_claracore_costo"] == round(8 * vu, 0)
    assert row["costo_cobrado"] == round(2 * vu, 0)
    assert row["delta_costo"] == round(6 * vu, 0)
