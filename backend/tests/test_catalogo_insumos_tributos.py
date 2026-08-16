"""Normalización de tributos unificados (Tipo | A | Í | U | IVA) del catálogo."""

from __future__ import annotations

from almacen_insumos_service import normalize_tributos, _tributos_etiqueta
from catalogo_insumos_service import (
    CSV_TEMPLATE,
    _csv_build_tributos,
    _csv_entrada_a_puntos_pct,
    get_csv_template,
)


def test_normalize_solo_iva_es_pleno():
    t = normalize_tributos({"iva": {"porcentaje": 19}})
    assert t["tipo"] == "iva_pleno"
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "costo_base"
    assert t["aiu"]["iva_utilidad"] is None


def test_normalize_aiu_mas_iva_es_sobre_utilidad():
    t = normalize_tributos({
        "administracion": 5,
        "imprevistos": 3,
        "utilidad": 5,
        "iva": 19,
    })
    assert t["tipo"] == "iva_sobre_utilidad"
    assert t["aiu"]["administracion"] == 5.0
    assert t["aiu"]["imprevistos"] == 3.0
    assert t["aiu"]["utilidad"] == 5.0
    assert t["aiu"]["iva_utilidad"] == 19.0
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "utilidad"


def test_normalize_solo_aiu_sin_iva():
    t = normalize_tributos({
        "aiu": {"administracion": 5, "imprevistos": 3, "utilidad": 5},
    })
    assert t["tipo"] == "aiu_sin_iva"
    assert t["iva"]["porcentaje"] is None


def test_normalize_ignora_sobre_manual_si_contradice():
    """Aunque el payload diga sobre=costo_base, con A/I/U+IVA se fuerza utilidad."""
    t = normalize_tributos({
        "aiu": {"administracion": 5, "imprevistos": None, "utilidad": 4},
        "iva": {"porcentaje": 19, "sobre": "costo_base"},
    })
    assert t["tipo"] == "iva_sobre_utilidad"
    assert t["iva"]["sobre"] == "utilidad"


def test_tributos_etiqueta_incluye_tipo():
    et = _tributos_etiqueta({
        "aiu": {"administracion": 5, "imprevistos": None, "utilidad": 4},
        "iva": {"porcentaje": 19},
    })
    assert et is not None
    assert "IVA sobre Utilidad" in et
    assert "IVA 19%" in et

    et2 = _tributos_etiqueta({"iva": {"porcentaje": 19}})
    assert "IVA Pleno" in et2


def test_csv_entrada_decimal_o_puntos():
    assert _csv_entrada_a_puntos_pct("0.05") == 5.0
    assert _csv_entrada_a_puntos_pct("5") == 5.0
    assert _csv_entrada_a_puntos_pct("19%") == 19.0
    assert _csv_entrada_a_puntos_pct("") is None


def test_csv_build_tributos_sobre_utilidad():
    vals = {
        "aiu_a": "0.05",
        "aiu_i": "0.03",
        "aiu_u": "0.05",
        "iva": "0.19",
    }
    t = _csv_build_tributos(lambda k: vals.get(k, ""))
    assert t["tipo"] == "iva_sobre_utilidad"
    assert t["aiu"]["administracion"] == 5.0
    assert t["aiu"]["imprevistos"] == 3.0
    assert t["aiu"]["utilidad"] == 5.0
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "utilidad"


def test_csv_build_tributos_iva_pleno():
    vals = {"aiu_a": "", "aiu_i": "", "aiu_u": "", "iva": "0.19"}
    t = _csv_build_tributos(lambda k: vals.get(k, ""))
    assert t["tipo"] == "iva_pleno"
    assert t["iva"]["porcentaje"] == 19.0
    assert t["iva"]["sobre"] == "costo_base"


def test_csv_template_unificado():
    tpl = get_csv_template()
    assert ",a,i,u,iva," in tpl or "a,i,u,iva" in tpl
    assert "aiu_iva_util" not in tpl
    assert "iva_sobre" not in tpl
    assert "0.05,0.03,0.05,0.19" in tpl
    assert ",,,0.19," in tpl  # fila ejemplo IVA pleno
    assert CSV_TEMPLATE == tpl
