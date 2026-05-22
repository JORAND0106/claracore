"""Fase 3A — helpers de versiones (sin Supabase)."""
import pytest

from prog_obra_service import BusinessRuleError, _assert_no_version_abierta


class _FakeQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._data})()


class _FakeSb:
    def __init__(self, open_rows):
        self._open_rows = open_rows

    def table(self, name):
        assert name == "prog_versiones"
        return _FakeQuery(self._open_rows)


def test_assert_no_version_abierta_ok():
    _assert_no_version_abierta(_FakeSb([]), 1)


def test_assert_no_version_abierta_bloquea_borrador():
    with pytest.raises(BusinessRuleError, match="borrador"):
        _assert_no_version_abierta(_FakeSb([{"id": "x", "estado": "borrador", "numero_version": 2}]), 1)
