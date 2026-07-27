"""Tareas personales deben persistir contrato_id del contrato activo."""
from __future__ import annotations

import seguimiento_service as svc


def test_crear_tarea_exige_y_guarda_contrato(monkeypatch):
    inserted = {}

    class FakeQ:
        def insert(self, row):
            inserted["row"] = row
            return self

        def execute(self):
            return type("R", (), {"data": [{**inserted["row"], "id": 77}]})()

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def not_(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

    class FakeSb:
        def table(self, name):
            assert name in ("seguimiento_item", "seguimiento_evento", "usuarios")
            return FakeQ()

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        "id": uid, "nombre": "Ana", "apellidos": "Pérez", "contrato_id": 12,
    })
    monkeypatch.setattr(svc, "_proximo_consecutivo_item", lambda *_a, **_k: 1)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **_k: None)

    row = svc.crear_tarea(FakeSb(), {"titulo": "Revisar plano", "contrato_id": 12}, user_id=3)
    assert row["id"] == 77
    assert inserted["row"]["contrato_id"] == 12
    assert inserted["row"]["origen"] == "tarea"


def test_crear_tarea_sin_contrato_falla(monkeypatch):
    monkeypatch.setattr(svc, "_usuario_row", lambda *_a, **_k: {"id": 3, "nombre": "Ana", "contrato_id": None})
    try:
        svc.crear_tarea(object(), {"titulo": "Sin contrato"}, user_id=3)
        assert False, "debía fallar"
    except ValueError as exc:
        assert "contrato_id" in str(exc).lower()
