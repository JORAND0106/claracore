"""Tests — resiliencia update RRHH ante columnas de ciclo ausentes en producción."""
from rrhh_permissions import require_permiso_rrhh_any
from rrhh_service import (
    _columna_ausente_desde_error,
    _es_error_columna_ausente,
    _ejecutar_update_trabajador,
)


def test_parse_pgrst204_dedicacion():
    exc = Exception(
        "Could not find the 'dedicacion' column of 'rrhh_trabajadores' in the schema cache"
    )
    assert _columna_ausente_desde_error(exc) == "dedicacion"
    assert _es_error_columna_ausente(exc, "dedicacion") is True


def test_parse_42703_contrato_requiere():
    """Error real capturado en producción ClaraCore (Supabase) 2026-09-21."""
    exc = Exception(
        "column rrhh_trabajadores.contrato_requiere_renovacion does not exist"
    )
    assert _columna_ausente_desde_error(exc) == "contrato_requiere_renovacion"


def test_update_omite_varias_columnas_ciclo_en_cadena():
    """
    Reproduce la secuencia real: el PUT envía dedicacion + contrato_requiere_* ;
    PostgREST falla de a una columna; el writer debe omitirlas todas y completar.
    """

    class _FakeQuery:
        def __init__(self, table):
            self.table = table
            self._payload = None

        def update(self, payload):
            self._payload = dict(payload)
            return self

        def eq(self, *a, **k):
            return self

        def execute(self):
            p = self._payload or {}
            if "contrato_requiere_renovacion" in p:
                raise RuntimeError(
                    "Could not find the 'contrato_requiere_renovacion' column "
                    "of 'rrhh_trabajadores' in the schema cache"
                )
            if "contrato_periodicidad_renovacion" in p:
                raise RuntimeError(
                    "column rrhh_trabajadores.contrato_periodicidad_renovacion does not exist"
                )
            if "dedicacion" in p:
                raise RuntimeError(
                    "Could not find the 'dedicacion' column of 'rrhh_trabajadores' "
                    "in the schema cache"
                )
            if "alerta_periodo_prueba_enviada_at" in p:
                raise RuntimeError(
                    "column rrhh_trabajadores.alerta_periodo_prueba_enviada_at does not exist"
                )
            self.table.calls.append(dict(p))
            return type("R", (), {"data": [{"id": 1, **p}]})()

    class _FakeSb:
        def __init__(self):
            self.calls = []

        def table(self, name):
            assert name == "rrhh_trabajadores"
            return _FakeQuery(self)

    sb = _FakeSb()
    rows = _ejecutar_update_trabajador(
        sb,
        10,
        5,
        {
            "nombres": "Ana",
            "dedicacion": "tiempo_completo",
            "contrato_requiere_renovacion": False,
            "contrato_periodicidad_renovacion": None,
            "alerta_periodo_prueba_enviada_at": None,
            "periodo_prueba_dias": 60,
            "updated_by": 1,
        },
    )
    assert len(rows) == 1
    saved = sb.calls[0]
    assert saved["nombres"] == "Ana"
    assert saved["periodo_prueba_dias"] == 60
    assert "dedicacion" not in saved
    assert "contrato_requiere_renovacion" not in saved
    assert "contrato_periodicidad_renovacion" not in saved
    assert "alerta_periodo_prueba_enviada_at" not in saved


def test_require_permiso_rrhh_any_acepta_editar(monkeypatch):
    monkeypatch.setattr(
        "rrhh_permissions.tiene_permiso_rrhh",
        lambda user, accion, cid=None: accion == "editar",
    )
    require_permiso_rrhh_any({"sub": 1}, ("crear", "editar"), 1)


def test_require_permiso_rrhh_any_rechaza_sin_ninguno(monkeypatch):
    monkeypatch.setattr(
        "rrhh_permissions.tiene_permiso_rrhh",
        lambda user, accion, cid=None: False,
    )
    try:
        require_permiso_rrhh_any({"sub": 1}, ("crear", "editar"), 1)
        assert False, "debía lanzar 403"
    except Exception as exc:
        assert "403" in str(exc) or "permiso" in str(exc).lower()
