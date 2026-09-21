"""Tests — ensure ROL Administrativo en catálogo de roles (sin migración manual)."""
from __future__ import annotations

from unittest.mock import MagicMock

from roles_seed import ensure_rol_administrativo


class _FakeQuery:
    def __init__(self, store: list, fail_insert: bool = False):
        self._store = store
        self._fail_insert = fail_insert
        self._pending_insert = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def insert(self, payload):
        if self._fail_insert:
            raise RuntimeError("rls_denied")
        self._pending_insert = dict(payload)
        return self

    def execute(self):
        if self._pending_insert is not None:
            row = {"id": len(self._store) + 1, **self._pending_insert}
            self._store.append(row)
            self._pending_insert = None
            return MagicMock(data=[row])
        ordered = sorted(self._store, key=lambda r: (r.get("nombre") or "").lower())
        return MagicMock(data=list(ordered))


class _FakeSb:
    def __init__(self, store: list, fail_insert: bool = False):
        self._store = store
        self._fail_insert = fail_insert

    def table(self, name: str):
        assert name == "roles"
        return _FakeQuery(self._store, fail_insert=self._fail_insert)


def test_ensure_crea_rol_si_falta():
    store = [{"id": 1, "nombre": "Obra"}, {"id": 2, "nombre": "Interventoría"}]
    out = ensure_rol_administrativo(_FakeSb(store))
    nombres = {(r.get("nombre") or "").strip().lower() for r in out}
    assert "administrativo" in nombres
    assert any((r.get("nombre") or "") == "Administrativo" for r in store)


def test_ensure_idempotente_si_ya_existe():
    store = [
        {"id": 1, "nombre": "Administrativo"},
        {"id": 2, "nombre": "Obra"},
    ]
    out = ensure_rol_administrativo(_FakeSb(store))
    assert sum(1 for r in out if (r.get("nombre") or "").strip().lower() == "administrativo") == 1
    assert len(store) == 2


def test_ensure_case_insensitive():
    store = [{"id": 9, "nombre": "  administrativo "}]
    out = ensure_rol_administrativo(_FakeSb(store))
    assert len(out) == 1
    assert len(store) == 1


def test_ensure_no_rompe_si_insert_falla():
    store = [{"id": 1, "nombre": "Obra"}]
    out = ensure_rol_administrativo(_FakeSb(store, fail_insert=True))
    assert len(out) == 1
    assert all((r.get("nombre") or "").strip().lower() != "administrativo" for r in out)


def test_ensure_sb_none():
    assert ensure_rol_administrativo(None) == []
