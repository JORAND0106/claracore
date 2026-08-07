"""Tests unitarios — pie de foto manual y repetición de gráficos por ítem."""
import pytest
from fastapi import HTTPException

from presupuesto_graficos_routes import (
    _items_keys_from_regs,
    _norm_pie_foto,
    _require_pie_foto,
    attach_graficos_a_items_export,
)


def test_require_pie_foto_obligatorio():
    assert _require_pie_foto("  Vista de cuneta en tramo 3  ") == "Vista de cuneta en tramo 3"
    with pytest.raises(HTTPException) as exc:
        _require_pie_foto("   ")
    assert exc.value.status_code == 422


def test_norm_pie_foto_colapsa_espacios():
    assert _norm_pie_foto("a   b\n c") == "a b c"
    assert _norm_pie_foto(None) == ""


def test_attach_graficos_repite_en_varios_items(monkeypatch):
    """Un mismo gráfico de un grupo multi-ítem se adjunta a cada ítem involucrado."""
    mapa = {
        "CAP1\x1e1.1": [
            {
                "url": "https://blob/g1.png",
                "caption": "Cuneta lateral tramo 3",
                "grupo_id": "g-1",
                "orden": 0,
                "tipos_entidad": ["Área", "Longitud"],
                "presupuesto_ids": [10, 11],
            }
        ],
        "CAP1\x1e1.2": [
            {
                "url": "https://blob/g1.png",
                "caption": "Cuneta lateral tramo 3",
                "grupo_id": "g-1",
                "orden": 0,
                "tipos_entidad": ["Nodo"],
                "presupuesto_ids": [20],
            }
        ],
    }

    def fake_mapa(_sb, _cid):
        return mapa

    monkeypatch.setattr(
        "presupuesto_graficos_routes._graficos_por_item_mapa",
        fake_mapa,
    )
    items = [
        {"capitulo": "CAP1", "item": "1.1", "registros": []},
        {"capitulo": "CAP1", "item": "1.2", "registros": []},
        {"capitulo": "CAP2", "item": "2.1", "registros": []},
    ]
    attach_graficos_a_items_export(None, 1, items)
    assert len(items[0]["graficos"]) == 1
    assert len(items[1]["graficos"]) == 1
    assert items[0]["graficos"][0]["url"] == items[1]["graficos"][0]["url"]
    assert items[0]["graficos"][0]["caption"] == "Cuneta lateral tramo 3"
    assert items[0]["graficos"][0]["tipos_entidad"] == ["Área", "Longitud"]
    assert items[0]["graficos"][0]["presupuesto_ids"] == [10, 11]
    assert items[1]["graficos"][0]["tipos_entidad"] == ["Nodo"]
    assert items[1]["graficos"][0]["presupuesto_ids"] == [20]
    assert "graficos" not in items[2]


def test_items_keys_from_regs_unicos():
    keys = _items_keys_from_regs(
        [
            {"capitulo": "A", "item": "1.1"},
            {"capitulo": "A", "item": "1.1"},
            {"capitulo": "A", "item": "1.2"},
            {"capitulo": "", "item": "x"},
        ]
    )
    assert keys == ["A · 1.1", "A · 1.2"]
