"""Tests — enrich asistencia con gate documentación Aprobada."""
from __future__ import annotations

from unittest.mock import MagicMock

import bitacora_service as svc


class _FakeList:
    def __init__(self, rows):
        self._rows = rows

    def __call__(self, *_a, **_k):
        return list(self._rows)


def test_enrich_rechaza_no_aprobado_cuando_gate(monkeypatch):
    rows = [
        {
            "id": 10,
            "nombres": "Ana",
            "apellidos": "Lopez",
            "estado": "activo",
            "cargo_aspira": "Oficial",
            "doc_validacion_estado": "pendiente",
            "tipo_documento": "CC",
            "numero_documento": "1",
        },
    ]
    monkeypatch.setattr("rrhh_service.list_trabajadores", _FakeList(rows), raising=False)
    import rrhh_service
    monkeypatch.setattr(rrhh_service, "list_trabajadores", _FakeList(rows))

    try:
        svc.enrich_asistencia_desde_rrhh(
            MagicMock(),
            1,
            [{"rrhh_trabajador_id": 10, "nombre": "Ana", "origen": "rrhh"}],
            exigir_aprobado=True,
        )
        assert False, "debía rechazar"
    except ValueError as exc:
        assert "Aprobada" in str(exc) or "aprobada" in str(exc).lower()


def test_enrich_acepta_aprobado_cuando_gate(monkeypatch):
    rows = [
        {
            "id": 11,
            "nombres": "Luis",
            "apellidos": "Perez",
            "estado": "activo",
            "cargo_aspira": "Ayudante",
            "doc_validacion_estado": "aprobado",
            "tipo_documento": "CC",
            "numero_documento": "2",
            "empresa_nombre": "Sub SA",
            "empresa_subcontratista_id": 5,
        },
    ]
    import rrhh_service
    monkeypatch.setattr(rrhh_service, "list_trabajadores", _FakeList(rows))

    out = svc.enrich_asistencia_desde_rrhh(
        MagicMock(),
        1,
        [{"rrhh_trabajador_id": 11, "nombre": "x", "origen": "rrhh"}],
        exigir_aprobado=True,
    )
    assert len(out) == 1
    assert out[0]["rrhh_trabajador_id"] == 11
    assert out[0]["doc_validacion_estado"] == "aprobado"
    assert "Luis" in out[0]["nombre"]


def test_enrich_sin_gate_acepta_pendiente(monkeypatch):
    rows = [
        {
            "id": 12,
            "nombres": "Maria",
            "apellidos": "Ruiz",
            "estado": "activo",
            "cargo_aspira": "Oficial",
            "doc_validacion_estado": "pendiente",
            "tipo_documento": "CC",
            "numero_documento": "3",
        },
    ]
    import rrhh_service
    monkeypatch.setattr(rrhh_service, "list_trabajadores", _FakeList(rows))

    out = svc.enrich_asistencia_desde_rrhh(
        MagicMock(),
        1,
        [{"rrhh_trabajador_id": 12, "nombre": "x", "origen": "rrhh"}],
        exigir_aprobado=False,
    )
    assert len(out) == 1
    assert out[0]["rrhh_trabajador_id"] == 12
