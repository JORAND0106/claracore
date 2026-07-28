"""Persistencia de quien_dijo en ideas de acta (migración opcional)."""

from seguimiento_service import _SCHEMA_CAPS, _sync_ideas


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

    def eq(self, k, v):
        self._filters[k] = v
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def execute(self):
        if self.name == "seguimiento_acta_idea" and self._op == "select":
            rows = [r for r in self.store.get("ideas", []) if r.get("acta_id") == self._filters.get("acta_id")]
            return type("R", (), {"data": [{"id": r["id"]} for r in rows]})()
        if self.name == "seguimiento_item" and self._op == "select":
            return type("R", (), {"data": []})()
        if self._op == "insert":
            row = {**self._payload, "id": self.store.setdefault("_seq", 100) + 1}
            self.store["_seq"] = row["id"]
            self.store.setdefault("ideas", []).append(row)
            self.store["last_insert"] = row
            return type("R", (), {"data": [row]})()
        if self._op == "update":
            for r in self.store.get("ideas", []):
                if r.get("id") == self._filters.get("id"):
                    r.update(self._payload)
                    self.store["last_update"] = dict(r)
                    return type("R", (), {"data": [r]})()
            return type("R", (), {"data": []})()
        if self._op == "delete":
            return type("R", (), {"data": []})()
        return type("R", (), {"data": []})()


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeTable(name, self.store)


def test_sync_ideas_persists_quien_dijo(monkeypatch):
    store = {"ideas": [], "_seq": 10}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["idea_quien_dijo"] = True
    monkeypatch.setattr("seguimiento_service._schema_has", lambda *_a, **_k: True)

    _sync_ideas(sb, 7, [
        {"texto": "Mejorar drenaje", "quien_dijo": " Ana Pérez "},
    ])

    assert store["last_insert"]["texto"] == "Mejorar drenaje"
    assert store["last_insert"]["quien_dijo"] == "Ana Pérez"
    assert store["last_insert"]["acta_id"] == 7


def test_sync_ideas_acepta_alias_interviniente(monkeypatch):
    store = {"ideas": [], "_seq": 10}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["idea_quien_dijo"] = True
    monkeypatch.setattr("seguimiento_service._schema_has", lambda *_a, **_k: True)

    _sync_ideas(sb, 7, [
        {"texto": "Idea", "interviniente": " Luis Gómez "},
    ])

    assert store["last_insert"]["quien_dijo"] == "Luis Gómez"


def test_sync_ideas_omits_quien_cuando_schema_ausente(monkeypatch):
    store = {"ideas": [], "_seq": 10}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["idea_quien_dijo"] = False
    monkeypatch.setattr("seguimiento_service._schema_has", lambda *_a, **_k: False)
    monkeypatch.setattr("seguimiento_service._ensure_idea_quien_dijo_column", lambda _sb: False)

    _sync_ideas(sb, 7, [
        {"texto": "Idea", "quien_dijo": "Alguien"},
    ])

    assert "quien_dijo" not in store["last_insert"]
    assert store["last_insert"]["texto"] == "Idea"


def test_sync_ideas_reintenta_tras_ensure(monkeypatch):
    """Si el probe inicial falla pero ensure recupera la columna, se persiste quien_dijo."""
    store = {"ideas": [], "_seq": 10, "fail_quien_once": True}
    sb = _FakeSB(store)
    _SCHEMA_CAPS["idea_quien_dijo"] = False

    def schema_has(_sb, cap, force=False):
        return cap == "idea_quien_dijo" and not store.get("fail_quien_once")

    monkeypatch.setattr("seguimiento_service._schema_has", schema_has)
    monkeypatch.setattr("seguimiento_service._ensure_idea_quien_dijo_column", lambda _sb: True)
    monkeypatch.setattr(
        "seguimiento_service._is_missing_column_error",
        lambda exc, col: "quien_dijo" in str(exc).lower(),
    )

    orig_execute = _FakeTable.execute

    def execute_maybe_fail(self):
        if (
            self.name == "seguimiento_acta_idea"
            and self._op == "insert"
            and self._payload
            and "quien_dijo" in self._payload
            and store.get("fail_quien_once")
        ):
            store["fail_quien_once"] = False
            raise Exception("Could not find the 'quien_dijo' column of 'seguimiento_acta_idea' in the schema cache")
        return orig_execute(self)

    monkeypatch.setattr(_FakeTable, "execute", execute_maybe_fail)

    _sync_ideas(sb, 7, [
        {"texto": "Idea", "quien_dijo": "María"},
    ])

    assert store["last_insert"]["quien_dijo"] == "María"
