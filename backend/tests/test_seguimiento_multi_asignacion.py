"""Multi-destinatario: agregación colectiva y notificaciones parcial/total."""
from __future__ import annotations

import seguimiento_service as svc


def test_agregar_estados_colectivo():
    assert svc._agregar_estados_asignados(["cumplido", "cumplido"]) == "cumplido"
    assert svc._agregar_estados_asignados(["cumplido", "abierto"]) == "parcial"
    assert svc._agregar_estados_asignados(["abierto", "abierto"]) == "abierto"
    assert svc._agregar_estados_asignados(["en_progreso", "abierto"]) == "en_progreso"


def test_avance_subitem_multi_solo_cuenta_si_todos_cumplen():
    ck = [{
        "texto": "A",
        "asignaciones": [
            {"usuario_id": 2, "estado_gestion": "cumplido"},
            {"usuario_id": 3, "estado_gestion": "abierto"},
        ],
    }]
    pct, est = svc._avance_desde_checklist(ck)
    assert pct == 0
    assert est == "parcial"

    ck[0]["asignaciones"][1]["estado_gestion"] = "cumplido"
    pct2, est2 = svc._avance_desde_checklist(ck)
    assert pct2 == 100
    assert est2 == "cumplido"


def test_es_delegada_con_asignaciones_multi():
    item = {
        "origen": "tarea",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
        "campos_libres": {
            "asignaciones": [
                {"usuario_id": 20, "nombre": "A", "estado_gestion": "abierto"},
                {"usuario_id": 30, "nombre": "B", "estado_gestion": "abierto"},
            ],
        },
    }
    assert svc._es_tarea_delegada_asignacion(item)
    assert svc._ids_asignados_tarea(item) == {20, 30}
    assert svc._usuario_es_asignado_formal(item, 30)
    assert not svc._usuario_es_asignado_formal(item, 10)


def test_notif_individual_y_total(monkeypatch):
    calls = []

    def capture(_sb, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(svc, "_notificar", capture)
    item = {
        "id": 9,
        "origen": "tarea",
        "titulo": "Multi",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
        "contrato_id": 1,
        "campos_libres": {
            "asignaciones": [
                {"usuario_id": 20, "nombre": "Ana", "estado_gestion": "cumplido"},
                {"usuario_id": 30, "nombre": "Luis", "estado_gestion": "abierto"},
            ],
        },
    }
    svc._notificar_delegante_cumplido_individual(
        None, item, actor_id=20, actor_nombre="Ana", ambito="la tarea",
    )
    assert len(calls) == 1
    assert "parcial" in calls[0]["asunto"].lower() or "cumplido parcial" in calls[0]["asunto"].lower()
    assert "ana" in calls[0]["mensaje"].lower()

    calls.clear()
    svc._notificar_delegante_cumplido_total(
        None, item, actor_id=30, prev_estado="parcial", new_estado="cumplido",
    )
    assert len(calls) == 1
    assert "totalidad" in calls[0]["asunto"].lower() or "totalidad" in calls[0]["mensaje"].lower()


def test_parse_destinatarios_multi(monkeypatch):
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {"id": uid, "nombre": f"U{uid}", "apellidos": ""})
    monkeypatch.setattr(svc, "_nombre_usuario", lambda u: f"{u['nombre']}")
    out = svc._parse_destinatarios_payload(
        {"destinatarios": [{"id": 2, "nombre": "Ana"}, {"usuario_id": 3, "nombre": "Luis"}]},
        None,
        user_id=1,
    )
    assert [x["usuario_id"] for x in out] == [2, 3]


def _fake_q(rows):
    class FakeQ:
        def __init__(self, data):
            self._rows = data
            self._payload = None

        def select(self, *_a, **_k):
            return self

        def update(self, payload):
            self._payload = payload
            self._op = "update"
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if getattr(self, "_op", None) == "update" and self._payload:
                for r in self._rows:
                    r.update(self._payload)
            return type("R", (), {"data": list(self._rows)})()

    return FakeQ(rows)


def test_actualizar_estado_asignado_colectivo(monkeypatch):
    item = {
        "id": 50,
        "origen": "tarea",
        "titulo": "Obra",
        "estado_gestion": "abierto",
        "relacion_destinatario": "asignacion",
        "created_by": 10,
        "asignado_a_id": 20,
        "asignado_a_nombre": "Ana, Luis",
        "contrato_id": 1,
        "campos_libres": {
            "asignaciones": [
                {"usuario_id": 20, "nombre": "Ana", "estado_gestion": "abierto"},
                {"usuario_id": 30, "nombre": "Luis", "estado_gestion": "abierto"},
            ],
            "checklist": [],
        },
    }
    store = [dict(item)]
    notifs = []

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return _fake_q(store)
            if name == "usuarios":
                return _fake_q([
                    {"id": 20, "nombre": "Ana", "apellidos": ""},
                    {"id": 30, "nombre": "Luis", "apellidos": ""},
                    {"id": 10, "nombre": "Boss", "apellidos": ""},
                ])
            if name == "notificaciones":
                class N:
                    def insert(self, row):
                        notifs.append(row)
                        return self

                    def execute(self):
                        return type("R", (), {"data": notifs[-1:]})()
                return N()
            return _fake_q([])

    monkeypatch.setattr(svc, "get_item", lambda _sb, _id: dict(store[0]))
    monkeypatch.setattr(svc, "get_item_detalle", lambda _sb, _id: dict(store[0]))
    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, uid: {
        20: {"id": 20, "nombre": "Ana", "apellidos": ""},
        30: {"id": 30, "nombre": "Luis", "apellidos": ""},
    }.get(uid))
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)

    sb = FakeSb()
    # Ana cumple su parte → notificación parcial (hay 2 asignados)
    svc.actualizar_estado_asignado(sb, 50, 20, "cumplido")
    assert store[0]["estado_gestion"] == "parcial"
    assert any("parcial" in (n.get("asunto") or "").lower() for n in notifs)

    # Luis cumple → total
    notifs.clear()
    store[0]["campos_libres"]["asignaciones"][0]["estado_gestion"] = "cumplido"
    svc.actualizar_estado_asignado(sb, 50, 30, "cumplido")
    assert store[0]["estado_gestion"] == "cumplido"
    assert any("totalidad" in (n.get("asunto") or "").lower() or "totalidad" in (n.get("mensaje") or "").lower()
               for n in notifs)
