"""Tests horario Bitácora / horas extra."""
import pytest

from bitacora_horario import (
    calcular_horas_extra,
    horas_laborables_dia,
    horas_semanales,
    horario_default,
    key_dia_desde_fecha,
    normalize_horario,
)
from bitacora_service import (
    _enriquecer_y_validar_horas_extra,
    _normalizar_asistencia_colaboradores,
)


def test_default_40h_semana():
    h = horario_default("2026-11-10")
    assert h["vigente_desde"] == "2026-11-10"
    assert horas_laborables_dia(h["dias"]["lun"]) == 8.0
    assert horas_laborables_dia(h["dias"]["sab"]) == 0.0
    assert horas_semanales(h) == 40.0


def test_sabado_sin_almuerzo():
    h = normalize_horario({
        "dias": {
            "sab": {
                "laborable": True,
                "entrada": "07:30",
                "salida": "12:30",
                "almuerzo_inicio": "",
                "almuerzo_fin": "",
            },
        },
    })
    assert horas_laborables_dia(h["dias"]["sab"]) == 5.0


def test_key_dia():
    assert key_dia_desde_fecha("2026-11-10") == "mar"
    assert key_dia_desde_fecha("2026-11-08") == "dom"


def test_horas_extra_laborable_y_no_laborable():
    h = horario_default()
    assert calcular_horas_extra(
        hora_ingreso="07:30",
        hora_salida="18:30",
        horario=h,
        fecha="2026-11-10",
    ) == 2.0
    assert calcular_horas_extra(
        hora_ingreso="07:30",
        hora_salida="16:30",
        horario=h,
        fecha="2026-11-10",
    ) == 0.0
    assert calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="12:00",
        horario=h,
        fecha="2026-11-08",
    ) == 4.0


def test_normalizar_conserva_justificacion_horas_extra():
    rows = _normalizar_asistencia_colaboradores([
        {
            "nombre": "Ana Lopez",
            "cargo": "Oficial",
            "hora_ingreso": "07:30",
            "hora_salida": "18:30",
            "horas_extra": 2,
            "justificacion_horas_extra": "Hormigonado nocturno",
        },
    ])
    assert rows[0]["horas_extra"] == 2.0
    assert rows[0]["justificacion_horas_extra"] == "Hormigonado nocturno"


def test_validar_horas_extra_exige_justificacion():
    h = horario_default()
    with pytest.raises(ValueError, match="justificación"):
        _enriquecer_y_validar_horas_extra(
            [{"nombre": "Ana", "hora_ingreso": "07:30", "hora_salida": "18:30"}],
            horario=h,
            fecha="2026-11-10",
        )
    ok = _enriquecer_y_validar_horas_extra(
        [{
            "nombre": "Ana",
            "hora_ingreso": "07:30",
            "hora_salida": "18:30",
            "justificacion_horas_extra": "Finada de losa",
        }],
        horario=h,
        fecha="2026-11-10",
    )
    assert ok[0]["horas_extra"] == 2.0
    assert ok[0]["justificacion_horas_extra"] == "Finada de losa"
