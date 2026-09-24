"""
PUT bitácora 400: mensajes exactos de validación (cuerpo ``detail``).

Reproduce lo que Network muestra en
PUT /seguimiento/{contrato}/bitacora/{entrada} → 400.
"""
from __future__ import annotations

import pytest

import bitacora_service as svc


def test_parse_hora_placeholders_no_400():
    """HORA INTERM. vacía (--:--) no debe generar ValueError → 400."""
    assert svc._parse_hora("--:--") is None
    assert svc._parse_hora("--:-- -----") is None
    assert svc._parse_hora("—") is None
    assert svc._parse_hora("") is None
    assert svc._parse_hora("07:30:00.000") == "07:30:00"
    assert svc._normalizar_horas_intermedias([
        {"hora": "--:--"},
        {"hora": "12:30"},
        {"hora": "basura"},
    ]) == [{"hora": "12:30"}]


def test_400_detail_materiales_sin_tramo_es_explicito():
    """detail 400 cuando Materiales tiene datos y Tramo = Seleccione…"""
    with pytest.raises(ValueError) as ei:
        svc._validar_tramos_filas_diario(
            materiales=[{
                "tipo_material": "Arena",
                "cantidad": 10,
                "tramo": None,
            }],
        )
    msg = str(ei.value)
    assert msg == "Debe seleccionar un Tramo en cada fila de Materiales."


def test_materiales_fila_vacia_no_exige_tramo():
    svc._validar_tramos_filas_diario(materiales=[{}, {"tipo_material": "", "tramo": ""}])


def test_hora_invalida_real_sigue_siendo_error():
    with pytest.raises(ValueError, match="Hora inválida"):
        svc._parse_hora("25:99")
