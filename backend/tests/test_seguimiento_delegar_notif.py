"""Delegación: visibilidad en bandeja y notificación al delegante al cumplir."""
from __future__ import annotations

import seguimiento_service as svc


def test_es_tarea_delegada_asignacion():
    assert svc._es_tarea_delegada_asignacion({
        "origen": "tarea",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
    })
    # Personal
    assert not svc._es_tarea_delegada_asignacion({
        "origen": "tarea",
        "relacion_destinatario": None,
        "created_by": 10,
        "asignado_a_id": 10,
    })
    # Solo referencia (fuera de alcance de esta alerta)
    assert not svc._es_tarea_delegada_asignacion({
        "origen": "tarea",
        "relacion_destinatario": "referencia",
        "created_by": 10,
        "asignado_a_id": 10,
        "referido_a_id": 20,
    })
    # Compromiso de acta
    assert not svc._es_tarea_delegada_asignacion({
        "origen": "compromiso",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
    })


def test_notificar_delegante_solo_transicion_a_cumplido(monkeypatch):
    calls = []

    def capture(_sb, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(svc, "_notificar", capture)
    item = {
        "id": 55,
        "origen": "tarea",
        "titulo": "Revisar planos",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
        "contrato_id": 3,
    }
    # No notifica si no pasa a cumplido
    svc._notificar_delegante_tarea_cumplida(
        None, item, prev_estado="abierto", new_estado="en_progreso", actor_id=20,
    )
    assert calls == []
    # No notifica si ya estaba cumplido
    svc._notificar_delegante_tarea_cumplida(
        None, item, prev_estado="cumplido", new_estado="cumplido", actor_id=20,
    )
    assert calls == []
    # Sí notifica al creador (delegante) cuando el asignado marca cumplido
    svc._notificar_delegante_tarea_cumplida(
        None, item, prev_estado="abierto", new_estado="cumplido", actor_id=20,
    )
    assert len(calls) == 1
    assert calls[0]["destinatario_id"] == 10
    assert calls[0]["remitente_id"] == 20
    assert "delegada cumplida" in calls[0]["asunto"].lower()
    assert "delegó" in calls[0]["mensaje"].lower()
    assert calls[0]["entidad_tipo"] == "seguimiento_tarea"
    assert calls[0]["entidad_id"] == "55"


def test_notificar_delegante_ignora_referencia(monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **k: calls.append(k))
    item = {
        "id": 7,
        "origen": "tarea",
        "titulo": "Solo ver",
        "relacion_destinatario": "referencia",
        "created_by": 10,
        "asignado_a_id": 10,
        "referido_a_id": 20,
        "contrato_id": 1,
    }
    svc._notificar_delegante_tarea_cumplida(
        None, item, prev_estado="abierto", new_estado="cumplido", actor_id=20,
    )
    assert calls == []


def _fake_bandeja_q(rows):
    class FakeQ:
        def __init__(self, data):
            self._rows = data

        def select(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def gte(self, *_a, **_k):
            return self

        def lte(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": list(self._rows)})()

    return FakeQ(rows)


def test_list_bandeja_delegada_visible_para_asignado_y_creador(monkeypatch):
    """Visibilidad dual: quien delegó y el asignado ven la tarea en bandeja."""
    items = [
        {
            "id": 101,
            "origen": "tarea",
            "titulo": "Delegada",
            "estado_gestion": "abierto",
            "asignado_a_id": 20,
            "created_by": 10,
            "solicitante_id": None,
            "referido_a_id": None,
            "relacion_destinatario": "asignacion",
            "contrato_id": 5,
        },
        {
            "id": 102,
            "origen": "tarea",
            "titulo": "Ajena",
            "estado_gestion": "abierto",
            "asignado_a_id": 99,
            "created_by": 98,
            "solicitante_id": None,
            "referido_a_id": None,
            "relacion_destinatario": "asignacion",
            "contrato_id": 5,
        },
    ]

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return _fake_bandeja_q(items)
            if name == "usuarios":
                return _fake_bandeja_q([
                    {"id": 10, "nombre": "Ana", "apellidos": "Pérez"},
                    {"id": 20, "nombre": "Luis", "apellidos": "Gómez"},
                ])
            return _fake_bandeja_q([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {"id": uid, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)

    as_assignee = svc.list_bandeja(FakeSb(), 20, {"sub": "20"}, contrato_id=5)
    assert [r["id"] for r in as_assignee] == [101]
    assert as_assignee[0].get("created_by_nombre") == "Ana Pérez"

    as_creator = svc.list_bandeja(FakeSb(), 10, {"sub": "10"}, contrato_id=5)
    assert [r["id"] for r in as_creator] == [101]
