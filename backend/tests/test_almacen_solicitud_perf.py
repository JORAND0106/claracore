"""Optimizaciones de rendimiento — solicitudes de materiales."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import almacen_insumos_service as insumos
import almacen_service as svc


def test_listado_cache_evita_segunda_pasada(monkeypatch):
    insumos.clear_listado_cache()
    pages = [
        [{"capitulo": "1", "item_numero": "1.01", "precio_unitario": 100}],
    ]
    calls = {"n": 0}

    class _Q:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def range(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return MagicMock(data=pages[0])

    class _Sb:
        def table(self, _name):
            return _Q()

    monkeypatch.setattr(insumos, "_sb", lambda: _Sb())
    a = insumos.get_listado_precio_unitario(1, "1", "1.01")
    b = insumos.get_listado_precio_unitario(1, "1", "1.01")
    assert a == 100
    assert b == 100
    assert calls["n"] == 1  # una sola paginación gracias al TTL cache


def test_batch_cantidad_solicitada_una_query(monkeypatch):
    store_items = [
        {"cantidad": 3, "solicitud_id": 1, "pk_id": "A", "presupuesto_id": 10},
        {"cantidad": 2, "solicitud_id": 1, "pk_id": "B", "presupuesto_id": 10},
        {"cantidad": 5, "solicitud_id": 2, "pk_id": "A", "presupuesto_id": 11},
    ]
    store_sols = [
        {"id": 1, "estado": "enviada", "contrato_id": 7},
        {"id": 2, "estado": "rechazada", "contrato_id": 7},
    ]

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table
            self._in = None

        def select(self, *_a, **_k):
            return self

        def in_(self, col, vals):
            self._in = (col, list(vals))
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_solicitud_item":
                rows = [r for r in store_items if r["presupuesto_id"] in self._in[1]]
                return _Resp(rows)
            if self.table == "almacen_solicitud":
                rows = [r for r in store_sols if r["id"] in self._in[1]]
                return _Resp(rows)
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    totals = insumos.batch_cantidad_solicitada_acumulada(
        _Sb(), 7, [(10, "A"), (10, "B"), (11, "A")], exclude_solicitud_id=None
    )
    assert totals[(10, "A")] == 3
    assert totals[(10, "B")] == 2
    assert totals[(11, "A")] == 0  # solicitud rechazada


def test_insert_solicitud_items_batch_chunked():
    inserted = []

    class _Q:
        def insert(self, rows):
            inserted.append(list(rows))
            return self

        def execute(self):
            return MagicMock(data=inserted[-1])

    class _Sb:
        def table(self, _name):
            return _Q()

    rows = [{"solicitud_id": 1, "numero_linea": i} for i in range(1, 101)]
    svc._insert_solicitud_items_batch(_Sb(), rows, chunk_size=40)
    assert len(inserted) == 3
    assert len(inserted[0]) == 40
    assert len(inserted[2]) == 20
