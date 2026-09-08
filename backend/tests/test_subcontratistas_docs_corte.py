"""Tests puros: checklist documental y bloqueo de generación de cortes.

Importa funciones de forma diferida / con mocks para no requerir Azure SDK.
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch
import importlib
import sys
import types


def _install_azure_stubs():
    """Permite importar subcontratistas_docs_service sin azure-storage-blob."""
    if "azure" in sys.modules:
        return
    azure = types.ModuleType("azure")
    azure_core = types.ModuleType("azure.core")
    azure_core_exc = types.ModuleType("azure.core.exceptions")
    azure_core_exc.ResourceExistsError = type("ResourceExistsError", (Exception,), {})
    azure_storage = types.ModuleType("azure.storage")
    azure_storage_blob = types.ModuleType("azure.storage.blob")

    class _Dummy:
        def __init__(self, *a, **k):
            pass

    azure_storage_blob.BlobServiceClient = _Dummy
    azure_storage_blob.ContentSettings = _Dummy
    sys.modules["azure"] = azure
    sys.modules["azure.core"] = azure_core
    sys.modules["azure.core.exceptions"] = azure_core_exc
    sys.modules["azure.storage"] = azure_storage
    sys.modules["azure.storage.blob"] = azure_storage_blob


_install_azure_stubs()

# Stub azure_blob_storage before importing service
_fake_abs = types.ModuleType("azure_blob_storage")
_fake_abs.delete_blob_private = MagicMock()
_fake_abs.download_blob_bytes_private = MagicMock(return_value=b"x")
_fake_abs.path_subcontratista_documento = MagicMock(return_value="path/doc")
_fake_abs.path_subcontratista_poliza = MagicMock(return_value="path/poliza")
_fake_abs.upload_blob_private = MagicMock()
sys.modules["azure_blob_storage"] = _fake_abs

svc = importlib.import_module("subcontratistas_docs_service")


def test_periodo_corte_usa_fecha_inicio():
    assert svc.periodo_corte("2026-03-16", "2026-03-31") == "2026-03"
    assert svc.periodo_corte(date(2026, 12, 1)) == "2026-12"


def test_defaults_alerta_30_y_15():
    assert svc.DEFAULT_DIAS_ALERTA == (30, 15)


class _FakeTable:
    def __init__(self, store, name):
        self.store = store
        self.name = name
        self._filters = []
        self._ops = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, k, v):
        self._filters.append(("eq", k, v))
        return self

    def is_(self, k, v):
        self._filters.append(("is", k, v))
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def lte(self, *_a, **_k):
        return self

    def lt(self, *_a, **_k):
        return self

    def update(self, payload):
        self._ops["update"] = payload
        return self

    def insert(self, row):
        self._ops["insert"] = row
        rows = self.store.setdefault(self.name, [])
        row = dict(row)
        row.setdefault("id", len(rows) + 1)
        rows.append(row)
        self._last = [row]
        return self

    def execute(self):
        rows = list(self.store.get(self.name, []))
        for op, k, v in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(k) == v]
            elif op == "is" and v == "null":
                rows = [r for r in rows if not r.get(k)]
        return type("R", (), {"data": rows})()


class _FakeSb:
    def __init__(self, store=None):
        self.store = store or {}

    def table(self, name):
        return _FakeTable(self.store, name)


def test_checklist_falla_sin_docs():
    sb = _FakeSb({"subcontratista_documentos": []})
    chk = svc.checklist_docs_corte(sb, 1, fecha_inicio="2026-09-01", fecha_fin="2026-09-15")
    assert chk["ok"] is False
    assert set(chk["faltantes"]) == {"contrato_firmado", "propuesta_economica", "seguridad_social"}
    assert chk["periodo_seguridad_social"] == "2026-09"


def test_checklist_ok_con_tres_docs():
    docs = [
        {"id": 1, "subcontratista_id": 5, "tipo": "contrato_firmado", "vigente": True, "eliminado_en": None},
        {"id": 2, "subcontratista_id": 5, "tipo": "propuesta_economica", "vigente": True, "eliminado_en": None},
        {
            "id": 3,
            "subcontratista_id": 5,
            "tipo": "seguridad_social",
            "periodo": "2026-09",
            "vigente": True,
            "eliminado_en": None,
        },
    ]
    sb = _FakeSb({"subcontratista_documentos": docs})
    ok, chk = svc.puede_generar_corte_automatico(sb, 5, fecha_inicio="2026-09-01", fecha_fin="2026-09-15")
    assert ok is True
    assert chk["ok"] is True
    assert chk["faltantes"] == []


def test_ss_historica_otro_periodo_no_habilita():
    docs = [
        {"id": 1, "subcontratista_id": 5, "tipo": "contrato_firmado", "vigente": True, "eliminado_en": None},
        {"id": 2, "subcontratista_id": 5, "tipo": "propuesta_economica", "vigente": True, "eliminado_en": None},
        {
            "id": 3,
            "subcontratista_id": 5,
            "tipo": "seguridad_social",
            "periodo": "2026-08",
            "vigente": True,
            "eliminado_en": None,
        },
    ]
    sb = _FakeSb({"subcontratista_documentos": docs})
    chk = svc.checklist_docs_corte(sb, 5, fecha_inicio="2026-09-01")
    assert chk["seguridad_social"] is False
    assert "seguridad_social" in chk["faltantes"]


def test_contrato_no_vigente_no_cuenta():
    docs = [
        {"id": 1, "subcontratista_id": 5, "tipo": "contrato_firmado", "vigente": False, "eliminado_en": None},
    ]
    sb = _FakeSb({"subcontratista_documentos": docs})
    assert svc.tiene_documento_vigente(sb, 5, "contrato_firmado") is False


def test_resumen_alerta_poliza_vencida():
    ayer = (date.today() - timedelta(days=2)).isoformat()
    store = {
        "subcontratista_polizas": [
            {
                "id": 1,
                "subcontratista_id": 9,
                "tipo": "garantia",
                "tipo_otro_texto": None,
                "fecha_vencimiento": ayer,
                "estado": "vigente",
                "created_at": "2026-01-01",
            }
        ]
    }
    sb = _FakeSb(store)
    r = svc.resumen_alerta_polizas_sub(sb, 9, {"dias_alerta_1": 30, "dias_alerta_2": 15})
    assert r["nivel"] == "vencida"
