"""Validación NewPoint: datos de campo obligatorios para contratista."""
from topografia_utils import faltantes_campo_newpoint


def test_faltantes_campo_newpoint_vacio():
    falt = faltantes_campo_newpoint({})
    assert "operador" in falt
    assert "fecha de campo" in falt
    assert "marca del equipo" in falt


def test_faltantes_campo_newpoint_completo():
    row = {
        "operador": "Topógrafo",
        "fecha": "2026-06-03",
        "equipo_marca": "Leica",
        "equipo_referencia": "TS16",
        "equipo_serial": "123456",
    }
    assert faltantes_campo_newpoint(row) == []
