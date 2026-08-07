"""Tests unitarios — pie de foto y repetición de gráficos por ítem."""
from presupuesto_graficos_routes import (
    _items_keys_from_regs,
    attach_graficos_a_items_export,
    build_caption_pie_foto,
)


def test_build_caption_valores_distintos():
    regs = [
        {
            "tramo": "3",
            "infraestructura": "Cuneta",
            "abs_inicio": "2+900",
            "abs_final": "3+100",
            "id_pol": "64211",
        },
        {
            "tramo": "4",
            "infraestructura": "Cuneta",
            "abs_inicio": "2+900",
            "abs_final": "3+100",
            "id_pol": "64212",
        },
        {
            "tramo": "5",
            "infraestructura": "Box Culvert",
            "abs_inicio": "3+500",
            "abs_final": "4+100",
            "id_pol": "64213",
        },
    ]
    cap = build_caption_pie_foto(regs)
    assert "Tramo: 3, 4, 5" in cap
    assert "Infraestructura: Cuneta, Box Culvert" in cap
    assert "Abs: 2+900-3+100, 3+500-4+100" in cap
    assert "Id_Pol: 64211, 64212, 64213" in cap
    assert " · " in cap


def test_build_caption_vacio():
    assert build_caption_pie_foto([]) == "—"
    assert build_caption_pie_foto([{"tramo": "", "id_pol": None}]) == "—"


def test_attach_graficos_repite_en_varios_items(monkeypatch):
    """Un mismo gráfico de un grupo multi-ítem se adjunta a cada ítem involucrado."""
    mapa = {
        "CAP1\x1e1.1": [
            {
                "url": "https://blob/g1.png",
                "caption": "Tramo: 3",
                "grupo_id": "g-1",
                "orden": 0,
                "tipos_entidad": ["Área", "Longitud"],
            }
        ],
        "CAP1\x1e1.2": [
            {
                "url": "https://blob/g1.png",
                "caption": "Tramo: 3",
                "grupo_id": "g-1",
                "orden": 0,
                "tipos_entidad": ["Nodo"],
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
    assert items[0]["graficos"][0]["tipos_entidad"] == ["Área", "Longitud"]
    assert items[1]["graficos"][0]["tipos_entidad"] == ["Nodo"]
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
