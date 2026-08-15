"""Normalización de tributos AIU/IVA del catálogo de insumos."""

from __future__ import annotations

from almacen_insumos_service import normalize_tributos, _tributos_etiqueta


def test_normalize_tributos_independientes():
    t = normalize_tributos({
        "aiu": {"administracion": "5", "imprevistos": 3, "utilidad": 5, "iva_utilidad": 19},
        "iva": {"porcentaje": "19", "sobre": "utilidad"},
    })
    assert t["aiu"]["administracion"] == 5.0
    assert t["aiu"]["imprevistos"] == 3.0
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "utilidad"


def test_normalize_tributos_sobre_invalido():
    t = normalize_tributos({"iva": {"porcentaje": 19, "sobre": "xyz"}})
    assert t["iva"]["sobre"] == "costo_base"


def test_tributos_etiqueta():
    et = _tributos_etiqueta({
        "aiu": {"administracion": 5, "imprevistos": None, "utilidad": 4, "iva_utilidad": 19},
        "iva": {"porcentaje": 19, "sobre": "costo_base"},
    })
    assert et is not None
    assert "AIU" in et
    assert "IVA 19%" in et
