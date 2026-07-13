"""Consecutivos de entrada y disposición: reutilización solo al eliminar el máximo."""

import pytest

from almacen_service import (
    _format_numero_documento,
    _max_consecutivo,
    _max_numero_disposicion,
    _next_consecutivo,
    _next_numero_disposicion,
    _parse_consecutivo_numero_documento,
)


@pytest.fixture(autouse=True)
def _segmento_contrato_1614(monkeypatch):
    monkeypatch.setattr(
        "catalogo_insumos_service.contrato_codigo_segment",
        lambda _cid: "1614",
    )


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_cols):
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        class _R:
            data = self._rows
        return _R()


class _FakeSb:
    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table

    def table(self, name):
        return _FakeQuery(self.rows_by_table.get(name, []))


def _fake_sb_disposicion(rows):
    return _FakeSb({
        "almacen_entrada": rows,
        "contratos": [{"numero": "ICCU-CTO-1614-2025"}],
    })


def test_next_entrada_tras_eliminar_ultimo(monkeypatch):
    sb = _FakeSb({"almacen_entrada": [{"numero_entrada": 3}]})
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _max_consecutivo(1, "almacen_entrada", "numero_entrada") == 3
    assert _next_consecutivo(1, "almacen_entrada", "numero_entrada") == 4


def test_next_entrada_no_reutiliza_hueco_intermedio(monkeypatch):
    sb = _FakeSb({"almacen_entrada": [{"numero_entrada": 4}]})
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _next_consecutivo(1, "almacen_entrada", "numero_entrada") == 5


def test_parse_numero_documento_formato_contrato():
    assert _parse_consecutivo_numero_documento(1, "1614-00003") == 3
    assert _parse_consecutivo_numero_documento(1, "00003") == 3


def test_format_numero_documento(monkeypatch):
    sb = _FakeSb({"contratos": [{"numero": "ICCU-CTO-1614-2025"}]})
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _format_numero_documento(1, 1) == "1614-00001"


def test_next_disposicion_tras_eliminar_ultimo(monkeypatch):
    sb = _fake_sb_disposicion([
        {"numero_documento": "1614-00001"},
        {"numero_documento": "1614-00002"},
        {"numero_documento": "1614-00003"},
    ])
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _max_numero_disposicion(1) == 3
    assert _next_numero_disposicion(1) == "1614-00004"


def test_next_disposicion_no_reutiliza_hueco(monkeypatch):
    sb = _fake_sb_disposicion([
        {"numero_documento": "1614-00001"},
        {"numero_documento": "1614-00003"},
        {"numero_documento": "1614-00004"},
    ])
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _max_numero_disposicion(1) == 4
    assert _next_numero_disposicion(1) == "1614-00005"


def test_next_disposicion_compatibilidad_legacy(monkeypatch):
    sb = _fake_sb_disposicion([
        {"numero_documento": "00001"},
        {"numero_documento": "00002"},
    ])
    monkeypatch.setattr("almacen_service._sb", lambda: sb)
    assert _max_numero_disposicion(1) == 2
    assert _next_numero_disposicion(1) == "1614-00003"
