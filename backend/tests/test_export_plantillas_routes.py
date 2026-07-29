"""HTTP: rutas de plantillas de exportación Excel (CRUD por usuario)."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiJ9.e30.x")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")


class _FakeQuery:
    def __init__(self, store, table):
        self.store = store
        self.table = table
        self._filters = {}
        self._payload = None
        self._op = "select"
        self._order_desc = False

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def order(self, *_a, **k):
        self._order_desc = bool(k.get("desc"))
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = self.store.setdefault(self.table, [])
        if self._op == "select":
            data = [r for r in rows if all(r.get(k) == v for k, v in self._filters.items())]
            if self._order_desc and data and "creada_en" in data[0]:
                data = sorted(data, key=lambda r: r.get("creada_en") or "", reverse=True)
            return type("R", (), {"data": data})()
        if self._op == "insert":
            row = dict(self._payload)
            row["id"] = max([r.get("id", 0) for r in rows] + [0]) + 1
            row.setdefault("creada_en", "2026-07-29T00:00:00Z")
            row.setdefault("actualizada_en", row["creada_en"])
            # unique name per usuario+modulo (case-insensitive)
            nom = str(row.get("nombre") or "").strip().lower()
            for r in rows:
                if (
                    r.get("usuario_id") == row.get("usuario_id")
                    and r.get("modulo") == row.get("modulo")
                    and str(r.get("nombre") or "").strip().lower() == nom
                ):
                    raise Exception("duplicate key value violates unique constraint uq_usuario_export_plantillas")
            rows.append(row)
            return type("R", (), {"data": [row]})()
        if self._op == "update":
            data = []
            for r in rows:
                if all(r.get(k) == v for k, v in self._filters.items()):
                    r.update(self._payload)
                    data.append(r)
            return type("R", (), {"data": data})()
        if self._op == "delete":
            keep = [r for r in rows if not all(r.get(k) == v for k, v in self._filters.items())]
            self.store[self.table] = keep
            return type("R", (), {"data": []})()
        return type("R", (), {"data": []})()


class _FakeSB:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _FakeQuery(self.store, name)


@pytest.fixture()
def client(monkeypatch):
    import main
    import export_plantillas_routes as epr
    from fastapi.testclient import TestClient

    fake = _FakeSB()
    monkeypatch.setattr(epr, "supabase", fake)
    app = main._fastapi_app
    app.dependency_overrides[main.get_current_user] = lambda: {
        "sub": "7",
        "cargo_nombre": "Desarrollador",
        "rol_nombre": "Desarrollador",
        "contrato_id": 1,
    }
    with TestClient(app) as c:
        yield c, fake
    app.dependency_overrides.clear()


def test_crear_listar_actualizar_eliminar_export_plantilla(client):
    c, fake = client

    r = c.post(
        "/export-plantillas/",
        json={"modulo": "sicoe_obra", "nombre": "Plantilla 1", "campos": ["capitulo", "item_numero", "capitulo"]},
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["nombre"] == "Plantilla 1"
    assert created["campos"] == ["capitulo", "item_numero"]
    assert created["usuario_id"] == 7
    pid = created["id"]

    r2 = c.get("/export-plantillas/?modulo=sicoe_obra")
    assert r2.status_code == 200
    assert len(r2.json()) == 1

    r3 = c.put(
        f"/export-plantillas/{pid}",
        json={"nombre": "Plantilla A", "campos": ["tramo", "margen"]},
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["nombre"] == "Plantilla A"
    assert r3.json()["campos"] == ["tramo", "margen"]

    r4 = c.delete(f"/export-plantillas/{pid}")
    assert r4.status_code == 200
    assert r4.json()["ok"] is True
    assert fake.store.get("usuario_export_plantillas") == []


def test_crear_export_plantilla_requiere_campos(client):
    c, _fake = client
    r = c.post("/export-plantillas/", json={"modulo": "sicoe_obra", "nombre": "Vacía", "campos": []})
    assert r.status_code == 422


def test_export_plantilla_otro_usuario_no_ve(client, monkeypatch):
    c, fake = client
    fake.store["usuario_export_plantillas"] = [
        {
            "id": 1,
            "usuario_id": 99,
            "modulo": "sicoe_obra",
            "nombre": "Ajena",
            "campos": ["capitulo"],
            "creada_en": "2026-07-29T00:00:00Z",
            "actualizada_en": "2026-07-29T00:00:00Z",
        }
    ]
    r = c.get("/export-plantillas/?modulo=sicoe_obra")
    assert r.status_code == 200
    assert r.json() == []
