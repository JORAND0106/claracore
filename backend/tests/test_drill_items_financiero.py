"""Tests desglose financiero ítems drill dashboard."""
import importlib
import pytest


def _m():
    return importlib.import_module("main")


def test_obra_ejecutada_drill_item_con_ppto_no_iguala_cobrado():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "cant_nr": 0,
        "costo_nr": 0,
        "cant_p": 0,
        "costo_p": 0,
        "cant_r": 0,
        "costo_r": 0,
        "cant_a": 210.5,
        "costo_a": 106_717_045,
        "cant_ppto": 210.5,
        "cant_cobrado": 195.81,
        "costo_cobrado": 98_000_000,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_cant"] == 210.5
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


def test_obra_ejecutada_drill_item_con_ppto():
    m = _m()
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "cant_nr": 1,
        "costo_nr": 100,
        "cant_p": 2,
        "costo_p": 200,
        "cant_r": 0,
        "costo_r": 0,
        "cant_a": 3,
        "costo_a": 300,
        "cant_cobrado": 4,
        "costo_cobrado": 500,
    }
    m._apply_obra_ejecutada_drill_item(row)
    assert row["total_claracore_costo"] == 600
    assert row["delta_costo"] == 100
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
    row = {
        "cant_nr": 5,
        "costo_nr": 50,
        "cant_p": 9,
        "costo_p": 900,
        "cant_a": 3,
        "costo_a": 300,
        "cant_cobrado": 2,
        "costo_cobrado": 200,
    }
    m._apply_presupuesto_obra_drill_item(row)
    assert row["total_claracore_costo"] == 350  # A + NR only
    assert row["delta_costo"] == 150
