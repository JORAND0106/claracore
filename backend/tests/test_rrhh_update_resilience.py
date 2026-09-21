"""Tests — resiliencia update RRHH (columna dedicacion) y permisos crear|editar."""
from rrhh_permissions import require_permiso_rrhh_any
from rrhh_service import _es_error_columna_ausente, _ejecutar_update_trabajador


def test_es_error_columna_ausente_postgrest():
    exc = Exception("Could not find the 'dedicacion' column of 'rrhh_trabajadores' in the schema cache")
    assert _es_error_columna_ausente(exc, "dedicacion") is True
    assert _es_error_columna_ausente(exc, "salario") is False


def test_es_error_columna_ausente_postgres():
    exc = Exception('column "dedicacion" of relation "rrhh_trabajadores" does not exist')
    assert _es_error_columna_ausente(exc, "dedicacion") is True


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
        if "dedicacion" in (self._payload or {}):
            raise RuntimeError(
                "Could not find the 'dedicacion' column of 'rrhh_trabajadores' in the schema cache"
            )
        self.table.calls.append(dict(self._payload or {}))
        return type("R", (), {"data": [{"id": 1, **(self._payload or {})}]})()


class _FakeSb:
    def __init__(self):
        self.calls = []

    def table(self, name):
        assert name == "rrhh_trabajadores"
        return _FakeQuery(self)


def test_update_reintenta_sin_dedicacion_si_columna_ausente():
    sb = _FakeSb()
    rows = _ejecutar_update_trabajador(
        sb,
        10,
        5,
        {"nombres": "Ana", "dedicacion": "tiempo_completo", "updated_by": 1},
    )
    assert len(rows) == 1
    assert "dedicacion" not in sb.calls[0]
    assert sb.calls[0]["nombres"] == "Ana"


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
