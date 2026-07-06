"""Liberación condicional de consecutivos al eliminar documentos y órdenes de pago."""

from unittest.mock import MagicMock

import pytest

from contrato_documentos_service import (
    eliminar_documento_contractual,
    max_version_num,
    next_version_num,
)
from contrato_orden_pago_service import (
    eliminar_orden_pago,
    max_numero_corte,
    next_numero_corte,
)


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self._filters = []

    def select(self, *_cols):
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        return MagicMock(data=self._rows)


class _FakeDeleteQuery:
    def __init__(self, sb, table):
        self._sb = sb
        self._table = table

    def eq(self, *_args):
        return self

    def execute(self):
        self._sb.deleted.append(self._table)
        return MagicMock(data=[])


class _FakeSb:
    def __init__(self, select_rows_by_table=None):
        self.select_rows_by_table = select_rows_by_table or {}
        self.deleted = []

    def table(self, name):
        if name in self.deleted or name.endswith("_delete"):
            return _FakeDeleteQuery(self, name)
        rows = self.select_rows_by_table.get(name, [])
        chain = _FakeQuery(rows)

        class _Table:
            select = staticmethod(lambda *a, **k: chain.select(*a))
            eq = staticmethod(lambda *a, **k: chain)
            order = staticmethod(lambda *a, **k: chain)
            limit = staticmethod(lambda *a, **k: chain)
            delete = staticmethod(lambda: _FakeDeleteQuery(self, name))

        return _Table()


def test_next_version_num_tras_maximo(monkeypatch):
    sb = _FakeSb({"contrato_documento_contractual": [{"version_num": 3}]})
    assert max_version_num(sb, 1, "generado") == 3
    assert next_version_num(sb, 1, "generado") == 4


def test_next_numero_corte_tras_maximo():
    sb = _FakeSb({"contrato_orden_pago": [{"numero_corte": 2}]})
    assert max_numero_corte(sb, 5) == 2
    assert next_numero_corte(sb, 5) == 3


def test_eliminar_documento_liberado_si_es_max(monkeypatch):
    sb = _FakeSb()
    doc = {
        "id": 10,
        "contrato_id": 1,
        "tipo": "generado",
        "version_num": 4,
        "azure_blob_path": "path/doc.pdf",
    }

    monkeypatch.setattr(
        "contrato_documentos_service.assert_contrato_exists", lambda _sb, _cid: None
    )
    monkeypatch.setattr(
        "contrato_documentos_service.get_documento", lambda _sb, _did, _cid: doc
    )
    monkeypatch.setattr(
        "contrato_documentos_service.max_version_num", lambda _sb, _cid, _t: 4
    )
    monkeypatch.setattr(
        "contrato_documentos_service.next_version_num", lambda _sb, _cid, _t: 4
    )
    monkeypatch.setattr(
        "contrato_documentos_service.touch_doc_contractual_updated_at",
        lambda _sb, _cid: None,
    )
    monkeypatch.setattr("azure_blob_storage.delete_blob_private", lambda _p: None)

    result = eliminar_documento_contractual(sb, 10, 1)
    assert result["consecutivo_liberado"] is True
    assert result["version_num"] == 4
    assert result["proximo_consecutivo"] == 4
    assert "contrato_documento_contractual" in sb.deleted


def test_eliminar_documento_no_liberado_si_es_intermedio(monkeypatch):
    sb = _FakeSb()
    doc = {
        "id": 11,
        "contrato_id": 1,
        "tipo": "generado",
        "version_num": 3,
        "azure_blob_path": "",
    }

    monkeypatch.setattr(
        "contrato_documentos_service.assert_contrato_exists", lambda _sb, _cid: None
    )
    monkeypatch.setattr(
        "contrato_documentos_service.get_documento", lambda _sb, _did, _cid: doc
    )
    monkeypatch.setattr(
        "contrato_documentos_service.max_version_num", lambda _sb, _cid, _t: 4
    )
    monkeypatch.setattr(
        "contrato_documentos_service.next_version_num", lambda _sb, _cid, _t: 5
    )
    monkeypatch.setattr(
        "contrato_documentos_service.touch_doc_contractual_updated_at",
        lambda _sb, _cid: None,
    )

    result = eliminar_documento_contractual(sb, 11, 1)
    assert result["consecutivo_liberado"] is False
    assert result["proximo_consecutivo"] == 5


def test_eliminar_orden_liberado_si_es_max(monkeypatch):
    sb = _FakeSb()
    orden = {
        "id": 7,
        "contrato_id": 2,
        "numero_corte": 4,
        "azure_blob_path": "ordenes/x.pdf",
    }

    monkeypatch.setattr(
        "contrato_orden_pago_service.assert_contrato_exists", lambda _sb, _cid: None
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.get_orden_pago", lambda _sb, _oid, _cid: orden
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.max_numero_corte", lambda _sb, _cid: 4
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.next_numero_corte", lambda _sb, _cid: 4
    )
    monkeypatch.setattr("azure_blob_storage.delete_blob_private", lambda _p: None)

    result = eliminar_orden_pago(sb, 7, 2)
    assert result["consecutivo_liberado"] is True
    assert result["numero_corte"] == 4
    assert result["proximo_numero_corte"] == 4
    assert "contrato_orden_pago" in sb.deleted


def test_eliminar_orden_no_liberado_si_es_intermedio(monkeypatch):
    sb = _FakeSb()
    orden = {
        "id": 8,
        "contrato_id": 2,
        "numero_corte": 3,
        "azure_blob_path": "",
    }

    monkeypatch.setattr(
        "contrato_orden_pago_service.assert_contrato_exists", lambda _sb, _cid: None
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.get_orden_pago", lambda _sb, _oid, _cid: orden
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.max_numero_corte", lambda _sb, _cid: 4
    )
    monkeypatch.setattr(
        "contrato_orden_pago_service.next_numero_corte", lambda _sb, _cid: 5
    )

    result = eliminar_orden_pago(sb, 8, 2)
    assert result["consecutivo_liberado"] is False
    assert result["proximo_numero_corte"] == 5
