"""Tests — consolidación documental RRHH (helpers)."""
from __future__ import annotations

from rrhh_auditoria_docs import auditoria_tiene_discrepancias


def test_auditoria_discrepancias():
    assert auditoria_tiene_discrepancias({
        "coincide_con_bd": True,
        "hallazgos": [{"campo": "nombre", "estado": "OK"}],
        "alertas_criticas": [],
    }) is False
    assert auditoria_tiene_discrepancias({
        "coincide_con_bd": True,
        "hallazgos": [{"campo": "eps", "estado": "DISCREPANCIA"}],
        "alertas_criticas": [],
    }) is True
    assert auditoria_tiene_discrepancias({
        "coincide_con_bd": False,
        "hallazgos": [],
        "alertas_criticas": [],
    }) is True
