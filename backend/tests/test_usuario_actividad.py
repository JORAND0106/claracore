"""Tests de evaluación de actividad para eliminación de usuarios."""
from usuario_actividad import evaluar_actividad_usuario, mensaje_bloqueo_corto


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeSb:
    def __init__(self, tables):
        self._tables = tables

    def table(self, name):
        return _FakeQuery(self._tables.get(name, []))


def test_sin_actividad_puede_eliminar():
    sb = _FakeSb({})
    r = evaluar_actividad_usuario(sb, 7)
    assert r["puede_eliminar"] is True
    assert r["bloqueantes"] == []
    assert "Sin actividad" in r["motivo"]


def test_con_so_registros_bloquea():
    sb = _FakeSb({"so_registros": [{"id": 1}]})
    r = evaluar_actividad_usuario(sb, 7)
    assert r["puede_eliminar"] is False
    assert any(b["tabla"] == "so_registros" for b in r["bloqueantes"])
    assert "No se puede eliminar" in mensaje_bloqueo_corto(r)


def test_solo_login_no_bloquea():
    sb = _FakeSb({"logs": [{"id": 1, "accion": "LOGIN", "modulo": "AUTH"}]})
    r = evaluar_actividad_usuario(sb, 7)
    assert r["puede_eliminar"] is True


def test_log_editar_bloquea():
    sb = _FakeSb({"logs": [{"id": 2, "accion": "EDITAR", "modulo": "PRESUPUESTO"}]})
    r = evaluar_actividad_usuario(sb, 7)
    assert r["puede_eliminar"] is False
    assert any(b["tabla"] == "logs" for b in r["bloqueantes"])
