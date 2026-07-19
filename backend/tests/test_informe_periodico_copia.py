"""Informe periódico: registro servidor de copia por ventana horaria."""
import pytest
from fastapi import HTTPException

import main as m


def test_parse_informe_periodico_slot_id_ok():
    fecha, hora = m._parse_informe_periodico_slot_id("2026-07-20_0800")
    assert fecha == "2026-07-20"
    assert hora == "0800"


def test_parse_informe_periodico_slot_id_segunda_ventana():
    fecha, hora = m._parse_informe_periodico_slot_id("2026-07-20_1030")
    assert fecha == "2026-07-20"
    assert hora == "1030"


def test_parse_informe_periodico_slot_id_invalido():
    with pytest.raises(HTTPException) as exc:
        m._parse_informe_periodico_slot_id("invalid")
    assert exc.value.status_code == 400
