"""Permisos de acta (elaborador / sellado) y comentarios de compromiso."""
from __future__ import annotations

import pytest

import seguimiento_service as svc


def test_usuario_puede_ver_acta_elaborador_asistente_y_roles():
    acta = {
        "id": 7,
        "elaborador_id": 10,
        "asistentes": [
            {"usuario_id": 20, "nombre": "Ana"},
            {"usuario_id": None, "nombre": "Externo"},
        ],
    }
    assert svc.usuario_puede_ver_acta(None, acta, 10, {"rol_nombre": "Operativo"}) is True
    assert svc.usuario_puede_ver_acta(None, acta, 20, {"rol_nombre": "Operativo"}) is True
    assert svc.usuario_puede_ver_acta(None, acta, 99, {"rol_nombre": "Operativo"}) is False
    assert svc.usuario_puede_ver_acta(
        None, acta, 99, {"cargo_nombre": "Administrador"},
    ) is True
    assert svc.usuario_puede_ver_acta(
        None, acta, 99, {"rol_nombre": "Desarrollador"},
    ) is True


def test_assert_puede_ver_acta_lanza_acceso_denegado():
    acta = {"id": 1, "elaborador_id": 10, "asistentes": []}
    with pytest.raises(svc.ActaAccesoDenegado):
        svc.assert_puede_ver_acta(None, acta, 99, {"rol_nombre": "Operativo"})


def test_anexar_flags_acceso_actas_redacta_orden(monkeypatch):
    rows = [
        {"id": 1, "elaborador_id": 10, "orden_del_dia": '["secreto"]', "consecutivo": 1},
        {"id": 2, "elaborador_id": 11, "orden_del_dia": '["otro"]', "consecutivo": 2},
    ]
    monkeypatch.setattr(svc, "_ids_actas_donde_es_asistente", lambda *_a, **_k: {2})
    out = svc.anexar_flags_acceso_actas(None, rows, user_id=20, current_user={"rol_nombre": "x"})
    assert out[0]["puede_abrir"] is False
    assert out[0]["orden_del_dia"] is None
    assert out[0]["acceso_restringido"] is True
    assert out[1]["puede_abrir"] is True
    assert out[1]["orden_del_dia"] == '["otro"]'


def test_resumen_acta_restringida_sin_contenido():
    full = {
        "id": 3,
        "consecutivo": 12,
        "fecha_reunion": "2026-07-01",
        "tipo_acta": "interna",
        "estado": "borrador",
        "elaborador_id": 10,
        "elaborador_nombre": "Luis",
        "ubicacion": "Sala",
        "orden_del_dia": "secreto",
        "ideas": [{"texto": "x"}],
        "asistentes": [{"nombre": "A"}],
    }
    r = svc.resumen_acta_restringida(full)
    assert r["consecutivo"] == 12
    assert r["puede_abrir"] is False
    assert "ideas" not in r
    assert "asistentes" not in r
    assert "orden_del_dia" not in r


def test_get_item_detalle_redacta_acta_sin_acceso(monkeypatch):
    item = {
        "id": 5,
        "origen": "compromiso",
        "acta_id": 3,
        "contrato_id": 1,
        "titulo": "Entregar",
    }
    acta = {
        "id": 3,
        "consecutivo": 9,
        "elaborador_id": 10,
        "estado": "borrador",
        "tipo_acta": "interna",
        "orden_del_dia": "secreto",
        "asistentes": [{"usuario_id": 10}],
        "ideas": [{"texto": "tema oculto"}],
        "apartados": [],
        "compromisos": [],
        "firmas": [],
    }

    class FakeQ:
        def __init__(self):
            self._data = []

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": list(self._data)})()

    class FakeSb:
        def table(self, _n):
            return FakeQ()

    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: dict(item))
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: dict(acta))

    denied = svc.get_item_detalle(FakeSb(), 5, user_id=99, current_user={"rol_nombre": "Operativo"})
    assert denied["puede_ver_acta"] is False
    assert denied["acta"]["consecutivo"] == 9
    assert "ideas" not in denied["acta"]
    assert denied["acta"].get("orden_del_dia") is None

    allowed = svc.get_item_detalle(FakeSb(), 5, user_id=10, current_user={"rol_nombre": "Operativo"})
    assert allowed["puede_ver_acta"] is True
    assert allowed["acta"]["ideas"][0]["texto"] == "tema oculto"


def test_acta_sellada_helper():
    assert svc._acta_esta_sellada({"estado": "borrador"}) is False
    assert svc._acta_esta_sellada({"estado": "realizada"}) is True
    assert svc._acta_esta_sellada({"estado": "firmada"}) is True
    assert svc._acta_esta_sellada({"estado": "en_firma"}) is True


