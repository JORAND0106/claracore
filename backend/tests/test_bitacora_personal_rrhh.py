"""Personal en obra ↔ RRHH: normalización y resumen por cargo Activo."""
from bitacora_service import (
    ESTADOS_CUENTAN_RESUMEN,
    HORA_SALIDA_DEFAULT,
    _normalizar_asistencia_colaboradores,
    _personal_desde_asistencia,
)


def test_normaliza_asistencia_conserva_horario_y_rrhh_id():
    rows = _normalizar_asistencia_colaboradores([
        {
            "rrhh_trabajador_id": 5,
            "nombre": "ana lopez",
            "cargo": "Oficial",
            "estado": "inactivo",
            "hora_ingreso": "07:00",
            "hora_salida": "",
            "origen": "rrhh",
        },
    ])
    assert len(rows) == 1
    assert rows[0]["rrhh_trabajador_id"] == 5
    assert rows[0]["nombre"] == "Ana Lopez"
    assert rows[0]["hora_ingreso"] == "07:00"
    assert rows[0]["hora_salida"] == HORA_SALIDA_DEFAULT
    assert rows[0]["estado"] == "inactivo"


def test_personal_desde_asistencia_solo_activo():
    assert "activo" in ESTADOS_CUENTAN_RESUMEN
    agg = _personal_desde_asistencia([
        {"cargo": "Oficial", "estado": "activo"},
        {"cargo": "Oficial", "estado": "activo"},
        {"cargo": "Ayudante", "estado": "activo"},
        {"cargo": "Oficial", "estado": "inactivo"},
        {"cargo": "Oficial", "estado": "retirado"},
        {"cargo": "Oficial", "estado": "incapacitado"},
        {"cargo": "", "estado": "activo"},
    ])
    assert agg == [
        {"cargo": "Ayudante", "cantidad": 1.0},
        {"cargo": "Oficial", "cantidad": 2.0},
    ]
