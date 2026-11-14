"""Enriquecimiento tiene_dibujo en grilla SICOE."""
from unittest.mock import MagicMock

import main as m


def test_enriquecer_tiene_dibujo_desde_payload(monkeypatch):
    rows = [
        {
            "id": 1,
            "enlace_soporte": None,
            "dibujo_geojson": {
                "type": "FeatureCollection",
                "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}}],
            },
        },
        {"id": 2, "enlace_soporte": None, "dibujo_geojson": {"type": "FeatureCollection", "features": []}},
    ]

    class _Q:
        def select(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=[])

        @property
        def not_(self):
            return self

        def is_(self, *_a, **_k):
            return self

    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    m._sicoe_enriquecer_tiene_enlace_soporte(rows)
    assert rows[0]["tiene_dibujo"] is True
    assert rows[1]["tiene_dibujo"] is False


def test_enriquecer_tiene_dibujo_batch_probe_id(monkeypatch):
    """Probe liviano: select id + not null (sin descargar GeoJSON)."""
    rows = [
        {"id": 66, "enlace_soporte": None},
        {"id": 67, "enlace_soporte": None, "dibujo_geojson": None},
    ]
    selects = []

    class _Q:
        def select(self, cols):
            selects.append(cols)
            self._cols = cols
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            if getattr(self, "_cols", "") == "id" and getattr(self, "_null_col", None) == "dibujo_geojson":
                return MagicMock(data=[{"id": 66}])
            return MagicMock(data=[])

        @property
        def not_(self):
            return self

        def is_(self, col, *_a, **_k):
            self._null_col = col
            return self

    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())

    m._sicoe_enriquecer_tiene_enlace_soporte(rows)
    assert rows[0]["tiene_dibujo"] is True
    assert rows[1]["tiene_dibujo"] is False
    assert "id" in selects


def test_enriquecer_reconsulta_aunque_clave_dibujo_null(monkeypatch):
    """Antes se saltaba el batch si 'dibujo_geojson' in row aunque fuera null."""
    rows = [{"id": 10, "enlace_soporte": None, "dibujo_geojson": None}]

    class _Q:
        def select(self, cols):
            self._cols = cols
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            if getattr(self, "_cols", "") == "id" and getattr(self, "_null_col", None) == "dibujo_geojson":
                return MagicMock(data=[{"id": 10}])
            return MagicMock(data=[])

        @property
        def not_(self):
            return self

        def is_(self, col, *_a, **_k):
            self._null_col = col
            return self

    monkeypatch.setattr(m, "supabase", MagicMock(table=lambda _n: _Q()))
    monkeypatch.setattr(m, "supabase_execute", lambda fn: fn())
    m._sicoe_enriquecer_tiene_enlace_soporte(rows)
    assert rows[0]["tiene_dibujo"] is True
