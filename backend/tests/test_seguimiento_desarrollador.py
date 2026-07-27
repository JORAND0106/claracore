"""Desarrollador: acceso pleno al módulo Seguimiento (sin ownership)."""
from __future__ import annotations

import seguimiento_permissions as perm
import seguimiento_service as svc


def test_es_desarrollador_seguimiento_fallback_sin_main(monkeypatch):
    """Si main no está disponible, usa cargo/rol del JWT."""
    real_import = __import__

    def fake_import(name, *args, **kwargs):
        if name == "main":
            raise ImportError("main blocked in test")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)
    assert svc.es_desarrollador_seguimiento({"cargo_nombre": "Desarrollador"})
    assert svc.es_desarrollador_seguimiento({"rol_nombre": "Desarrollador"})
    assert not svc.es_desarrollador_seguimiento({"cargo_nombre": "Residente", "rol_nombre": "Operativo"})
    assert not svc.es_desarrollador_seguimiento(None)


def test_permiso_seguimiento_desarrollador_via_helper(monkeypatch):
    """Desarrollador: acceso total incluyendo eliminar."""
    calls = {"n": 0}

    class FakeMain:
        @staticmethod
        def _es_desarrollador(_u):
            calls["n"] += 1
            return True

        supabase = object()

        @staticmethod
        def supabase_execute(fn):
            return fn()

    import sys

    monkeypatch.setitem(sys.modules, "main", FakeMain)
    assert perm.tiene_permiso_seguimiento({"sub": "1"}, "ver")
    assert perm.tiene_permiso_seguimiento({"sub": "1"}, "validar")
    assert perm.tiene_permiso_seguimiento({"sub": "1"}, "eliminar")
    assert calls["n"] >= 1


def test_permiso_seguimiento_abierto_todos_roles_excepto_eliminar(monkeypatch):
    """Cualquier usuario autenticado: ver/crear/editar; eliminar solo Desarrollador."""

    class FakeMain:
        @staticmethod
        def _es_desarrollador(_u):
            return False

    import sys

    monkeypatch.setitem(sys.modules, "main", FakeMain)
    user = {"sub": "42", "rol_nombre": "Interventoría Operativa"}
    assert perm.tiene_permiso_seguimiento(user, "ver")
    assert perm.tiene_permiso_seguimiento(user, "crear")
    assert perm.tiene_permiso_seguimiento(user, "editar")
    assert perm.tiene_permiso_seguimiento(user, "validar")
    assert perm.tiene_permiso_seguimiento(user, "exportar")
    assert not perm.tiene_permiso_seguimiento(user, "eliminar")
    assert not perm.tiene_permiso_seguimiento(None, "ver")
    assert not perm.tiene_permiso_seguimiento({}, "ver")


def test_require_eliminar_mensaje_desarrollador(monkeypatch):
    class FakeMain:
        @staticmethod
        def _es_desarrollador(_u):
            return False

    import sys
    from fastapi import HTTPException

    monkeypatch.setitem(sys.modules, "main", FakeMain)
    try:
        perm.require_permiso_seguimiento({"sub": "9"}, "eliminar")
        assert False, "debía lanzar 403"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert "Desarrollador" in exc.detail


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
            return type("R", (), {"data": self._rows})()

    return FakeQ(rows)


