"""Eliminar un precio del listado solo si no tiene presupuesto ni cobrados."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("SUPABASE_URL", "https://xxxx.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiJ9.e30.x")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")

from listado_precios_eliminar import clasificar_uso_precio


def _aprobado(row):
    return (row.get("nivel3_estado") or "").strip() == "Aprobado"


def test_clasificar_separa_presupuesto_y_cobrados():
    precio = {
        "id": 7,
        "capitulo": "2. OBRA",
        "competencia": "IDU",
        "item_numero": "4.22.",
    }
    uso = clasificar_uso_precio(
        precio,
        [
            {
                "id": 10,
                "tipo_ejecucion": "Presupuesto de Obra",
                "dado_de_baja": False,
                "capitulo": "2.OBRA",
                "competencia": "IDU",
                "item": "4.22",
                "pk_id": "K1+200",
                "tramo": "2",
                "cant_total": 12.5,
                "und": "M3",
                "descripcion": "Excavación",
            },
            {
                "id": 11,
                "tipo_ejecucion": "Obra Ejecutada",
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item": "4.22",
                "cant_total": 3,
                "pk_id": "K1+200",
            },
            {
                "id": 12,
                "tipo_ejecucion": "Presupuesto de Obra",
                "dado_de_baja": True,
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item": "4.22",
                "cant_total": 99,
            },
            {
                "id": 13,
                "tipo_ejecucion": "Presupuesto de Obra",
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item": "9.9",
                "cant_total": 1,
            },
        ],
        [
            {
                "id": 20,
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item_numero": "4.22",
                "cantidad_total": 4,
                "nivel3_estado": "Aprobado",
                "pk_id_id": 5,
                "_pk_label": "120367",
                "acta_rpo_id": 8,
                "_acta_label": "14",
                "reporte_id": 3,
                "numero_registro": "R-3",
                "tramo": "2",
            },
            {
                "id": 21,
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item_numero": "4.22",
                "cantidad_total": 8,
                "nivel3_estado": "Pendiente",
            },
        ],
        [
            {
                "id": 30,
                "capitulo": "2. OBRA",
                "competencia": "IDU",
                "item": "4.22",
                "cantidad": 1.5,
                "pk_id": "K1+200",
                "acta": 14,
                "registro": "CB-1",
                "abs_inicial": "0",
                "abs_final": "10",
            }
        ],
        es_cobrado=_aprobado,
    )
    assert uso["puede_eliminar"] is False
    assert [r["id"] for r in uso["presupuesto"]] == [10, 11]
    assert uso["presupuesto"][0]["tipo"] == "Presupuesto de Obra"
    assert uso["presupuesto"][0]["pk"] == "K1+200"
    assert uso["presupuesto"][1]["tipo"] == "Obra Ejecutada"
    assert [r["id"] for r in uso["cobrados"]] == [20, 30]
    assert uso["cobrados"][0]["origen"] == "sicoe"
    assert uso["cobrados"][0]["pk"] == "120367"
    assert uso["cobrados"][0]["acta"] == "14"
    assert uso["cobrados"][1]["origen"] == "cobro"
    assert uso["cobrados"][1]["registro"] == "CB-1"
    assert uso["cobrados"][1]["abs_inicio"] == "0"


def test_clasificar_sin_uso_permite_eliminar():
    uso = clasificar_uso_precio(
        {"item_numero": "1.1", "capitulo": "1.", "competencia": "IDU"},
        [],
        [{"id": 1, "item_numero": "1.1", "capitulo": "1.", "competencia": "IDU", "nivel3_estado": "Pendiente", "cantidad_total": 5}],
        [],
        es_cobrado=_aprobado,
    )
    assert uso["puede_eliminar"] is True
    assert uso["presupuesto_total"] == 0
    assert uso["cobrados_total"] == 0


class _Result:
    def __init__(self, data):
        self.data = data


class _FakeQuery:
    def __init__(self, store, table):
        self.store = store
        self.table = table
        self._filters = {}
        self._in_filters = {}
        self._op = "select"
        self._range = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def in_(self, key, values):
        self._in_filters[key] = list(values)
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._range = (0, n - 1)
        return self

    def _match(self, row):
        for key, value in self._filters.items():
            if row.get(key) != value:
                return False
        for key, values in self._in_filters.items():
            if row.get(key) not in values:
                return False
        return True

    def execute(self):
        rows = list(self.store.setdefault(self.table, []))
        if self._op == "delete":
            kept = []
            removed = []
            for row in rows:
                if self._match(row):
                    removed.append(row)
                else:
                    kept.append(row)
            self.store[self.table] = kept
            return _Result(removed)
        data = [row for row in rows if self._match(row)]
        if self._range is not None:
            start, end = self._range
            data = data[start : end + 1]
        return _Result(data)


class _FakeSB:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQuery(self.store, name)


def _precio(pid, item, capitulo="1. PRELIMINARES", competencia="IDU"):
    return {
        "id": pid,
        "contrato_id": 1,
        "capitulo": capitulo,
        "competencia": competencia,
        "item_numero": item,
        "descripcion": f"Precio {item}",
        "unidad": "M3",
        "precio_unitario": 1500,
        "estado_precio": "Aprobado",
    }


@pytest.fixture()
def client(monkeypatch):
    import main
    from fastapi.testclient import TestClient

    store = {
        "listado_precios": [
            _precio(1, "LIBRE"),
            _precio(2, "CON-PPTO"),
            _precio(3, "CON-COBRO"),
        ],
        "presupuesto": [
            {
                "id": 10,
                "contrato_id": 1,
                "tipo_ejecucion": "Presupuesto de Obra",
                "dado_de_baja": False,
                "capitulo": "1.PRELIMINARES",
                "competencia": "IDU",
                "item": "CON-PPTO",
                "descripcion": "Ítem de obra",
                "und": "M3",
                "pk_id": "K0+100",
                "id_pol": "POL-9",
                "tramo": "1",
                "calzada": "Derecha",
                "abs_inicio": "0+000",
                "abs_final": "0+050",
                "cant_total": 6,
            },
            {
                "id": 11,
                "contrato_id": 1,
                "tipo_ejecucion": "Obra Ejecutada",
                "dado_de_baja": False,
                "capitulo": "1. PRELIMINARES",
                "competencia": "IDU",
                "item": "CON-PPTO",
                "pk_id": "K0+180",
                "tramo": "1",
                "cant_total": 2,
                "und": "M3",
            },
            {
                "id": 12,
                "contrato_id": 1,
                "tipo_ejecucion": "Presupuesto de Obra",
                "dado_de_baja": True,
                "capitulo": "1. PRELIMINARES",
                "competencia": "IDU",
                "item": "LIBRE",
                "cant_total": 40,
            },
        ],
        "so_registros": [
            {
                "id": 20,
                "contrato_id": 1,
                "capitulo": "1. PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "CON-COBRO",
                "item_descripcion": "Capa cobrada",
                "unidad": "M3",
                "cantidad_total": 4.25,
                "nivel3_estado": "Aprobado",
                "pk_id_id": 55,
                "acta_rpo_id": 70,
                "reporte_id": 8,
                "numero_registro": "15",
                "tramo": "3",
                "abs_inicio": 10,
                "abs_final": 20,
            },
            {
                "id": 21,
                "contrato_id": 1,
                "capitulo": "1. PRELIMINARES",
                "competencia": "IDU",
                "item_numero": "CON-COBRO",
                "cantidad_total": 9,
                "nivel3_estado": "Pendiente",
            },
        ],
        "cobro": [
            {
                "id": 30,
                "contrato_id": 1,
                "capitulo": "1. PRELIMINARES",
                "competencia": "IDU",
                "item": "CON-COBRO",
                "cantidad": 1.25,
                "pk_id": "K2+000",
                "acta": 6,
                "registro": "CB-6",
                "tramo": "3",
                "abs_inicial": "100",
                "abs_final": "120",
                "und": "M3",
            }
        ],
        "pk_ids": [{"id": 55, "pk_id": "120367"}],
        "actas": [{"id": 70, "numero_rpo": 6}],
    }
    logs = []
    main._NIVELES_ACTIVOS_CACHE.pop(1, None)
    monkeypatch.setattr(main, "supabase", _FakeSB(store))
    monkeypatch.setattr(main, "supabase_execute", lambda fn, retries=3, delay=0.5: fn())
    monkeypatch.setattr(main, "registrar_log", lambda *a, **k: logs.append((a, k)))

    app = main._fastapi_app
    app.dependency_overrides[main.get_current_user] = lambda: {
        "sub": "1",
        "nombre": "Ana Dev",
        "cargo_nombre": "Desarrollador",
        "rol_nombre": "Desarrollador",
        "contrato_id": 1,
    }
    with TestClient(app) as http:
        yield http, store, logs
    app.dependency_overrides.clear()


def _ids(table, store):
    return [row["id"] for row in store[table]]


def test_elimina_precio_sin_uso_y_guarda_respaldo(client):
    http, store, logs = client
    antes_ppto = list(store["presupuesto"])
    antes_sicoe = list(store["so_registros"])
    antes_cobro = list(store["cobro"])

    uso = http.get("/listado-precios/item/1/uso")
    assert uso.status_code == 200, uso.text
    assert uso.json()["puede_eliminar"] is True
    assert uso.json()["presupuesto_total"] == 0
    assert uso.json()["cobrados_total"] == 0

    deleted = http.delete("/listado-precios/item/1")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["ok"] is True
    assert 1 not in _ids("listado_precios", store)
    assert store["presupuesto"] == antes_ppto
    assert store["so_registros"] == antes_sicoe
    assert store["cobro"] == antes_cobro

    assert logs, "la eliminación debe quedar en el log"
    args, kwargs = logs[-1]
    assert args[1] == "ELIMINAR"
    assert args[2] == "PRECIOS"
    assert args[3] == "listado_precios"
    assert kwargs["valor_anterior"]["item_numero"] == "LIBRE"
    assert kwargs["valor_anterior"]["precio_unitario"] == 1500
    assert kwargs["valor_anterior"]["descripcion"] == "Precio LIBRE"
    assert kwargs["valor_nuevo"] == {"deleted": True, "id": 1}


def test_no_elimina_precio_con_cantidades_en_presupuesto(client):
    http, store, logs = client
    response = http.delete("/listado-precios/item/2")
    assert response.status_code == 409, response.text
    body = response.json()["detail"]
    assert body["code"] == "precio_en_uso"
    assert body["puede_eliminar"] is False
    assert 2 in _ids("listado_precios", store)
    assert logs == []

    tipos = [row["tipo"] for row in body["presupuesto"]]
    assert tipos == ["Presupuesto de Obra", "Obra Ejecutada"]
    obra = body["presupuesto"][0]
    assert obra["id"] == 10
    assert obra["pk"] == "K0+100"
    assert obra["id_pol"] == "POL-9"
    assert obra["tramo"] == "1"
    assert obra["calzada"] == "Derecha"
    assert obra["cantidad"] == 6
    assert obra["abs_inicio"] == "0+000"
    ejecutada = body["presupuesto"][1]
    assert ejecutada["id"] == 11
    assert ejecutada["pk"] == "K0+180"
    assert body["cobrados"] == []
    assert body["presupuesto_total"] == 2

    consulta = http.get("/listado-precios/item/2/uso")
    assert consulta.status_code == 200
    assert [row["id"] for row in consulta.json()["presupuesto"]] == [10, 11]


def test_no_elimina_precio_con_cantidades_cobradas(client):
    http, store, logs = client
    response = http.delete("/listado-precios/item/3")
    assert response.status_code == 409, response.text
    body = response.json()["detail"]
    assert body["code"] == "precio_en_uso"
    assert 3 in _ids("listado_precios", store)
    assert body["presupuesto"] == []
    assert logs == []

    origenes = [(row["origen"], row["id"]) for row in body["cobrados"]]
    assert origenes == [("sicoe", 20), ("cobro", 30)]
    sicoe = body["cobrados"][0]
    assert sicoe["tipo"] == "Cantidad cobrada"
    assert sicoe["pk"] == "120367"
    assert sicoe["acta"] == "6"
    assert sicoe["reporte_id"] == 8
    assert sicoe["numero_registro"] == "15"
    assert sicoe["cantidad"] == 4.25
    assert sicoe["tramo"] == "3"
    cobro = body["cobrados"][1]
    assert cobro["tipo"] == "Cobro"
    assert cobro["registro"] == "CB-6"
    assert cobro["acta"] == "6"
    assert cobro["pk"] == "K2+000"
    assert cobro["cantidad"] == 1.25
    assert body["cobrados_total"] == 2


def test_sin_permiso_no_elimina(client, monkeypatch):
    import main

    http, store, logs = client
    monkeypatch.setattr(main, "_cargo_tiene_permiso_funcion", lambda *a, **k: False)
    response = http.delete("/listado-precios/item/1")
    assert response.status_code == 403
    assert 1 in _ids("listado_precios", store)
    assert logs == []
