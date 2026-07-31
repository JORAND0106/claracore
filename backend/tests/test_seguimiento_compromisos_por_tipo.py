"""Compromisos abiertos no mezclan actas internas y externas."""
from __future__ import annotations

from seguimiento_service import compromisos_abiertos_contrato


class _Resp:
    def __init__(self, data):
        self.data = data


class _FakeQ:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        return _Resp(self._rows)


class _FakeSB:
    def __init__(self, items, actas):
        self._items = items
        self._actas = actas

    def table(self, name):
        if name == "seguimiento_item":
            return _FakeQ(self._items)
        if name == "seguimiento_acta":
            return _FakeQ(self._actas)
        return _FakeQ([])


ITEMS = [
    {
        "id": 1,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 100,
        "titulo": "Compromiso interna",
        "fecha_vencimiento": "2026-08-01",
    },
    {
        "id": 2,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 200,
        "titulo": "Compromiso externa",
        "fecha_vencimiento": "2026-08-02",
    },
    {
        "id": 3,
        "contrato_id": 10,
        "origen": "compromiso",
        "estado_gestion": "abierto",
        "acta_id": 101,
        "titulo": "Otro interna",
        "fecha_vencimiento": "2026-08-03",
    },
]

ACTAS = [
    {"id": 100, "consecutivo": 1, "fecha_reunion": "2026-07-01", "tipo_acta": "interna", "orden_del_dia": "[]"},
    {"id": 200, "consecutivo": 2, "fecha_reunion": "2026-07-02", "tipo_acta": "externa", "orden_del_dia": "[]"},
    {"id": 101, "consecutivo": 3, "fecha_reunion": "2026-07-03", "tipo_acta": "interna", "orden_del_dia": "[]"},
]


def test_compromisos_abiertos_filtra_por_tipo_interna():
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert [r["id"] for r in out] == [1, 3]
    assert all(r["acta_tipo"] == "interna" for r in out)


def test_compromisos_abiertos_filtra_por_tipo_externa():
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="externa")
    assert [r["id"] for r in out] == [2]
    assert out[0]["acta_tipo"] == "externa"
    assert out[0]["acta_numero"] == "Acta Nº 2"


def test_compromisos_abiertos_excluye_acta_actual():
    sb = _FakeSB(ITEMS, ACTAS)
    out = compromisos_abiertos_contrato(sb, 10, excluir_acta_id=100, tipo_acta="interna")
    assert [r["id"] for r in out] == [3]


def test_compromisos_abiertos_legacy_sin_tipo_es_interna():
    actas = [
        {"id": 100, "consecutivo": 1, "fecha_reunion": "2026-07-01", "orden_del_dia": "[]"},
        {"id": 200, "consecutivo": 2, "fecha_reunion": "2026-07-02", "tipo_acta": "externa", "orden_del_dia": "[]"},
    ]
    sb = _FakeSB(ITEMS[:2], actas)
    out = compromisos_abiertos_contrato(sb, 10, tipo_acta="interna")
    assert [r["id"] for r in out] == [1]
