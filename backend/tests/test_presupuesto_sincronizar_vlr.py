"""Tests — sincronización vlr_unitario con listado de precios."""
from presupuesto_sincronizar_vlr import _norm_item_key


def test_norm_item_key_trailing_dots():
    assert _norm_item_key("4.22.") == "4.22"
    assert _norm_item_key("  1.01  ") == "1.01"
    assert _norm_item_key(None) == ""
    assert _norm_item_key("") == ""
