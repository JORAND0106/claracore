"""Tests — cumpleaños del mes (RRHH)."""
from __future__ import annotations

from rrhh_service import filtrar_cumpleanos_mes, primer_nombre_colaborador, _parse_fecha_nacimiento


def test_primer_nombre():
    assert primer_nombre_colaborador("María Fernanda López") == "María"
    assert primer_nombre_colaborador("  Ana  ") == "Ana"
    assert primer_nombre_colaborador("") == "—"
    assert primer_nombre_colaborador(None) == "—"


def test_parse_fecha_nacimiento():
    assert _parse_fecha_nacimiento("1990-03-15").month == 3
    assert _parse_fecha_nacimiento("1990-03-15T00:00:00Z").day == 15
    assert _parse_fecha_nacimiento(None) is None
    assert _parse_fecha_nacimiento("abc") is None


def test_filtrar_cumpleanos_mes_solo_activos_del_mes():
    rows = [
        {
            "id": 1,
            "nombres": "Carlos Andrés",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": "1990-09-05",
        },
        {
            "id": 2,
            "nombres": "Laura",
            "empresa_nombre": "Sub Y",
            "estado": "activo",
            "fecha_nacimiento": "1988-09-01",
        },
        {
            "id": 3,
            "nombres": "Pedro",
            "empresa_nombre": "Consorcio X",
            "estado": "retirado",
            "fecha_nacimiento": "1992-09-10",
        },
        {
            "id": 4,
            "nombres": "Sofía",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": "1995-03-20",
        },
        {
            "id": 5,
            "nombres": "Bruno",
            "empresa_nombre": "Consorcio X",
            "estado": "activo",
            "fecha_nacimiento": None,
        },
    ]
    items = filtrar_cumpleanos_mes(rows, mes=9)
    assert [i["id"] for i in items] == [2, 1]  # día 1, luego 5
    assert items[0] == {
        "id": 2,
        "primer_nombre": "Laura",
        "empresa_nombre": "Sub Y",
        "dia": 1,
    }
    assert items[1]["primer_nombre"] == "Carlos"
    assert items[1]["dia"] == 5
