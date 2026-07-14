"""Reenvío de solicitudes rechazadas."""
from almacen_service import _solicitud_editable, enviar_solicitud


def test_solicitud_rechazada_es_editable():
    assert _solicitud_editable("rechazada") is True


def test_enviar_solicitud_rechazada(monkeypatch):
    updates = []
    item_updates = []

    class FakeTable:
        def __init__(self, name):
            self.name = name

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self.name == "almacen_solicitud":
                return type("R", (), {"data": [{
                    "id": 1,
                    "contrato_id": 10,
                    "consecutivo": 5,
                    "estado": "rechazada",
                    "motivo_rechazo": "Falta soporte",
                }]})()
            if self.name == "almacen_solicitud_item":
                return type("R", (), {"data": [{"id": 99}]})()
            return type("R", (), {"data": []})()

        def update(self, payload):
            updates.append((self.name, payload))
            return self

    class FakeSB:
        def table(self, name):
            return FakeTable(name)

    monkeypatch.setattr("almacen_service._sb", lambda: FakeSB())
    monkeypatch.setattr("almacen_service._now_iso", lambda: "2026-01-01T00:00:00+00:00")
    monkeypatch.setattr("almacen_service._notificar_validadores", lambda *_a, **_k: None)
    monkeypatch.setattr("almacen_service._enrich_solicitud_usuarios", lambda _sb, sol, **_k: sol)

    result = enviar_solicitud(10, 1, 7)

    assert result["estado"] == "enviada"
    assert result["motivo_rechazo"] is None
    sol_upd = next(p for n, p in updates if n == "almacen_solicitud")
    assert sol_upd["estado"] == "enviada"
    assert sol_upd["motivo_rechazo"] is None
    item_upd = next(p for n, p in updates if n == "almacen_solicitud_item")
    assert item_upd["estado_validacion"] == "pendiente"
