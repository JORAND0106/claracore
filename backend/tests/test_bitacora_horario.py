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


def test_festivo_lunes_todo_es_extra():
    """2026-11-16 Independencia de Cartagena (lunes festivo): 08:00–11:00 → 3.00."""
    from bitacora_he_clasificacion import clasificar_tiempo_extra
    from bitacora_horario import etiqueta_dia_especial, tiene_jornada_ordinaria

    h = horario_default()
    assert not tiene_jornada_ordinaria(h, "2026-11-16")
    assert etiqueta_dia_especial("2026-11-16", h) == "Festivo"
    total = calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="11:00",
        horario=h,
        fecha="2026-11-16",
    )
    assert total == 3.0
    # Lunes ordinario (no festivo) con mismo horario sigue en 0
    assert calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="11:00",
        horario=h,
        fecha="2026-11-09",
    ) == 0.0
    c = clasificar_tiempo_extra(
        hora_ingreso="08:00",
        hora_salida="11:00",
        fecha="2026-11-16",
        horario=h,
        total_extra=total,
    )
    assert c["extra_festiva_diurna"] == 3.0
    assert c["tiempo_extra"] == 3.0


def test_domingo_laborable_respeta_jornada():
    """Si el contrato marca domingo laborable, no se trata como día especial."""
    from bitacora_horario import etiqueta_dia_especial, tiene_jornada_ordinaria

    h = normalize_horario({
        "dias": {
            "dom": {
                "laborable": True,
                "entrada": "08:00",
                "salida": "12:00",
                "almuerzo_inicio": "",
                "almuerzo_fin": "",
            },
        },
    })
    assert tiene_jornada_ordinaria(h, "2026-11-08")
    assert etiqueta_dia_especial("2026-11-08", h) is None
    assert calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="12:00",
        horario=h,
        fecha="2026-11-08",
    ) == 0.0
    assert calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="14:00",
        horario=h,
        fecha="2026-11-08",
    ) == 2.0


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
