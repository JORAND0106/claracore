"""Interruptor Bitácora↔RRHH (apagada_en) + soft-delete documento."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

for _name in (
    "azure",
    "azure.core",
    "azure.core.exceptions",
    "azure.storage",
    "azure.storage.blob",
):
    sys.modules.setdefault(_name, MagicMock())

_fake_abs = types.ModuleType("azure_blob_storage")
_fake_abs.delete_blob_private = lambda *a, **k: None
_fake_abs.download_blob_bytes_private = lambda *a, **k: b""
_fake_abs.upload_blob_private = lambda *a, **k: None
_fake_abs.path_rrhh_doc_consolidado = lambda *a, **k: "p"
_fake_abs.path_rrhh_contrato_laboral = lambda *a, **k: "p"
_fake_abs.path_rrhh_trabajador_documento = lambda *a, **k: "p"
sys.modules["azure_blob_storage"] = _fake_abs
sys.modules.pop("rrhh_docs_service", None)

from bitacora_asistencia_rrhh_policy import (  # noqa: E402
    policy_snapshot,
    trabajador_es_nuevo_tras_apagado,
)


def test_trabajador_nuevo_tras_apagado():
    assert trabajador_es_nuevo_tras_apagado(
        "2026-10-21T20:00:00-05:00",
        "2026-10-21T18:00:00-05:00",
    ) is True
    assert trabajador_es_nuevo_tras_apagado(
        "2026-10-21T17:00:00-05:00",
        "2026-10-21T18:00:00-05:00",
    ) is False
    assert trabajador_es_nuevo_tras_apagado("2026-10-21T20:00:00-05:00", None) is False


def test_policy_snapshot_incluye_auditoria_toggle():
    snap = policy_snapshot(
        3,
        activa_en_exento=False,
        activa_en="2026-10-21T19:00:00-05:00",
        activa_por=9,
        apagada_en="2026-10-21T19:00:00-05:00",
    )
    assert snap["activa_en_exento"] is False
    assert snap["apagada_en"] == "2026-10-21T19:00:00-05:00"
    assert snap["activa_por"] == 9


def test_soft_delete_acepta_update_sin_representation():
    from rrhh_docs_service import soft_delete_documento

    class Q:
        def __init__(self, sb):
            self.sb = sb
            self._payload = None
            self._mode = "select"

        def select(self, *_a, **_k):
            self._mode = "select"
            return self

        def update(self, payload):
            self._payload = payload
            self._mode = "update"
            return self

        def eq(self, *_a, **_k):
            return self

        def is_(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self._mode == "update":
                # Simula PostgREST sin return=representation
                self.sb.deleted = True
                return type("R", (), {"data": []})()
            if self.sb.deleted:
                return type("R", (), {"data": [{
                    "id": 5,
                    "eliminado_en": "2026-10-21T20:00:00-05:00",
                    "vigente": False,
                }]})()
            return type("R", (), {"data": [{
                "id": 5,
                "trabajador_id": 1,
                "contrato_id": 3,
                "vigente": True,
                "eliminado_en": None,
                "doc_bloqueado": False,
            }]})()

    class Sb:
        def __init__(self):
            self.deleted = False

        def table(self, name):
            if name == "rrhh_trabajadores":
                class Tq:
                    def select(self, *_a, **_k):
                        return self

                    def eq(self, *_a, **_k):
                        return self

                    def is_(self, *_a, **_k):
                        return self

                    def limit(self, *_a, **_k):
                        return self

                    def execute(self):
                        return type("R", (), {"data": [{
                            "id": 1, "contrato_id": 3, "doc_bloqueado": False,
                        }]})()
                return Tq()
            return Q(self)

    row = soft_delete_documento(Sb(), 3, 1, 5, {"id": 9})
    assert row["id"] == 5
    assert row.get("eliminado_en")
    assert row.get("vigente") is False
