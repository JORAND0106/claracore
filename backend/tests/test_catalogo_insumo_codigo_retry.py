"""Regresión: insert de insumo reintenta código ante UNIQUE 23505."""
from __future__ import annotations

from unittest.mock import MagicMock

import catalogo_insumos_service as cat


def test_is_duplicate_codigo_error():
    assert cat._is_duplicate_codigo_error(
        Exception("duplicate key value violates unique constraint \"idx_almacen_insumo_codigo_activo_uq\" code 23505")
    )
    assert not cat._is_duplicate_codigo_error(Exception("other error"))


def test_insert_insumo_reintenta_codigo(monkeypatch):
    calls = {"n": 0, "codigos": []}

    def fake_next(cid):
        calls["n"] += 1
        return f"CC-1614-{calls['n']:03d}"

    monkeypatch.setattr(cat, "next_codigo_insumo", fake_next)
    monkeypatch.setattr(cat, "_asegurar_codigo_disponible", lambda *a, **k: None)

    class _Q:
        def insert(self, row):
            calls["codigos"].append(row.get("codigo"))
            self._row = row
            return self

        def execute(self):
            if self._row.get("codigo") == "CC-1614-001":
                raise Exception(
                    "duplicate key value violates unique constraint "
                    "\"idx_almacen_insumo_codigo_activo_uq\" {'code': '23505'}"
                )
            return MagicMock(data=[{"id": 99, **self._row}])

    class _Sb:
        def table(self, _name):
            return _Q()

    payload = {"descripcion": "x", "contrato_id": 3, "_auto_codigo": True, "codigo": ""}
    row = cat._insert_insumo_con_codigo_seguro(_Sb(), 3, payload)
    assert row["id"] == 99
    assert row["codigo"] == "CC-1614-002"
    assert calls["codigos"] == ["CC-1614-001", "CC-1614-002"]