def test_list_bandeja_desarrollador_ve_todos(monkeypatch):
    items = [
        {"id": 1, "origen": "compromiso", "asignado_a_id": 99, "created_by": 88, "solicitante_id": 77, "contrato_id": 3},
        {"id": 2, "origen": "tarea", "asignado_a_id": 55, "created_by": 55, "solicitante_id": None, "contrato_id": 3},
        {"id": 3, "origen": "tarea", "asignado_a_id": 55, "created_by": 55, "solicitante_id": None, "contrato_id": 9},
    ]

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return _fake_bandeja_q(items)
            return _fake_bandeja_q([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, _uid: {"id": 1, "rol_id": 1})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    # Sin filtro de contrato: ve todo (compat)
    rows = svc.list_bandeja(FakeSb(), 1, {"sub": "1", "cargo_nombre": "Desarrollador"})
    assert {r["id"] for r in rows} == {1, 2, 3}
    # Con contrato activo: solo ítems de ese contrato (también Desarrollador)
    rows_c3 = svc.list_bandeja(
        FakeSb(), 1, {"sub": "1", "cargo_nombre": "Desarrollador"}, contrato_id=3,
    )
    assert {r["id"] for r in rows_c3} == {1, 2}


def test_list_bandeja_excluye_tareas_sin_contrato_al_filtrar(monkeypatch):
    items = [
        {"id": 1, "origen": "tarea", "asignado_a_id": 1, "created_by": 1, "solicitante_id": None, "contrato_id": None},
        {"id": 2, "origen": "tarea", "asignado_a_id": 1, "created_by": 1, "solicitante_id": None, "contrato_id": 5},
    ]

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return _fake_bandeja_q(items)
            return _fake_bandeja_q([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, _uid: {"id": 1, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)
    rows = svc.list_bandeja(FakeSb(), 1, {"sub": "1"}, contrato_id=5)
    assert [r["id"] for r in rows] == [2]


def test_list_bandeja_usuario_normal_filtra_ownership(monkeypatch):
    items = [
        {"id": 1, "origen": "compromiso", "asignado_a_id": 1, "created_by": 2, "solicitante_id": 2, "contrato_id": 3},
        {"id": 2, "origen": "tarea", "asignado_a_id": 55, "created_by": 55, "solicitante_id": None, "contrato_id": None},
    ]

    class FakeSb:
        def table(self, name):
            if name == "seguimiento_item":
                return _fake_bandeja_q(items)
            return _fake_bandeja_q([])

    monkeypatch.setattr(svc, "_usuario_row", lambda _sb, _uid: {"id": 1, "rol_id": 5})
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: False)
    monkeypatch.setattr(svc, "es_contratista_gerencial", lambda *_a, **_k: False)
    rows = svc.list_bandeja(FakeSb(), 1, {"sub": "1", "cargo_nombre": "Residente"})
    assert [r["id"] for r in rows] == [1]


def test_revisar_justificacion_desarrollador_sin_ser_solicitante(monkeypatch):
    class Table:
        def __init__(self, name, store):
            self.name = name
            self.store = store
            self._filters = {}
            self._op = "select"
            self._payload = None

        def select(self, *_a, **_k):
            self._op = "select"
            return self

        def update(self, payload):
            self._op = "update"
            self._payload = payload
            return self

        def eq(self, key, val):
            self._filters[key] = val
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self._op == "update":
                for row in self.store.get(self.name, []):
                    ok = all(row.get(k) == v for k, v in self._filters.items())
                    if ok:
                        row.update(self._payload)
                return type("R", (), {"data": []})()
            rows = [
                r for r in self.store.get(self.name, [])
                if all(r.get(k) == v for k, v in self._filters.items())
            ]
            return type("R", (), {"data": rows})()

    class FakeSb:
        def __init__(self):
            self.store = {
                "seguimiento_justificacion": [
                    {
                        "id": 10,
                        "item_id": 20,
                        "estado": "pendiente",
                        "nueva_fecha_vencimiento": "2026-08-01",
                        "motivo": "atraso",
                    }
                ],
                "seguimiento_item": [
                    {
                        "id": 20,
                        "origen": "compromiso",
                        "solicitante_id": 999,
                        "asignado_a_id": 2,
                        "contrato_id": 1,
                        "titulo": "Compromiso X",
                        "estado_gestion": "vencido",
                        "vencido_at": "2026-07-20T00:00:00+00:00",
                    }
                ],
            }

        def table(self, name):
            return Table(name, self.store)

    sb = FakeSb()
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    monkeypatch.setattr(svc, "get_item_detalle", lambda _sb, iid: {"id": iid, "ok": True})
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "CalendarioNoHabilesCache", lambda **_k: type("C", (), {})())
    monkeypatch.setattr(svc, "make_calendar_loader", lambda _sb: None)
    monkeypatch.setattr(svc, "calcular_fecha_limite_gracia", lambda *_a, **_k: svc._now_utc())

    out = svc.revisar_justificacion(
        sb,
        10,
        user_id=1,
        aprobar=True,
        current_user={"sub": "1", "cargo_nombre": "Desarrollador"},
    )
    assert out["ok"] is True
    just = sb.store["seguimiento_justificacion"][0]
    assert just["estado"] == "aprobada"
    assert just["revisado_por_id"] == 1


def test_update_tarea_desarrollador_ajena(monkeypatch):
    class FakeSb:
        def __init__(self):
            self.updated = None

        def table(self, _name):
            outer = self

            class T:
                def update(self, payload):
                    outer.updated = payload
                    return self

                def eq(self, *_a, **_k):
                    return self

                def execute(self):
                    return type("R", (), {"data": []})()

            return T()

    sb = FakeSb()
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    monkeypatch.setattr(
        svc,
        "get_item",
        lambda _sb, _id: {
            "id": 5,
            "origen": "tarea",
            "created_by": 9,
            "asignado_a_id": 9,
            "titulo": "Tarea ajena",
            "descripcion": (sb.updated or {}).get("descripcion"),
        },
    )
    monkeypatch.setattr(svc, "get_item_detalle", lambda _sb, iid: {"id": iid, "ok": True})
    row = svc.update_tarea(
        sb,
        5,
        {"descripcion": "editada por dev"},
        user_id=1,
        current_user={"sub": "1", "cargo_nombre": "Desarrollador"},
    )
    assert sb.updated is not None
    assert sb.updated["descripcion"] == "editada por dev"
    assert row["id"] == 5


def test_solicitar_justificacion_desarrollador(monkeypatch):
    class FakeSb:
        def __init__(self):
            self.inserted = None

        def table(self, name):
            outer = self

            class T:
                def insert(self, payload):
                    outer.inserted = payload
                    return self

                def execute(self):
                    if name == "seguimiento_justificacion":
                        return type("R", (), {"data": [{**outer.inserted, "id": 1}]})()
                    return type("R", (), {"data": []})()

            return T()

    monkeypatch.setattr(
        svc,
        "get_item",
        lambda _sb, _id: {
            "id": 7,
            "origen": "compromiso",
            "asignado_a_id": 99,
            "solicitante_id": 88,
            "titulo": "X",
            "contrato_id": 1,
        },
    )
    monkeypatch.setattr(svc, "es_desarrollador_seguimiento", lambda _u: True)
    monkeypatch.setattr(svc, "_registrar_evento", lambda *_a, **_k: None)
    monkeypatch.setattr(svc, "_notificar", lambda *_a, **_k: None)
    row = svc.solicitar_justificacion(
        FakeSb(),
        7,
        user_id=1,
        motivo="Retraso justificado por clima",
        nueva_fecha="2026-08-10",
        current_user={"sub": "1", "cargo_nombre": "Desarrollador"},
    )
    assert row["id"] == 1
    assert row["estado"] == "pendiente"
