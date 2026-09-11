"""Personal manual temporal + merge con RRHH."""
from bitacora_service import (
    BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO,
    _merge_personal_por_cargo,
    _personal_desde_asistencia,
)


def test_contrato_temp_numero():
    assert BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO == "ICCU-CTO-1574-2025"


def test_merge_personal_por_cargo():
    rrhh = _personal_desde_asistencia([
        {"cargo": "Oficial", "estado": "activo"},
        {"cargo": "Oficial", "estado": "activo"},
        {"cargo": "Ayudante", "estado": "activo"},
    ])
    manual = [{"cargo": "Oficial", "cantidad": 3}, {"cargo": "Boal", "cantidad": 1}]
    merged = _merge_personal_por_cargo(rrhh, manual)
    assert merged == [
        {"cargo": "Ayudante", "cantidad": 1.0},
        {"cargo": "Boal", "cantidad": 1.0},
        {"cargo": "Oficial", "cantidad": 5.0},
    ]
