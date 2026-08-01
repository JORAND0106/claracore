"""Compromisos libres (sin idea_id) desde el acta."""
from __future__ import annotations

import seguimiento_service as svc


class _Resp:
    def __init__(self, data=None):
        self.data = data


class _FakeQ:
    def __init__(self, store, table):
        self._store = store
        self._table = table
        self._filters = []
        self._payload = None
        self._op = "select"
        self._limit = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        if self._table == "seguimiento_acta" and self._op == "select":
            acta = {
                "id": 10,
                "contrato_id": 1,
                "consecutivo": 3,
                "estado": "borrador",
                "elaborador_id": 99,
                "ideas": [],
                "asistentes": [],
            }
            return _Resp([acta])
        if self._table == "seguimiento_item" and self._op == "insert":
            row = {**(self._payload or {}), "id": 501}
            self._store["inserted"] = row
            return _Resp([row])
        if self._table == "usuarios" and self._op == "select":
            return _Resp([{
                "id": 7,
                "nombre": "Ana",
                "apellidos": "Lopez",
                "email": "ana@x.com",
            }])
        return _Resp([])


class _FakeSB:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _FakeQ(self.store, name)


def test_crear_compromiso_libre_sin_idea(monkeypatch):
    sb = _FakeSB()
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {
        "id": 10,
        "contrato_id": 1,
        "consecutivo": 3,
        "estado": "borrador",
        "elaborador_id": 99,
        "ideas": [],
    })
    monkeypatch.setattr(svc, "_assert_puede_editar_acta", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_usuario_row", lambda *_a, **_k: {
        "id": 7, "nombre": "Ana", "apellidos": "Lopez", "email": "a@x.com",
    })
    monkeypatch.setattr(svc, "_nombre_usuario", lambda u: "Ana Lopez")
    monkeypatch.setattr(svc, "_proximo_consecutivo_item", lambda *_a, **_k: 12)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_notificar_compromiso_asignado", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    monkeypatch.setattr(
        "seguimiento_service.calcular_fecha_limite_gracia",
        lambda *_a, **_k: __import__("datetime").datetime(2026, 8, 10, tzinfo=__import__("datetime").timezone.utc),
    )
    monkeypatch.setattr(
        "seguimiento_service.CalendarioNoHabilesCache",
        lambda **k: object(),
    )
    monkeypatch.setattr("seguimiento_service.make_calendar_loader", lambda sb: (lambda: []))

    out = svc.crear_compromiso_libre(
        sb,
        1,
        10,
        {
            "asignado_a_id": 7,
            "fecha_vencimiento": "2026-08-05",
            "redaccion": "Entregar planos revisados",
        },
        user_id=99,
    )
    assert out["id"] == 501
    assert sb.store["inserted"]["idea_id"] is None
    assert sb.store["inserted"]["acta_id"] == 10
    assert "planos" in sb.store["inserted"]["titulo"].lower() or "planos" in sb.store["inserted"]["descripcion"].lower()
