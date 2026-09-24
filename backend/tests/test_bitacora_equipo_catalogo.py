"""Tests soft-delete del catálogo de equipos Bitácora."""
from __future__ import annotations

from types import SimpleNamespace


class _FakeQuery:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._update = None
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, payload):
        self._update = dict(payload)
        return self

    def execute(self):
        rows = list(self._store.get(self._table, []))
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val]
        if self._update is not None:
            for r in rows:
                r.update(self._update)
            return SimpleNamespace(data=list(rows))
        if self._limit is not None:
            rows = rows[: self._limit]
        return SimpleNamespace(data=list(rows))


class FakeSb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQuery(self.store, name)


def test_desactivar_equipo_soft_delete():
    from bitacora_service import desactivar_equipo

    store = {
        "seguimiento_bitacora_equipo": [
            {
                "id": 7,
                "contrato_id": 3,
                "nombre": "Retro fantasma",
                "nombre_norm": "retro fantasma",
                "tipo": "equipo",
                "activo": True,
            },
            {
                "id": 8,
                "contrato_id": 3,
                "nombre": "Volqueta real",
                "nombre_norm": "volqueta real",
                "tipo": "volqueta",
                "activo": True,
            },
        ],
    }
    out = desactivar_equipo(FakeSb(store), 3, 7)
    assert out["activo"] is False
    assert store["seguimiento_bitacora_equipo"][0]["activo"] is False
    assert store["seguimiento_bitacora_equipo"][1]["activo"] is True


def test_desactivar_equipo_idempotente_y_otro_contrato():
    from bitacora_service import desactivar_equipo
    import pytest

    store = {
        "seguimiento_bitacora_equipo": [
            {
                "id": 1,
                "contrato_id": 3,
                "nombre": "X",
                "nombre_norm": "x",
                "tipo": "equipo",
                "activo": False,
            },
        ],
    }
    again = desactivar_equipo(FakeSb(store), 3, 1)
    assert again["activo"] is False

    with pytest.raises(ValueError, match="no encontrado"):
        desactivar_equipo(FakeSb(store), 99, 1)


def test_list_equipos_omite_inactivos():
    from bitacora_service import list_equipos

    class ListQuery:
        def __init__(self, rows):
            self._rows = rows

        def select(self, *_a, **_k):
            return self

        def eq(self, col, val):
            self._rows = [r for r in self._rows if r.get(col) == val]
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            return SimpleNamespace(data=list(self._rows))

    class Sb:
        def table(self, name):
            assert name == "seguimiento_bitacora_equipo"
            return ListQuery([
                {"id": 1, "contrato_id": 3, "nombre": "Activa", "nombre_norm": "activa", "activo": True},
                {"id": 2, "contrato_id": 3, "nombre": "Baja", "nombre_norm": "baja", "activo": False},
            ])

    rows = list_equipos(Sb(), 3)
    assert len(rows) == 1
    assert rows[0]["nombre"] == "Activa"


def test_route_delete_equipo_solo_desarrollador_en_fuente():
    from pathlib import Path

    src = Path(__file__).resolve().parents[1] / "seguimiento_routes.py"
    text = src.read_text(encoding="utf-8")
    assert "route_delete_bitacora_equipo" in text
    assert "desactivar_equipo" in text
    assert "Solo el cargo Desarrollador puede eliminar del catálogo de Maquinaria" in text
