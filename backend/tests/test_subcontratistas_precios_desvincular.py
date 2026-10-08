"""Tests puros — matching y bloqueo conceptual de desvinculación."""
from subcontratistas_precios_desvincular import _item_match


def test_item_match_por_item_y_capitulo():
    lp = {"item_numero": "1.01", "capitulo": "1. Excavación", "competencia": "A"}
    assert _item_match(
        {"item": "1.01", "capitulo": "1. Excavación", "competencia": "A"},
        lp,
    )
    assert not _item_match(
        {"item": "1.02", "capitulo": "1. Excavación", "competencia": "A"},
        lp,
    )
    assert not _item_match(
        {"item": "1.01", "capitulo": "2. Otro", "competencia": "A"},
        lp,
    )


def test_item_match_sin_competencia_en_listado():
    lp = {"item_numero": "2.05.", "capitulo": "2", "competencia": ""}
    assert _item_match(
        {"item": "2.05", "capitulo": "2", "competencia": "X"},
        lp,
    )
