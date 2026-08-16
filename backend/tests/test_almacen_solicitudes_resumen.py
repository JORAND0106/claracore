"""Tests de listado resumen de solicitudes (sin enriquecer ítems)."""

from __future__ import annotations

from almacen_service import _list_solicitudes_resumen


class _FakeResp:
    def __init__(self, data):
        self.data = data
        self.count = len(data) if data is not None else 0


class _FakeQuery:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self._filters = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters[col] = ("eq", val)
        return self

    def in_(self, col, vals):
        self._filters[col] = ("in", list(vals))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = list(self.store.get(self.table, []))
        for col, (op, val) in self._filters.items():
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "in":
                rows = [r for r in rows if r.get(col) in val]
        return _FakeResp(rows)


class _FakeSb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQuery(name, self.store)


def test_list_solicitudes_resumen_counts_and_oc(monkeypatch):
    store = {
        "almacen_solicitud_item": [
            {"id": 1, "solicitud_id": 10},
            {"id": 2, "solicitud_id": 10},
            {"id": 3, "solicitud_id": 11},
        ],
        "almacen_orden_compra": [
            {
                "id": 99,
                "solicitud_id": 11,
                "numero_oc": "OC-1",
                "estado": "emitida",
                "pdf_blob_path": "x.pdf",
                "pdf_nombre": "x.pdf",
                "created_at": None,
            },
        ],
        "usuarios": [
            {"id": 7, "nombre": "Ana", "apellido": "Pérez"},
        ],
    }
    # _map_usuario_nombres uses usuarios table with select - stub via monkeypatch
    import almacen_service as svc

    monkeypatch.setattr(svc, "_map_usuario_nombres", lambda sb, ids: {7: "Ana Pérez"})
    monkeypatch.setattr(svc, "_nombres_validadores_pendientes", lambda sb, cid: ["Validador X"])

    rows = [
        {
            "id": 10,
            "contrato_id": 1,
            "estado": "enviada",
            "created_by": 7,
            "validada_by": None,
            "consecutivo": 1,
            "titulo": "Sol A",
            "created_at": "2026-01-01",
        },
        {
            "id": 11,
            "contrato_id": 1,
            "estado": "borrador",
            "created_by": 7,
            "validada_by": None,
            "consecutivo": 2,
            "titulo": "Sol B",
            "created_at": "2026-01-02",
        },
    ]
    out = _list_solicitudes_resumen(_FakeSb(store), rows, contrato_id=1)
    assert len(out) == 2
    a, b = out
    assert a["items_count"] == 2
    assert a["items"] == []
    assert a["solicitante_nombre"] == "Ana Pérez"
    assert a["validadores_pendientes"] == ["Validador X"]
    assert a["tiene_orden_compra"] is False
    assert b["items_count"] == 1
    assert b["tiene_orden_compra"] is True
    assert b["orden_compra"]["numero_oc"] == "OC-1"
    assert b["estado"] == "aprobada"  # OC fuerza estado en resumen