def test_assert_solo_elaborador_en_borrador():
    acta = {"estado": "borrador", "elaborador_id": 10}
    svc._assert_puede_editar_acta(acta, 10, {"rol_nombre": "Operativo"})
    with pytest.raises(ValueError, match="elaborador"):
        svc._assert_puede_editar_acta(acta, 99, {"rol_nombre": "Operativo"})


def test_assert_sellada_bloquea_incluso_elaborador():
    acta = {"estado": "realizada", "elaborador_id": 10}
    with pytest.raises(ValueError, match="sellada"):
        svc._assert_puede_editar_acta(acta, 10, {"rol_nombre": "Operativo"})


def test_assert_dev_puede_revertir_sellada(monkeypatch):
    acta = {"estado": "realizada", "elaborador_id": 10}
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    svc._assert_puede_editar_acta(
        acta, 1, {"rol_nombre": "Desarrollador"},
        permitir_revertir_dev=True,
        nuevo_estado="borrador",
    )
    with pytest.raises(ValueError, match="sellada"):
        svc._assert_puede_editar_acta(
            acta, 1, {"rol_nombre": "Desarrollador"},
            permitir_revertir_dev=True,
            nuevo_estado="realizada",
        )


def test_agregar_comentario_compromiso_solo_asignado(monkeypatch):
    item = {
        "id": 5,
        "origen": "compromiso",
        "asignado_a_id": 20,
        "titulo": "Entregar",
        "acta_id": 3,
        "contrato_id": 1,
        "solicitante_id": 10,
        "created_by": 10,
    }
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "_usuario_row", lambda *_a, **_k: {"nombre": "Luis", "apellidos": "R"})
    monkeypatch.setattr(
        svc, "get_acta",
        lambda *_a, **_k: {"id": 3, "elaborador_id": 10, "estado": "borrador"},
    )
    notifs = []
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **k: notifs.append(k) or True)

    class FakeQ:
        def insert(self, payload):
            self.payload = payload
            return self

        def execute(self):
            return type("R", (), {"data": [{**self.payload, "id": 1}]})()

    class FakeSb:
        def table(self, _n):
            return FakeQ()

    # No asignado → error
    with pytest.raises(ValueError, match="asignados"):
        svc.agregar_comentario(FakeSb(), 5, "Hola", user_id=99)

    # Asignado → ok y notifica elaborador
    row = svc.agregar_comentario(FakeSb(), 5, "Corrección de alcance", user_id=20)
    assert row["mensaje"] == "Corrección de alcance"
    assert notifs[0]["destinatario_id"] == 10


def test_actualizar_fecha_compromiso_solo_elaborador(monkeypatch):
    item = {
        "id": 8,
        "origen": "compromiso",
        "acta_id": 3,
        "contrato_id": 1,
        "hora_vencimiento": "09:00",
    }
    acta = {"id": 3, "elaborador_id": 10, "estado": "borrador"}
    monkeypatch.setattr(svc, "get_item", lambda *_a, **_k: item)
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(
        svc, "calcular_fecha_limite_gracia",
        lambda *_a, **_k: __import__("datetime").datetime(2026, 9, 1, tzinfo=__import__("datetime").timezone.utc),
    )
    monkeypatch.setattr(svc, "CalendarioNoHabilesCache", lambda **_k: object())
    monkeypatch.setattr(svc, "make_calendar_loader", lambda _sb: None)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "get_item_detalle", lambda *_a, **_k: {**item, "fecha_vencimiento": "2026-08-30"})

    updates = []

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

    with pytest.raises(ValueError, match="elaborador"):
        svc.actualizar_fecha_compromiso(
            FakeSb(), 8, 99, fecha_vencimiento="2026-08-30", current_user={"rol_nombre": "x"},
        )

    out = svc.actualizar_fecha_compromiso(
        FakeSb(), 8, 10, fecha_vencimiento="2026-08-30", hora_vencimiento="14:00",
        current_user={"rol_nombre": "x"},
    )
    assert updates[0]["fecha_vencimiento"] == "2026-08-30"
    assert updates[0]["hora_vencimiento"] == "14:00"
    assert out["fecha_vencimiento"] == "2026-08-30"


def test_update_acta_sellada_sin_revert_falla(monkeypatch):
    acta = {
        "id": 1, "estado": "realizada", "elaborador_id": 10,
        "tipo_acta": "interna", "orden_del_dia": "[]",
    }
    monkeypatch.setattr(svc, "get_acta", lambda *_a, **_k: acta)
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    with pytest.raises(ValueError, match="sellada"):
        svc.update_acta(
            None, 1, 1, {"ubicacion": "X"}, user_id=10,
            current_user={"rol_nombre": "Operativo"},
        )
