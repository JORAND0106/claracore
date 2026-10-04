"""Dibujos de referencia: otros reportes con los mismos ítems."""
from unittest.mock import MagicMock

import main as m


def test_dibujo_referencias_sin_items(monkeypatch):
    monkeypatch.setattr(m, "_sicoe_items_de_reporte", lambda *_a, **_k: [])
    out = m._sicoe_dibujo_referencias_mismo_item(2, 10)
    assert out["reporte_id"] == 10
    assert out["items_propios"] == []
    assert out["referencias"] == []


def test_dibujo_referencias_encuentra_peers(monkeypatch):
    monkeypatch.setattr(m, "_sicoe_items_de_reporte", lambda *_a, **_k: ["1.1", "2.2"])

    calls = {"regs": 0, "all": 0, "reps": 0}

    class _Q:
        def __init__(self):
            self._cols = ""
            self._filtros = {}

        def select(self, cols):
            self._cols = cols
            return self

        def eq(self, k, v):
            self._filtros[k] = v
            return self

        def in_(self, k, ids):
            self._filtros[k] = list(ids)
            return self

        def execute(self):
            cols = self._cols
            if "costo_directo" in cols and "item_numero" in cols and "reporte_id" in cols:
                # Primera query: por ítems; segunda: por reporte_id peer
                if "item_numero" in self._filtros or (
                    isinstance(self._filtros.get("item_numero"), list)
                ):
                    calls["regs"] += 1
                    # peers 20 y 30 comparten 1.1; 10 es el propio
                    return MagicMock(
                        data=[
                            {"reporte_id": 10, "item_numero": "1.1", "costo_directo": 100},
                            {"reporte_id": 20, "item_numero": "1.1", "costo_directo": 50},
                            {"reporte_id": 30, "item_numero": "1.1", "costo_directo": 200},
                        ]
                    )
                calls["all"] += 1
                return MagicMock(
                    data=[
                        {"reporte_id": 20, "item_numero": "1.1", "costo_directo": 50},
                        {"reporte_id": 20, "item_numero": "9.9", "costo_directo": 25},
                        {"reporte_id": 30, "item_numero": "1.1", "costo_directo": 200},
                    ]
                )
            # so_reportes
            calls["reps"] += 1
            return MagicMock(
                data=[
                    {
                        "id": 20,
                        "numero_reporte": 7,
                        "dibujo_geojson": {
                            "type": "FeatureCollection",
                            "features": [
                                {
                                    "type": "Feature",
                                    "geometry": {"type": "Point", "coordinates": [0, 0]},
                                }
                            ],
                        },
                    },
                    {
                        "id": 30,
                        "numero_reporte": 8,
                        "dibujo_geojson": {"type": "FeatureCollection", "features": []},
                    },
                ]
            )

    def _table(name):
        return _Q()

    monkeypatch.setattr(m, "supabase", MagicMock(table=_table))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    monkeypatch.setattr(m, "_sicoe_chunks_int", lambda ids, _s: [list(ids)])

    out = m._sicoe_dibujo_referencias_mismo_item(2, 10)
    assert out["items_propios"] == ["1.1", "2.2"]
    # 30 sin features → no entra; 20 sí
    assert len(out["referencias"]) == 1
    ref = out["referencias"][0]
    assert ref["reporte_id"] == 20
    assert ref["numero_reporte"] == 7
    assert "1.1" in ref["items"]
    assert "9.9" in ref["items"]
    assert ref["costo_directo"] == 75.0
    assert ref["dibujo_geojson"]["type"] == "FeatureCollection"


def test_dibujo_referencias_omite_sin_dibujo(monkeypatch):
    monkeypatch.setattr(m, "_sicoe_items_de_reporte", lambda *_a, **_k: ["A"])

    class _Q:
        def select(self, cols):
            self._cols = cols
            return self

        def eq(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            if "costo_directo" in self._cols:
                return MagicMock(
                    data=[{"reporte_id": 5, "item_numero": "A", "costo_directo": 1}]
                )
            return MagicMock(
                data=[{"id": 5, "numero_reporte": 1, "dibujo_geojson": None}]
            )

    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    monkeypatch.setattr(m, "_sicoe_chunks_int", lambda ids, _s: [list(ids)])
    out = m._sicoe_dibujo_referencias_mismo_item(1, 99)
    assert out["referencias"] == []
