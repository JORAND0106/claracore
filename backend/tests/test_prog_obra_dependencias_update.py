"""Actualización inline de dependencias CPM."""
from __future__ import annotations

import pytest

from prog_obra_service import BusinessRuleError, actualizar_dependencia


class _FakeQuery:
    def __init__(self, sb, table: str):
        self._sb = sb
        self._table = table
        self._filters = {}
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, data):
        self._sb._pending_update = (self._table, self._filters.copy(), data)
        return self

    def execute(self):
        if self._sb._pending_update:
            table, filt, data = self._sb._pending_update
            self._sb._pending_update = None
            rows = self._sb._tables.get(table, [])
            out = []
            for row in rows:
                if all(row.get(k) == v for k, v in filt.items()):
                    row.update(data)
                    out.append(dict(row))
            return type("R", (), {"data": out})()
        table = self._table
        rows = self._sb._tables.get(table, [])
        for row in rows:
            if all(row.get(k) == v for k, v in self._filters.items()):
                return type("R", (), {"data": [dict(row)]})()
        return type("R", (), {"data": []})()


class _FakeSb:
    def __init__(self, deps, version_id="v1"):
        self._tables = {
            "prog_dependencias": deps,
            "prog_versiones": [{"id": version_id, "cpm_dirty": False}],
        }
        self._pending_update = None
        self.version_dirty = False

    def table(self, name):
        return _FakeQuery(self, name)


def test_actualizar_dependencia_tipo_y_lag():
    deps = [{
        "id": "d1",
        "version_id": "v1",
        "tipo": "FS",
        "lag_dias": 0,
        "pk_id_origen": "PK1",
        "capitulo_origen": "01",
        "pk_id_destino": "PK1",
        "capitulo_destino": "02",
    }]
    sb = _FakeSb(deps)
    row = actualizar_dependencia(sb, "d1", "v1", tipo="SS", lag_dias=3)
    assert row["tipo"] == "SS"
    assert row["lag_dias"] == 3
    assert sb._tables["prog_versiones"][0]["cpm_dirty"] is True


def test_actualizar_dependencia_tipo_invalido():
    sb = _FakeSb([{"id": "d1", "version_id": "v1", "tipo": "FS", "lag_dias": 0}])
    with pytest.raises(BusinessRuleError):
        actualizar_dependencia(sb, "d1", "v1", tipo="XX")
