"""Registro automático de hora_inicio / hora_fin en actas."""

from seguimiento_service import (
    _SCHEMA_CAPS,
    _maybe_set_acta_hora_inicio,
    _touch_acta_hora_fin,
)


class _FakeTable:
    def __init__(self, name, store):
        self.name = name
        self.store = store
        self._op = None
        self._payload = None
        self._filters = {}

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, k, v):
        self._filters[k] = v
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self.name == "seguimiento_acta" and self._op == "select":
            rows = [r for r in self.store.get("actas", []) if r.get("id") == self._filters.get("id")]
            return type("R", (), {"data": rows})()
        if self.name == "seguimiento_acta" and self._op == "update":
            for r in self.store.get("actas", []):
                if r.get("id") == self._filters.get("id"):
                    r.update(self._payload)
                    self.store["last_update"] = dict(r)
                    return type("R", (), {"data": [r]})()
            return type("R", (), {"data": []})()
        return type("R", (), {"data": []})()


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeTable(name, self.store)


def test_hora_inicio_solo_primera_vez(monkeypatch):
    store = {"actas": [{"id": 7, "hora_inicio": None, "hora_fin": None}]}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["acta_horas_reunion"] = True
    monkeypatch.setattr("seguimiento_service._schema_has", lambda *_a, **_k: True)
    monkeypatch.setattr("seguimiento_service._ensure_acta_horas_reunion_columns", lambda _sb: True)
    monkeypatch.setattr("seguimiento_service._hora_ahora_bogota", lambda: "09:05")

    _maybe_set_acta_hora_inicio(sb, 7)
    assert store["actas"][0]["hora_inicio"] == "09:05"

    monkeypatch.setattr("seguimiento_service._hora_ahora_bogota", lambda: "10:00")
    _maybe_set_acta_hora_inicio(sb, 7)
    assert store["actas"][0]["hora_inicio"] == "09:05"


def test_hora_fin_se_actualiza(monkeypatch):
    store = {"actas": [{"id": 7, "hora_inicio": "08:00", "hora_fin": "08:30"}]}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["acta_horas_reunion"] = True
    monkeypatch.setattr("seguimiento_service._schema_has", lambda *_a, **_k: True)
    monkeypatch.setattr("seguimiento_service._ensure_acta_horas_reunion_columns", lambda _sb: True)
    monkeypatch.setattr("seguimiento_service._hora_ahora_bogota", lambda: "11:22")

    _touch_acta_hora_fin(sb, 7)
    assert store["actas"][0]["hora_fin"] == "11:22"
