"""Insert de ítems de solicitud con columnas ausentes (PGRST / migración)."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock


def _ensure_azure_stub() -> None:
    if "azure.storage.blob" in sys.modules:
        return
    try:
        import azure.storage.blob  # noqa: F401
        return
    except Exception:
        pass

    def mod(name: str):
        m = types.ModuleType(name)
        sys.modules[name] = m
        return m

    mod("azure")
    mod("azure.core")
    exc = mod("azure.core.exceptions")

    class ResourceExistsError(Exception):
        pass

    exc.ResourceExistsError = ResourceExistsError
    mod("azure.storage")
    blob = mod("azure.storage.blob")

    class BlobServiceClient:
        @staticmethod
        def from_connection_string(*_a, **_k):
            return None

    class ContentSettings:
        def __init__(self, **_k):
            pass

    class PublicAccess:
        Blob = "blob"

    blob.BlobServiceClient = BlobServiceClient
    blob.ContentSettings = ContentSettings
    blob.PublicAccess = PublicAccess


_ensure_azure_stub()

import almacen_service as svc  # noqa: E402


def test_pgrst_unknown_column_from_message():
    assert svc._pgrst_unknown_column(
        Exception(
            "Could not find the 'descripcion_solicitada' column of 'almacen_solicitud_item' in the schema cache"
        )
    ) == "descripcion_solicitada"
    assert svc._pgrst_unknown_column(
        Exception(
            '{"code":"42703","message":"column almacen_solicitud_item.descripcion_solicitada does not exist"}'
        )
    ) == "descripcion_solicitada"
    assert svc._pgrst_unknown_column(Exception("otro error")) is None


def test_insert_solicitud_items_batch_omite_columna_ausente():
    sb = MagicMock()
    calls = {"n": 0}

    class FakeExec:
        def execute(self):
            calls["n"] += 1
            if calls["n"] == 1:
                raise Exception(
                    "Could not find the 'descripcion_solicitada' column of "
                    "'almacen_solicitud_item' in the schema cache"
                )
            return MagicMock(data=[{"id": 1}])

    def insert(chunk):
        if calls["n"] >= 1:
            assert all("descripcion_solicitada" not in row for row in chunk)
        return FakeExec()

    sb.table.return_value.insert.side_effect = insert

    rows = [{
        "solicitud_id": 9,
        "presupuesto_id": 1,
        "material_descripcion": "Arena",
        "descripcion_solicitada": "Arena de río",
        "unidad": "M3",
        "cantidad": 2,
        "numero_linea": 1,
    }]
    svc._insert_solicitud_items_batch(sb, rows)
    assert calls["n"] == 2


def test_humanize_descripcion_solicitada():
    msg = svc._humanize_solicitud_db_error(
        Exception(
            "Could not find the 'descripcion_solicitada' column of "
            "'almacen_solicitud_item' in the schema cache"
        )
    )
    assert "descripcion_solicitada" in msg
    assert "almacen_solicitud_descripcion_solicitada.sql" in msg
