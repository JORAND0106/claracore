"""
Aislamiento por contrato — Bitácora de Obra (catálogos + entradas + permisos).

Verifica con mocks que las consultas filtran por contrato_id y que la matriz
de permisos no reutiliza filas de otro contrato.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

import bitacora_permissions as bp
import bitacora_service as svc


class _EqTrackingQuery:
    """Query builder mínimo que registra filtros .eq(...) y devuelve data por contrato."""

    def __init__(self, rows_by_contrato: dict, table: str):
        self.rows_by_contrato = rows_by_contrato
        self.table = table
        self.filters = {}
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def is_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def ilike(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        cid = self.filters.get("contrato_id")
        rows = list(self.rows_by_contrato.get(cid, [])) if cid is not None else []
        # Filtros adicionales simples
        if "id" in self.filters:
            want = int(self.filters["id"])
            rows = [r for r in rows if int(r.get("id") or 0) == want]
        if "tipo" in self.filters:
            rows = [r for r in rows if r.get("tipo") == self.filters["tipo"]]
        if "fecha" in self.filters:
            rows = [r for r in rows if str(r.get("fecha") or "")[:10] == str(self.filters["fecha"])[:10]]
        if "nombre_norm" in self.filters:
            rows = [r for r in rows if r.get("nombre_norm") == self.filters["nombre_norm"]]
        if "activo" in self.filters:
            rows = [r for r in rows if bool(r.get("activo", True)) == bool(self.filters["activo"])]
        if self._limit is not None:
            rows = rows[: int(self._limit)]
        return MagicMock(data=rows)


class _FakeSb:
    def __init__(self, tables: dict):
        self.tables = tables
        self.last_query = None

    def table(self, name: str):
        data = self.tables.get(name, {})
        q = _EqTrackingQuery(data, name)
        self.last_query = q
        return q


def test_list_tipos_material_no_cruza_contratos(monkeypatch):
    sb = _FakeSb({
        "seguimiento_bitacora_tipo_material": {
            101: [{"id": 1, "nombre": "Grava-A", "nombre_norm": "grava-a", "activo": True, "contrato_id": 101}],
            202: [{"id": 2, "nombre": "Grava-B", "nombre_norm": "grava-b", "activo": True, "contrato_id": 202}],
        },
    })
    monkeypatch.setattr(svc, "backfill_tipos_material_desde_entradas", lambda *a, **k: 0)
    a = svc.list_tipos_material(sb, 101, backfill=False)
    b = svc.list_tipos_material(sb, 202, backfill=False)
    assert [r["nombre"] for r in a] == ["Grava-A"]
    assert [r["nombre"] for r in b] == ["Grava-B"]
    assert sb.last_query.filters.get("contrato_id") == 202


def test_list_equipos_no_cruza_contratos():
    sb = _FakeSb({
        "seguimiento_bitacora_equipo": {
            101: [{"id": 1, "nombre": "Retro-A", "nombre_norm": "retro-a", "activo": True, "contrato_id": 101}],
            202: [{"id": 2, "nombre": "Retro-B", "nombre_norm": "retro-b", "activo": True, "contrato_id": 202}],
        },
    })
    a = svc.list_equipos(sb, 101)
    b = svc.list_equipos(sb, 202)
    assert [r["nombre"] for r in a] == ["Retro-A"]
    assert [r["nombre"] for r in b] == ["Retro-B"]


def test_list_visitantes_no_cruza_contratos():
    sb = _FakeSb({
        "seguimiento_bitacora_visitante": {
            101: [{"id": 1, "nombre": "Ana-A", "nombre_norm": "ana-a", "activo": True, "contrato_id": 101}],
            202: [{"id": 2, "nombre": "Ana-B", "nombre_norm": "ana-b", "activo": True, "contrato_id": 202}],
        },
    })
    a = svc.list_visitantes(sb, 101)
    b = svc.list_visitantes(sb, 202)
    assert [r["nombre"] for r in a] == ["Ana-A"]
    assert [r["nombre"] for r in b] == ["Ana-B"]


def test_list_cargos_custom_no_cruza_contratos():
    sb = _FakeSb({
        "seguimiento_bitacora_cargo": {
            101: [{"id": 1, "nombre": "Soldador-A", "nombre_norm": "soldador-a", "activo": True, "contrato_id": 101}],
            202: [{"id": 2, "nombre": "Soldador-B", "nombre_norm": "soldador-b", "activo": True, "contrato_id": 202}],
        },
    })
    a = svc.list_cargos_custom(sb, 101)
    b = svc.list_cargos_custom(sb, 202)
    assert [r["nombre"] for r in a] == ["Soldador-A"]
    assert [r["nombre"] for r in b] == ["Soldador-B"]


def test_get_entrada_idor_contrato_ajeno(monkeypatch):
    """Entrada del contrato 101 no es visible bajo contrato 202."""
    sb = _FakeSb({
        "seguimiento_bitacora_entrada": {
            101: [{"id": 55, "contrato_id": 101, "tipo": "diario", "fecha": "2026-08-20", "estado": "abierto"}],
            202: [],
        },
    })
    monkeypatch.setattr(svc, "asegurar_autocierre_entrada", lambda _sb, row: row)
    with pytest.raises(ValueError, match="no encontrada"):
        svc.get_entrada(sb, 202, 55)
    row = svc.get_entrada(sb, 101, 55)
    assert int(row["id"]) == 55


def test_diario_por_fecha_aislado_por_contrato(monkeypatch):
    sb = _FakeSb({
        "seguimiento_bitacora_entrada": {
            101: [{"id": 1, "contrato_id": 101, "tipo": "diario", "fecha": "2026-08-21", "estado": "abierto"}],
            202: [{"id": 2, "contrato_id": 202, "tipo": "diario", "fecha": "2026-08-21", "estado": "abierto"}],
        },
    })
    monkeypatch.setattr(svc, "asegurar_autocierre_entrada", lambda _sb, row: row)
    monkeypatch.setattr(svc, "_enrich_entrada", lambda _sb, row, **_k: row)
    a = svc.get_diario_por_fecha(sb, 101, "2026-08-21")
    b = svc.get_diario_por_fecha(sb, 202, "2026-08-21")
    assert a["id"] == 1
    assert b["id"] == 2
    assert svc._diario_existe_fecha(sb, 101, "2026-08-21") is True
    assert svc._diario_existe_fecha(sb, 303, "2026-08-21") is False


def test_permiso_bitacora_no_reutiliza_matriz_de_otro_contrato(monkeypatch):
    """Permiso Bitácora solo en contrato 101 → deniega en 202."""
    user = {"sub": "9", "cargo_nombre": "Residente"}
    monkeypatch.setattr(bp, "_es_desarrollador_seguro", lambda *_a, **_k: False)

    class FakeUserTable:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            return MagicMock(data=[{"cargo_id": 44}])

    class FakeMain:
        class supabase:
            @staticmethod
            def table(name):
                assert name == "usuarios"
                return FakeUserTable()

        @staticmethod
        def supabase_execute(fn):
            return fn()

    # Matriz: solo contrato 101 tiene Bitácora.ver
    def fake_matriz(cargo_id, contrato_id):
        assert cargo_id == 44
        if contrato_id == 101:
            return [{"funcion_id": 77, "ver": True, "contrato_id": 101, "nombre": "Bitácora", "codigo": "BITACORA"}]
        return []

    monkeypatch.setattr(bp, "_permisos_matriz_cargo", fake_matriz)
    # Evitar import real de main en el camino de usuarios
    import types
    import sys
    sys.modules["main"] = types.SimpleNamespace(
        supabase=FakeMain.supabase,
        supabase_execute=FakeMain.supabase_execute,
        _es_desarrollador=lambda *_a, **_k: False,
    )

    assert bp.tiene_permiso_bitacora(user, "ver", 101) is True
    assert bp.tiene_permiso_bitacora(user, "ver", 202) is False
