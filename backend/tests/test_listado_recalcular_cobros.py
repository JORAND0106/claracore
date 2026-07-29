"""Recálculo de costo directo desde Listado de Precios."""
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
        self._in_filters = {}
        self._payload = None
        self._op = "select"
        self._range = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def in_(self, key, values):
        self._in_filters[key] = list(values)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, a, b):
        self._range = (a, b)
        return self

    def limit(self, n):
        self._range = (0, n - 1)
        return self

    def execute(self):
        rows = list(self.store.setdefault(self.table, []))
        def match(r):
            for k, v in self._filters.items():
                if r.get(k) != v:
                    return False
            for k, vals in self._in_filters.items():
                if r.get(k) not in vals:
                    return False
            return True

        if self._op == "select":
            data = [r for r in rows if match(r)]
            if self._range is not None:
                a, b = self._range
                data = data[a : b + 1]
            return type("R", (), {"data": data})()
        if self._op == "update":
            data = []
            for r in rows:
                if match(r):
                    # Guard: never allow cantidad fields in patch
                    assert "cantidad_total" not in (self._payload or {})
                    assert "cant_total" not in (self._payload or {})
                    assert "cantidad" not in (self._payload or {})
                    r.update(self._payload)
                    data.append(dict(r))
            return type("R", (), {"data": data})()
        return type("R", (), {"data": []})()


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQuery(self.store, name)


@pytest.fixture()
def client(monkeypatch):
    import main
    from fastapi.testclient import TestClient

    store = {
        "listado_precios": [
            {
                "id": 7447,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "NP-016",
                "precio_unitario": 410054,
                "estado_precio": "Aprobado",
            }
        ],
        "ccd_firma_registro": [
            {"contrato_id": 1, "contexto_tipo": "acta_rpo", "contexto_id": 100, "slot": "aprobo"},
        ],
        "actas": [
            {"id": 100, "contrato_id": 1, "numero_rpo": 12},
            {"id": 101, "contrato_id": 1, "numero_rpo": 13},
        ],
        "so_registros": [
            {
                "id": 1,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "NP-016",
                "cantidad_total": 2.5,
                "vlr_unitario": 100000,
                "costo_directo": 250000,
                "acta_rpo_id": 101,  # no firmada
            },
            {
                "id": 2,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "NP-016",
                "cantidad_total": 1.0,
                "vlr_unitario": 100000,
                "costo_directo": 100000,
                "acta_rpo_id": 100,  # firmada → omitir
            },
            {
                "id": 3,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "OTRO",
                "cantidad_total": 9,
                "vlr_unitario": 1,
                "costo_directo": 9,
                "acta_rpo_id": None,
            },
        ],
        "presupuesto": [
            {
                "id": 10,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item": "NP-016",
                "cant_total": 3,
                "vlr_unitario": 100000,
                "costo_directo": 300000,
                "sellado": False,
                "dado_de_baja": False,
            },
            {
                "id": 11,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item": "NP-016",
                "cant_total": 4,
                "vlr_unitario": 100000,
                "costo_directo": 400000,
                "sellado": True,
                "dado_de_baja": False,
            },
        ],
        "cobro": [
            {
                "id": 20,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item": "NP-016",
                "cantidad": 1.5,
                "valor_unitario": 100000,
                "costo_directo": 150000,
                "acta": 13,
            },
            {
                "id": 21,
                "contrato_id": 1,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item": "NP-016",
                "cantidad": 1,
                "valor_unitario": 100000,
                "costo_directo": 100000,
                "acta": 12,  # firmada
            },
        ],
    }
    fake = _FakeSB(store)
    monkeypatch.setattr(main, "supabase", fake)
    monkeypatch.setattr(main, "supabase_execute", lambda fn, retries=3, delay=0.5: fn())
    monkeypatch.setattr(main, "_require_contract_access", lambda *a, **k: None)
    monkeypatch.setattr(main, "registrar_log", lambda *a, **k: None)

    app = main._fastapi_app
    app.dependency_overrides[main.get_current_user] = lambda: {
        "sub": "1",
        "cargo_nombre": "Desarrollador",
        "rol_nombre": "Desarrollador",
        "contrato_id": 1,
    }
    with TestClient(app) as c:
        yield c, store
    app.dependency_overrides.clear()


def test_recalcular_actualiza_costo_sin_tocar_cantidades_ni_firmadas(client):
    c, store = client
    r = c.post("/listado-precios/item/7447/recalcular")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["recalculados"] == 3  # so#1 + ppto#10 + cobro#20
    assert body["omitidos_acta_firmada"] >= 2
    assert body["omitidos_sellados"] == 1

    so1 = next(x for x in store["so_registros"] if x["id"] == 1)
    assert so1["cantidad_total"] == 2.5
    assert so1["vlr_unitario"] == 410054
    assert so1["costo_directo"] == round(2.5 * 410054)

    so2 = next(x for x in store["so_registros"] if x["id"] == 2)
    assert so2["vlr_unitario"] == 100000  # firmada intacta
    assert so2["costo_directo"] == 100000

    p10 = next(x for x in store["presupuesto"] if x["id"] == 10)
    assert p10["cant_total"] == 3
    assert p10["costo_directo"] == round(3 * 410054)

    p11 = next(x for x in store["presupuesto"] if x["id"] == 11)
    assert p11["costo_directo"] == 400000  # sellado

    c20 = next(x for x in store["cobro"] if x["id"] == 20)
    assert c20["cantidad"] == 1.5
    assert c20["costo_directo"] == round(1.5 * 410054)

    c21 = next(x for x in store["cobro"] if x["id"] == 21)
    assert c21["costo_directo"] == 100000


def test_recalcular_requiere_aprobado(client):
    c, store = client
    store["listado_precios"][0]["estado_precio"] = "Pendiente"
    r = c.post("/listado-precios/item/7447/recalcular")
    assert r.status_code == 400
    assert "Aprobado" in r.json()["detail"]
