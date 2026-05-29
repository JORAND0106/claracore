"""Filtro por ítem en SICOE: variantes y un solo patrón."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import _item_numero_filter_variants  # noqa: E402


def test_item_variants_sin_punto_final():
    assert _item_numero_filter_variants("1.02") == ["1.02", "1.02."]


def test_item_variants_con_punto_final():
    assert _item_numero_filter_variants("1.02.") == ["1.02.", "1.02"]


def test_item_variants_np():
    assert _item_numero_filter_variants("NP-344") == ["NP-344", "NP-344."]
