"""Reasignación de responsable de compromisos: elaborador / Desarrollador + trazabilidad."""
from __future__ import annotations

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
        "campos_libres": {"nota": "conservar"},
        "created_by": 10,
    }
    row.update(overrides)
    return row


def test_assert_reasignar_solo_elaborador_o_dev(monkeypatch):
    item = _item_base()
    acta = {"id": 3, "elaborador_id": 10, "estado": "realizada"}
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    out = svc._assert_puede_reasignar_responsable_compromiso(
        None, item, 10, {"rol_nombre": "Operativo"},
    )
    assert out["id"] == 3

    with pytest.raises(ValueError, match="elaborador"):
        svc._assert_puede_reasignar_responsable_compromiso(
            None, item, 99, {"rol_nombre": "Operativo"},
        )

    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    assert svc._assert_puede_reasignar_responsable_compromiso(
        None, item, 99, {"cargo_nombre": "Desarrollador"},
    )["id"] == 3


def test_assert_reasignar_no_aplica_a_tarea(monkeypatch):
    with pytest.raises(ValueError, match="compromisos"):
        svc._assert_puede_reasignar_responsable_compromiso(
            None,
            {"origen": "tarea", "acta_id": None},
            10,
            {"rol_nombre": "Operativo"},
        )


def test_reasignar_responsable_conserva_historial_y_registra_evento(monkeypatch):
    item = _item_base(asignado_externo_id=77, campos_libres={
        "nota": "conservar",
        "asignado_externo": {"id": 77},
        "externo_id": 77,
        "asignado_email": "ext@x.com",
    })
    acta = {"id": 3, "elaborador_id": 10, "estado": "realizada", "consecutivo": 4}
    updates = []
    eventos = []
    notifs = []

    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        "id": uid, "nombre": "Luis", "apellidos": "Rojas", "email": "l@x.com",
    })
    monkeypatch.setattr(
        svc, "_usuario_contrato_para_reemplazo",
        lambda _sb, _cid, uid: {"id": uid, "nombre": "Luis", "apellidos": "Rojas", "activo": True},
    )
    monkeypatch.setattr(svc, "_nombre_usuario", lambda u: f"{u.get('nombre')} {u.get('apellidos')}".strip())
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: True)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *a, **k: eventos.append((a, k)))
    monkeypatch.setattr(
        svc, "_notificar_compromiso_asignado",
        lambda *a, **k: notifs.append(k) or True,
    )
    monkeypatch.setattr(
        svc, "get_item_detalle",
        lambda *_a, **_k: {**item, "asignado_a_id": 30, "asignado_a_nombre": "Luis Rojas"},
    )

    class FakeQ:
        def update(self, payload):
            updates.append(payload)
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class FakeSb:
        def table(self, _n):
            return FakeQ()

    out = svc.reasignar_responsable_compromiso(
        FakeSb(), 8, 10, {"rol_nombre": "Operativo"},
        nuevo_asignado_id=30,
    )

    assert updates, "debe persistir el cambio de responsable"
    patch = updates[0]
    assert patch["asignado_a_id"] == 30
    assert patch["asignado_a_nombre"] == "Luis Rojas"
    assert patch["asignado_externo_id"] is None
    assert patch["relacion_destinatario"] == "asignacion"
    # Conserva campos libres no relacionados con externo
    assert patch["campos_libres"].get("nota") == "conservar"
    assert "asignado_externo" not in patch["campos_libres"]
    # No toca fecha/estado
    assert "fecha_vencimiento" not in patch
    assert "estado_gestion" not in patch

    assert len(eventos) == 1
    tipo = eventos[0][0][2]
    payload = eventos[0][0][4]
    assert tipo == "compromiso_reasignado"
    assert payload["de_asignado_id"] == 20
    assert payload["de_asignado_nombre"] == "Ana Pérez"
    assert payload["de_asignado_externo_id"] == 77
    assert payload["a_asignado_id"] == 30
    assert payload["a_asignado_nombre"] == "Luis Rojas"
    assert payload["reasignado_por_id"] == 10
    assert payload.get("reasignado_en")

    assert notifs and notifs[0].get("reasignacion") is True
    assert notifs[0]["destinatario_id"] == 30
    assert out["asignado_a_id"] == 30


