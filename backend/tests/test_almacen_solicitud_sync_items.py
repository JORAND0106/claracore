"""Upsert de ítems al actualizar solicitud (sin delete-all)."""
from __future__ import annotations

from unittest.mock import MagicMock

import almacen_service as svc


def test_sync_solicitud_items_update_insert_delete():
    store = {
        "items": [
            {"id": 10, "estado_validacion": "aprobado"},
            {"id": 11, "estado_validacion": "pendiente"},
        ],
    }
    ops = {"update": [], "insert": [], "delete": []}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self):
            self._mode = "select"
            self._payload = None
            self._eq_id = None
            self._in_ids = None

        def select(self, *_a, **_k):
            self._mode = "select"
            return self

        def eq(self, col, val):
            if col == "id":
                self._eq_id = int(val)
            return self

        def in_(self, col, vals):
            self._in_ids = [int(v) for v in vals]
            return self

        def update(self, payload):
            self._mode = "update"
            self._payload = dict(payload)
            return self

        def insert(self, rows):
            self._mode = "insert"
            self._payload = list(rows)
            return self

        def delete(self):
            self._mode = "delete"
            return self

        def execute(self):
            if self._mode == "select":
                return _Resp(list(store["items"]))
            if self._mode == "update":
                ops["update"].append({"id": self._eq_id, **self._payload})
                return _Resp([])
            if self._mode == "insert":
                ops["insert"].extend(self._payload)
                return _Resp(self._payload)
            if self._mode == "delete":
                ops["delete"].extend(self._in_ids or [])
                store["items"] = [r for r in store["items"] if int(r["id"]) not in set(self._in_ids or [])]
                return _Resp([])
            return _Resp([])

    class _Sb:
        def table(self, _name):
            return _Q()

    items = [
        {
            "id": 10, "cantidad": 2, "descripcion_solicitada": "Arena",
            "presupuesto_id": 1, "pk_id": "A", "material_descripcion": "Arena",
            "unidad": "M3", "es_principal": True,
        },
        {
            "cantidad": 1, "descripcion_solicitada": "Grava",
            "presupuesto_id": 1, "pk_id": "A", "material_descripcion": "Grava",
            "unidad": "M3", "es_principal": True,
        },
    ]
    svc._sync_solicitud_items(_Sb(), 99, "borrador", items)
    assert any(u.get("id") == 10 and u.get("numero_linea") == 1 for u in ops["update"])
    assert any(r.get("numero_linea") == 2 for r in ops["insert"])
    assert 11 in ops["delete"]


def test_sync_preserves_estado_validacion_on_update():
    store = {"items": [{"id": 5, "estado_validacion": "aprobado"}]}
    ops = {"update": []}

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self):
            self._mode = "select"
            self._payload = None
            self._eq_id = None

        def select(self, *_a, **_k):
            self._mode = "select"
            return self

        def eq(self, col, val):
            if col == "id":
                self._eq_id = int(val)
            return self

        def in_(self, *_a, **_k):
            return self

        def update(self, payload):
            self._mode = "update"
            self._payload = dict(payload)
            return self

        def insert(self, rows):
            self._mode = "insert"
            return self

        def delete(self):
            self._mode = "delete"
            return self

        def execute(self):
            if self._mode == "select":
                return _Resp(list(store["items"]))
            if self._mode == "update":
                ops["update"].append({"id": self._eq_id, **self._payload})
            return _Resp([])

    class _Sb:
        def table(self, _name):
            return _Q()

    items = [{
        "id": 5, "cantidad": 3, "descripcion_solicitada": "Cemento",
        "presupuesto_id": 1, "pk_id": "B", "material_descripcion": "Cemento",
        "unidad": "KG", "es_principal": True,
    }]
    svc._sync_solicitud_items(_Sb(), 1, "enviada", items)
    assert ops["update"][0]["estado_validacion"] == "aprobado"
