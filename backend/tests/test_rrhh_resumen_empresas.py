"""Tests — parseo seguro de salario y resumen por empresa (sin romper carga)."""
from __future__ import annotations

from rrhh_service import _empresa_key_from_row, _parse_salario_numero, resumen_trabajadores_por_empresa


def test_parse_salario_numero_texto_formateado():
    assert _parse_salario_numero("$ 2.500.000") == 2500000.0
    assert _parse_salario_numero(2500000) == 2500000.0
    assert _parse_salario_numero(None) == 0.0
    assert _parse_salario_numero("") == 0.0
    assert _parse_salario_numero("abc") == 0.0


def test_empresa_key_from_row():
    assert _empresa_key_from_row({"empresa_tipo": "consorcio"}) == "consorcio"
    assert _empresa_key_from_row({
        "empresa_tipo": "subcontratista",
        "empresa_subcontratista_id": 9,
    }) == "sub:9"


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def is_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()


class _FakeSb:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeQuery(self._rows)


def test_resumen_usa_salario_numerico_y_texto():
    rows = [
        {
            "id": 1,
            "empresa_tipo": "consorcio",
            "empresa_nombre": "Consorcio X",
            "cargo_aspira": "Oficial",
            "estado": "activo",
            "salario": 2000000,
        },
        {
            "id": 2,
            "empresa_tipo": "consorcio",
            "empresa_nombre": "Consorcio X",
            "cargo_aspira": "Oficial",
            "estado": "activo",
            "salario": "$ 1.500.000",
        },
    ]
    grupos = resumen_trabajadores_por_empresa(_FakeSb(rows), 1, incluir_nomina=True)
    assert len(grupos) == 1
    assert grupos[0]["total"] == 2
    assert grupos[0]["activos"] == 2
    assert grupos[0]["total_nomina"] == 3500000.0
    assert grupos[0]["por_cargo"][0]["cargo"] == "Oficial"
    assert grupos[0]["por_cargo"][0]["total_nomina"] == 3500000.0
    assert "logo_url" in grupos[0]