def test_reasignar_responsable_denegado_a_no_autorizado(monkeypatch):
    item = _item_base()
    acta = {"id": 3, "elaborador_id": 10, "estado": "borrador"}
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    with pytest.raises(ValueError, match="elaborador"):
        svc.reasignar_responsable_compromiso(
            None, 8, 20, {"rol_nombre": "Operativo"},
            nuevo_asignado_id=30,
        )


def test_reasignar_responsable_como_desarrollador(monkeypatch):
    item = _item_base()
    acta = {"id": 3, "elaborador_id": 10, "estado": "firmada"}
    updates = []

    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        "id": uid, "nombre": "Dev", "apellidos": "User",
    })
    monkeypatch.setattr(
        svc, "_usuario_contrato_para_reemplazo",
        lambda _sb, _cid, uid: {"id": uid, "nombre": "Dev", "apellidos": "User", "activo": True},
    )
    monkeypatch.setattr(svc, "_nombre_usuario", lambda u: "Dev User")
    monkeypatch.setattr(svc, "_schema_has", lambda *_a, **_k: False)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_notificar_compromiso_asignado", lambda *_a, **_k: True)
    monkeypatch.setattr(
        svc, "get_item_detalle",
        lambda *_a, **_k: {**item, "asignado_a_id": 55, "asignado_a_nombre": "Dev User"},
    )

    class FakeQ:
        def update(self, payload):
            updates.append(payload)
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": []})()

    class FakeSb:
        def table(self, _n):
            return FakeQ()

    out = svc.reasignar_responsable_compromiso(
        FakeSb(), 8, 99, {"cargo_nombre": "Desarrollador"},
        nuevo_asignado_id=55,
        nuevo_asignado_nombre="Dev User",
    )
    assert updates[0]["asignado_a_id"] == 55
    assert out["asignado_a_id"] == 55


def test_destinar_asignacion_compromiso_exige_elaborador(monkeypatch):
    item = _item_base()
    acta = {"id": 3, "elaborador_id": 10, "estado": "borrador"}
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)

    with pytest.raises(ValueError, match="elaborador"):
        svc.destinar_item(
            None, 8, 20, {"rol_nombre": "Operativo"},
            {"destinatario_id": 30, "relacion_destinatario": "asignacion"},
        )


def test_destinar_asignacion_compromiso_delega_a_reasignar(monkeypatch):
    item = _item_base()
    acta = {"id": 3, "elaborador_id": 10, "estado": "borrador"}
    called = {}

    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        "id": uid, "nombre": "Luis", "apellidos": "R",
    })
    monkeypatch.setattr(svc, "_nombre_usuario", lambda u: "Luis R")

    def fake_reasignar(sb, item_id, user_id, current_user, *, nuevo_asignado_id, nuevo_asignado_nombre=None):
        called.update({
            "item_id": item_id,
            "user_id": user_id,
            "nuevo_asignado_id": nuevo_asignado_id,
            "nuevo_asignado_nombre": nuevo_asignado_nombre,
        })
        return {"id": item_id, "asignado_a_id": nuevo_asignado_id}

    monkeypatch.setattr(svc, "reasignar_responsable_compromiso", fake_reasignar)

    out = svc.destinar_item(
        None, 8, 10, {"rol_nombre": "Operativo"},
        {"destinatario_id": 30, "destinatario_nombre": "Luis R", "relacion_destinatario": "asignacion"},
    )
    assert called["nuevo_asignado_id"] == 30
    assert called["user_id"] == 10
    assert out["asignado_a_id"] == 30
