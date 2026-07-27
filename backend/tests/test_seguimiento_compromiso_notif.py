"""Notificación inmediata al asignar compromisos de acta."""
from __future__ import annotations

import seguimiento_service as svc


def test_fmt_fecha_notif():
    assert svc._fmt_fecha_notif("2026-08-15") == "15/08/2026"
    assert svc._fmt_fecha_notif(None) == "—"


def test_notificar_compromiso_asignado_inmediato_en_borrador(monkeypatch):
    """Se notifica al crear, sin depender del estado del acta."""
    calls = []

    def capture(_sb, **kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr(svc, "_notificar", capture)
    ok = svc._notificar_compromiso_asignado(
        None,
        destinatario_id=20,
        remitente_id=10,
        titulo="Entregar planos",
        fecha_vencimiento="2026-08-20",
        contrato_id=5,
        item_id=99,
        acta={"consecutivo": 7, "estado": "borrador"},
        reasignacion=False,
    )
    assert ok is True
    assert len(calls) == 1
    assert calls[0]["destinatario_id"] == 20
    assert "Nuevo compromiso" in calls[0]["asunto"]
    assert "Acta Nº 7" in calls[0]["asunto"]
    assert "20/08/2026" in calls[0]["mensaje"]
    assert calls[0]["enviar_push"] is True
    assert calls[0]["entidad_tipo"] == "seguimiento_compromiso"


def test_notificar_compromiso_reasignacion(monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "_notificar", lambda _sb, **k: calls.append(k) or True)
    svc._notificar_compromiso_asignado(
        None,
        destinatario_id=30,
        remitente_id=10,
        titulo="Revisar obra",
        fecha_vencimiento="2026-09-01",
        contrato_id=1,
        item_id=5,
        acta={"consecutivo": 2, "estado": "borrador"},
        reasignacion=True,
    )
    assert "reasignado" in calls[0]["asunto"].lower()
    assert "reasign" in (calls[0].get("push_slot_key") or "")


def test_crear_un_compromiso_dispara_notif(monkeypatch):
    inserted = []
    notifs = []

    class FakeQ:
        def __init__(self, name):
            self.name = name
            self._payload = None

        def select(self, *_a, **_k):
            return self

        def insert(self, payload):
            self._payload = payload
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self.name == "seguimiento_item" and self._payload:
                row = {**self._payload, "id": 501}
                inserted.append(row)
                return type("R", (), {"data": [row]})()
            return type("R", (), {"data": []})()

    class FakeSb:
        def table(self, name):
            return FakeQ(name)

    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {
        "id": 1, "consecutivo": 3, "estado": "borrador",
        "ideas": [{"id": 9, "texto": "Idea"}],
    })
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        "id": uid, "nombre": f"U{uid}", "apellidos": "",
    })
    monkeypatch.setattr(svc, "_proximo_consecutivo_item", lambda *_a, **_k: 1)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(
        svc, "calcular_fecha_limite_gracia",
        lambda *_a, **_k: __import__("datetime").datetime(2026, 8, 25, tzinfo=__import__("datetime").timezone.utc),
    )
    monkeypatch.setattr(svc, "CalendarioNoHabilesCache", lambda **_k: object())
    monkeypatch.setattr(svc, "make_calendar_loader", lambda _sb: None)
    monkeypatch.setattr(
        svc, "_notificar_compromiso_asignado",
        lambda *_a, **k: notifs.append(k) or True,
    )

    row = svc._crear_un_compromiso(
        FakeSb(), 5, 1, 9,
        {
            "asignado_a_id": 20,
            "asignado_a_nombre": "Ana",
            "solicitante_id": 10,
            "redaccion": "Entregar informe",
            "fecha_vencimiento": "2026-08-20",
        },
        user_id=10,
    )
    assert row["id"] == 501
    assert len(notifs) == 1
    assert notifs[0]["destinatario_id"] == 20
    assert notifs[0]["reasignacion"] is False
    assert notifs[0]["acta"]["estado"] == "borrador"


def test_notificar_no_auto_si_mismo():
    class FakeSb:
        def table(self, *_a, **_k):
            raise AssertionError("no debe insertar")

    assert svc._notificar(
        FakeSb(),
        destinatario_id=5,
        remitente_id=5,
        asunto="x",
        mensaje="y",
        contrato_id=1,
        entidad_tipo="t",
        entidad_id="1",
    ) is False
