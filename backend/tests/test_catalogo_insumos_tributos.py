"""Normalización de tributos AIU/IVA del catálogo de insumos."""

from __future__ import annotations

from almacen_insumos_service import normalize_tributos, _tributos_etiqueta
from catalogo_insumos_service import (
    CSV_TEMPLATE,
    _csv_build_tributos,
    _csv_entrada_a_puntos_pct,
    get_csv_template,
)


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


def test_csv_entrada_decimal_o_puntos():
    assert _csv_entrada_a_puntos_pct("0.05") == 5.0
    assert _csv_entrada_a_puntos_pct("5") == 5.0
    assert _csv_entrada_a_puntos_pct("19%") == 19.0
    assert _csv_entrada_a_puntos_pct("") is None


def test_csv_build_tributos():
    vals = {
        "aiu_a": "0.05",
        "aiu_i": "0.03",
        "aiu_u": "0.05",
        "aiu_iva_util": "0.19",
        "iva_porcentaje": "0.19",
        "iva_sobre": "costo_base",
    }
    t = _csv_build_tributos(lambda k: vals.get(k, ""))
    assert t["aiu"]["administracion"] == 5.0
    assert t["aiu"]["imprevistos"] == 3.0
    assert t["aiu"]["utilidad"] == 5.0
    assert t["aiu"]["iva_utilidad"] == 19.0
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "costo_base"


def test_csv_template_incluye_aiu_iva():
    tpl = get_csv_template()
    assert "aiu_a" in tpl
    assert "aiu_i" in tpl
    assert "aiu_u" in tpl
    assert "aiu_iva_util" in tpl
    assert "iva_porcentaje" in tpl
    assert "iva_sobre" in tpl
    assert "0.05,0.03,0.05,0.19" in tpl
    assert CSV_TEMPLATE == tpl
