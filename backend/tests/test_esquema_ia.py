from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from esquema_ia_service import (
    MAX_USOS,
    compact_scene,
    fecha_bogota,
    leer_uso,
    parse_clara_json,
    registrar_uso,
    remaining_hoy,
    sanitize_objects,
)


def test_remaining_hoy_es_diario_de_20():
    assert MAX_USOS == 20
    assert remaining_hoy(0) == 20
    assert remaining_hoy(1) == 19
    assert remaining_hoy(20) == 0
    assert remaining_hoy(21) == 0


def test_fecha_bogota_cambia_de_dia_a_las_0_hora_colombia():
    tz = ZoneInfo("America/Bogota")
    before = datetime(2026, 9, 7, 23, 59, tzinfo=tz)
    after = datetime(2026, 9, 8, 0, 1, tzinfo=tz)
    assert str(fecha_bogota(before)) == "2026-09-07"
    assert str(fecha_bogota(after)) == "2026-09-08"


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self._op = "select"
        self._filters = {}
        self._payload = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def eq(self, key, value):
        self._filters[key] = value
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

    def execute(self):
        rows = self.store.setdefault(self.name, [])
        if self._op == "select":
            found = [
                r for r in rows
                if all(str(r.get(k)) == str(v) for k, v in self._filters.items())
            ]
            return _FakeResult(found)
        if self._op == "insert":
            rows.append(dict(self._payload))
            return _FakeResult([self._payload])
        if self._op == "update":
            for r in rows:
                if all(str(r.get(k)) == str(v) for k, v in self._filters.items()):
                    r.update(self._payload)
            return _FakeResult(rows)
        return _FakeResult([])


class _FakeSb:
    def __init__(self):
        self.store = {}

    def table(self, name):
        return _FakeTable(self.store, name)


def test_leer_uso_no_depende_del_documento():
    sb = _FakeSb()
    a = leer_uso(sb, 7)
    b = leer_uso(sb, 7)
    assert a["usos"] == 0
    assert a["remaining"] == 20
    assert a["blocked"] is False
    assert a["usos"] == b["usos"]


def test_registrar_uso_acumula_hasta_20_y_bloquea():
    sb = _FakeSb()
    last = None
    for i in range(20):
        last = registrar_uso(sb, 9)
        assert last["usos"] == i + 1
    assert last["remaining"] == 0
    assert last["blocked"] is True
    try:
        registrar_uso(sb, 9)
        raise AssertionError("debía bloquear el uso 21")
    except HTTPException as exc:
        assert exc.status_code == 429
        assert "mañana" in exc.detail.lower()



def test_sanitize_objects_keeps_shapes_drops_images():
    out = sanitize_objects([
        {"type": "rect", "x1": 0, "y1": 0, "x2": 60, "y2": 60, "color": "#1e293b"},
        {"type": "image", "fit": True},
        {"type": "texto", "x": 4, "y": 70, "text": "Alzado 2.00 m"},
    ])
    assert [o["type"] for o in out] == ["rect", "texto"]
    assert out[1]["text"].startswith("Alzado")


def test_parse_clara_json_strips_fences():
    raw = """```json
    {"title":"Caja","objects":[{"type":"rect","x1":40,"y1":40,"x2":100,"y2":100}],"hatches":[{"x":70,"y":70,"kind":6}]}
    ```"""
    parsed = parse_clara_json(raw)
    assert parsed["title"] == "Caja"
    assert parsed["objects"][0]["type"] == "rect"
    assert parsed["hatches"][0]["kind"] == 6


def test_compact_scene_drops_raster():
    scene = compact_scene([
        {"type": "image", "fit": True, "url": "x"},
        {"type": "linea", "x1": 0, "y1": 0, "x2": 10, "y2": 0},
        {"type": "hatchRegion", "x": 1, "y": 1, "w": 8, "h": 8, "hatch": 5, "maskDataUri": "data:xx"},
    ])
    assert [o["type"] for o in scene] == ["linea", "hatchRegion"]
    assert "maskDataUri" not in scene[1]
