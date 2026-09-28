"""Edición y eliminación de compromisos: elaborador / Desarrollador."""
from __future__ import annotations

from datetime import date

import pytest

import seguimiento_service as svc


def _item_base(**overrides):
    row = {
        "id": 8,
        "origen": "compromiso",
        "acta_id": 3,
        "contrato_id": 1,
        "titulo": "Entregar informe",
        "descripcion": "Alcance X",
        "fecha_vencimiento": "2026-09-15",
        "hora_vencimiento": "10:00",
        "estado_gestion": "abierto",
        "asignado_a_id": 20,
        "asignado_a_nombre": "Ana Pérez",
        "asignado_externo_id": None,
        "campos_libres": {},
        "created_by": 10,
    }
    row.update(overrides)
    return row


def test_eliminar_compromiso_permite_elaborador(monkeypatch):
    item = _item_base()
    deleted = []
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {"id": 3, "elaborador_id": 10})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    class FakeQ:
        def delete(self):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            deleted.append(item["id"])
            return type("R", (), {"data": None})()

    class FakeSB:
        def table(self, _name):
            return FakeQ()

    out = svc.eliminar_item(FakeSB(), 8, {"sub": 10, "rol_nombre": "Operativo"})
    assert out["ok"] is True
    assert deleted == [8]


def test_eliminar_compromiso_denegado_a_no_autorizado(monkeypatch):
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: _item_base())
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {"id": 3, "elaborador_id": 10})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    with pytest.raises(ValueError, match="elaborador"):
        svc.eliminar_item(None, 8, {"sub": 99, "rol_nombre": "Operativo"})


def test_eliminar_tarea_sigue_solo_desarrollador(monkeypatch):
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: {
        "id": 9, "origen": "tarea", "acta_id": None,
    })
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    with pytest.raises(ValueError, match="Desarrollador"):
        svc.eliminar_item(None, 9, {"sub": 10, "rol_nombre": "Operativo"})


def test_eliminar_compromiso_como_desarrollador(monkeypatch):
    item = _item_base()
    deleted = []
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)

    class FakeQ:
        def delete(self):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            deleted.append(item["id"])
            return type("R", (), {"data": None})()

    class FakeSB:
        def table(self, _name):
            return FakeQ()

    out = svc.eliminar_item(FakeSB(), 8, {"cargo_nombre": "Desarrollador"})
    assert out["ok"] is True
    assert deleted == [8]


def test_actualizar_compromiso_redaccion_fecha_estado(monkeypatch):
    from datetime import datetime, timezone

    item = _item_base()
    updates = []
    eventos = []

    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {
        "id": 3, "elaborador_id": 10, "estado": "realizada",
    })
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "_parse_date", lambda s: date.fromisoformat(str(s)[:10]))
    monkeypatch.setattr(svc, "_norm_hora", lambda h: str(h)[:5] if h else None)
    monkeypatch.setattr(
        svc, "calcular_fecha_limite_gracia",
        lambda *_a, **_k: datetime(2026, 10, 2, 23, 59, 59, tzinfo=timezone.utc),
    )
    monkeypatch.setattr(svc, "make_calendar_loader", lambda _sb: None)
    monkeypatch.setattr(svc, "CalendarioNoHabilesCache", lambda **_k: object())
    monkeypatch.setattr(
        svc, "_registrar_evento",
        lambda _sb, _iid, tipo, _uid=None, payload=None: eventos.append(tipo),
    )
    monkeypatch.setattr(
        svc, "get_item_detalle",
        lambda *_a, **_k: {**item, "descripcion": "Nueva redacción", "estado_gestion": "en_progreso"},
    )

    class FakeQ:
        def update(self, payload):
            updates.append(payload)
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": None})()

    class FakeSB:
        def table(self, _name):
            return FakeQ()

    out = svc.actualizar_compromiso(
        FakeSB(),
        8,
        10,
        {"rol_nombre": "Operativo"},
        {
            "redaccion": "Nueva redacción del compromiso",
            "fecha_vencimiento": "2026-10-01",
            "hora_vencimiento": "14:30",
            "estado_gestion": "en_progreso",
        },
    )
    assert out["descripcion"] == "Nueva redacción"
    assert updates
    assert updates[0]["titulo"].startswith("Nueva redacción")
    assert updates[0]["fecha_vencimiento"] == "2026-10-01"
    assert updates[0]["hora_vencimiento"] == "14:30"
    assert updates[0]["estado_gestion"] == "en_progreso"
    assert "compromiso_editado" in eventos
    assert "fecha_compromiso_corregida" in eventos
    assert "cambio_estado" in eventos


def test_actualizar_compromiso_denegado_a_no_autorizado(monkeypatch):
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: _item_base())
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {"id": 3, "elaborador_id": 10})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    with pytest.raises(ValueError, match="elaborador"):
        svc.actualizar_compromiso(
            None, 8, 99, {"rol_nombre": "Operativo"},
            {"redaccion": "x"},
        )


def test_actualizar_compromiso_no_aplica_a_tarea(monkeypatch):
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: {
        "id": 9, "origen": "tarea", "acta_id": None,
    })
    with pytest.raises(ValueError, match="compromisos"):
        svc.actualizar_compromiso(
            None, 9, 10, {"rol_nombre": "Operativo"},
            {"redaccion": "x"},
        )


def test_actualizar_compromiso_rechaza_varios_asignados(monkeypatch):
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: _item_base())
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: {"id": 3, "elaborador_id": 10})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    class FakeQ:
        def update(self, payload):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": None})()

    class FakeSB:
        def table(self, _name):
            return FakeQ()

    with pytest.raises(ValueError, match="un asignado"):
        svc.actualizar_compromiso(
            FakeSB(), 8, 10, {"rol_nombre": "Operativo"},
            {
                "redaccion": "texto",
                "asignados": [
                    {"asignado_a_id": 1, "asignado_a_nombre": "A"},
                    {"asignado_a_id": 2, "asignado_a_nombre": "B"},
                ],
            },
        )
