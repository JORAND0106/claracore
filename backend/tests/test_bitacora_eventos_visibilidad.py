"""Tests visibilidad / integridad de eventos legacy vs embebidos."""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_service as svc


class _FakeQuery:
    def __init__(self, rows=None, error=None):
        self._rows = rows or []
        self._error = error
        self._filters = []

    def select(self, *a, **k):
        cols = a[0] if a else "*"
        if self._error and cols and cols != "*":
            # Simulate missing column when selecting specific schema probes
            if "eventos" in str(cols) and self._error == "no_eventos":
                raise Exception("column eventos does not exist")
            if "consolidado_en_diario_id" in str(cols) and self._error == "no_consolidado":
                raise Exception("column consolidado_en_diario_id does not exist")
            if self._error == "no_both" and (
                "eventos" in str(cols) or "consolidado_en_diario_id" in str(cols)
            ):
                raise Exception("column missing")
        return self

    def eq(self, *a, **k):
        return self

    def gte(self, *a, **k):
        return self

    def lte(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def is_(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return MagicMock(data=list(self._rows))


class _FakeSb:
    def __init__(self, rows, schema_error=None):
        self.rows = rows
        self.schema_error = schema_error

    def table(self, name):
        assert name == "seguimiento_bitacora_entrada"
        return _FakeQuery(self.rows, error=self.schema_error)


def test_schema_flags_missing_columns():
    svc._SCHEMA_EVENTOS_CACHE["flags"] = None
    svc._SCHEMA_EVENTOS_CACHE["ts"] = 0.0
    sb = _FakeSb([], schema_error="no_both")
    flags = svc.bitacora_schema_eventos_disponible(sb)
    assert flags["eventos"] is False
    assert flags["consolidado_en_diario_id"] is False


def test_list_entradas_incluye_eventos_si_esquema_incompleto(monkeypatch):
    svc._SCHEMA_EVENTOS_CACHE["flags"] = None
    svc._SCHEMA_EVENTOS_CACHE["ts"] = 0.0
    rows = [
        {"id": 1, "tipo": "diario", "fecha": "2026-08-10", "estado": "abierto", "contrato_id": 1},
        {
            "id": 2, "tipo": "evento", "fecha": "2026-08-10", "estado": "cerrado",
            "evento_tipo": "reporte_actividades", "contrato_id": 1,
            "cuerpo_html": "<p>Avance</p>",
        },
    ]
    sb = _FakeSb(rows, schema_error="no_both")
    monkeypatch.setattr(svc, "migrar_eventos_legacy_contrato", lambda *a, **k: 0)
    monkeypatch.setattr(svc, "asegurar_autocierre_entrada", lambda _sb, r, **k: r)
    monkeypatch.setattr(svc, "_list_usos_batch", lambda *a, **k: {})
    monkeypatch.setattr(svc, "_enrich_entrada", lambda _sb, r, **k: {**r, "eventos": r.get("eventos") or []})

    out = svc.list_entradas(sb, 1)
    tipos = {r["tipo"] for r in out}
    assert "diario" in tipos
    assert "evento" in tipos
    assert any(r.get("evento_tipo") == "reporte_actividades" for r in out)


def test_list_entradas_oculta_consolidados(monkeypatch):
    svc._SCHEMA_EVENTOS_CACHE["flags"] = None
    svc._SCHEMA_EVENTOS_CACHE["ts"] = 0.0
    rows = [
        {"id": 1, "tipo": "diario", "fecha": "2026-08-10", "estado": "abierto", "eventos": [{"id": "b1"}]},
        {"id": 2, "tipo": "evento", "fecha": "2026-08-10", "consolidado_en_diario_id": 1, "evento_tipo": "novedades"},
        {"id": 3, "tipo": "evento", "fecha": "2026-08-11", "consolidado_en_diario_id": None, "evento_tipo": "novedades"},
    ]

    class OkSb(_FakeSb):
        def table(self, name):
            return _FakeQuery(self.rows, error=None)

    sb = OkSb(rows)
    # Force schema available
    monkeypatch.setattr(
        svc, "bitacora_schema_eventos_disponible",
        lambda _sb: {"eventos": True, "consolidado_en_diario_id": True},
    )
    monkeypatch.setattr(svc, "migrar_eventos_legacy_contrato", lambda *a, **k: 0)
    monkeypatch.setattr(svc, "asegurar_autocierre_entrada", lambda _sb, r, **k: r)
    monkeypatch.setattr(svc, "_list_usos_batch", lambda *a, **k: {})
    monkeypatch.setattr(svc, "_enrich_entrada", lambda _sb, r, **k: {**r, "eventos": r.get("eventos") or []})

    out = svc.list_entradas(sb, 1)
    ids = {r["id"] for r in out}
    assert 1 in ids and 3 in ids
    assert 2 not in ids


def test_auditar_integridad_alerta_esquema(monkeypatch):
    svc._SCHEMA_EVENTOS_CACHE["flags"] = None
    svc._SCHEMA_EVENTOS_CACHE["ts"] = 0.0
    rows = [
        {"id": 1, "tipo": "diario", "fecha": "2026-08-10"},
        {"id": 2, "tipo": "evento", "fecha": "2026-08-10", "evento_tipo": "reporte_actividades"},
    ]
    sb = _FakeSb(rows, schema_error="no_both")
    monkeypatch.setattr(
        svc, "bitacora_schema_eventos_disponible",
        lambda _sb: {"eventos": False, "consolidado_en_diario_id": False},
    )
    audit = svc.auditar_integridad_eventos(sb, 7)
    assert audit["eventos_independientes"] == 1
    assert audit["diarios"] == 1
    assert audit["alerta"]
    assert "Esquema incompleto" in audit["alerta"]
