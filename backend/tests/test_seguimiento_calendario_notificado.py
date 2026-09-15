"""Visibilidad en bandeja/calendario para usuarios notificados en subtareas."""
from __future__ import annotations

import seguimiento_service as svc


def test_ids_notificados_tarea_desde_checklist():
    item = {
        "origen": "tarea",
        "campos_libres": {
            "checklist": [
                {
                    "id": "a",
                    "texto": "Sub A",
                    "notificar_a_id": 77,
                    "notificar_a_nombre": "Yuri",
                    "relacion_notificacion": "referencia",
                },
                {
                    "id": "b",
                    "texto": "Sub B",
                    "notificar_a": {"id": 88, "nombre": "Otro", "relacion": "asignacion"},
                },
                {"id": "c", "texto": "Sin notificar"},
            ],
        },
    }
    assert svc._ids_notificados_tarea(item) == {77, 88}
    assert svc._ids_notificados_tarea({"origen": "compromiso", "campos_libres": {}}) == set()
    assert svc._ids_notificados_tarea(None) == set()


def test_list_bandeja_incluye_notificado_de_subtarea(monkeypatch):
    """YYY notificado en subtarea ve la tarea aunque el responsable sea XXX."""
    items = [
        {
            "id": 10,
            "origen": "tarea",
            "contrato_id": 5,
            "estado_gestion": "abierto",
            "created_by": 1,
            "asignado_a_id": 20,  # XXX responsable
            "asignado_a_nombre": "XXX",
            "fecha_vencimiento": "2026-09-20",
            "titulo": "Tarea delegada",
            "campos_libres": {
                "checklist": [
                    {
                        "id": "s1",
                        "texto": "Subtarea",
                        "fecha": "2026-09-20",
                        "notificar_a_id": 30,  # YYY notificado
                        "notificar_a_nombre": "YYY",
                        "relacion_notificacion": "referencia",
                    },
                ],
                "asignaciones": [
                    {"usuario_id": 20, "nombre": "XXX", "estado_gestion": "abierto"},
                ],
            },
        },
        {
            "id": 11,
            "origen": "tarea",
            "contrato_id": 5,
            "estado_gestion": "abierto",
            "created_by": 99,
            "asignado_a_id": 99,
            "fecha_vencimiento": "2026-09-21",
            "titulo": "Ajena",
            "campos_libres": {},
        },
    ]

    class FakeQ:
        def __init__(self, data):
            self._data = data

        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def gte(self, *_a, **_k):
            return self

        def lte(self, *_a, **_k):
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def execute(self):
            return type("R", (), {"data": list(self._data)})()

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return FakeQ(items)
            return FakeQ([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {"id": uid, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)

    # YYY (30) solo está en notificar_a — debe ver id 10
    as_yyy = svc.list_bandeja(FakeSb(), 30, {"sub": "30"}, contrato_id=5, incluir_cerrados=True)
    assert [r["id"] for r in as_yyy] == [10]

    # XXX (20) responsable — también la ve
    as_xxx = svc.list_bandeja(FakeSb(), 20, {"sub": "20"}, contrato_id=5, incluir_cerrados=True)
    assert [r["id"] for r in as_xxx] == [10]

    # Usuario ajeno no la ve
    as_other = svc.list_bandeja(FakeSb(), 40, {"sub": "40"}, contrato_id=5, incluir_cerrados=True)
    assert as_other == []

    # solo_mias también incluye notificados
    as_yyy_mias = svc.list_bandeja(
        FakeSb(), 30, {"sub": "30"}, contrato_id=5, solo_mias=True, incluir_cerrados=True,
    )
    assert [r["id"] for r in as_yyy_mias] == [10]


def test_notificado_no_es_asignado_formal():
    item = {
        "origen": "tarea",
        "asignado_a_id": 20,
        "created_by": 1,
        "relacion_destinatario": "asignacion",
        "campos_libres": {
            "asignaciones": [
                {"usuario_id": 20, "nombre": "XXX", "estado_gestion": "abierto"},
            ],
            "checklist": [
                {"id": "s1", "notificar_a_id": 30, "relacion_notificacion": "referencia"},
            ],
        },
    }
    assert svc._usuario_es_asignado_formal(item, 20) is True
    assert svc._usuario_es_asignado_formal(item, 30) is False
    assert 30 in svc._ids_notificados_tarea(item)
