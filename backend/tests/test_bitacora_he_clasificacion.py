"""Clasificación de tiempo extra en 4 tipos (diurna/nocturna × ordinaria/festiva)."""
from bitacora_he_clasificacion import clasificar_tiempo_extra
from bitacora_horario import calcular_horas_extra, horario_default, normalize_horario


def _sum4(c: dict) -> float:
    return round(
        float(c["extra_diurna"])
        + float(c["extra_nocturna"])
        + float(c["extra_festiva_diurna"])
        + float(c["extra_festiva_nocturna"]),
        2,
    )


def _assert_suma(c: dict, total: float):
    assert c["tiempo_extra"] == round(total, 2)
    assert _sum4(c) == round(total, 2)


def test_solo_extra_diurna_ordinario():
    """Mar 2026-11-10: 07:30–18:30 → 2h extra, todas diurnas (antes de 19:00)."""
    h = horario_default()
    total = calcular_horas_extra(
        hora_ingreso="07:30",
        hora_salida="18:30",
        horario=h,
        fecha="2026-11-10",
    )
    assert total == 2.0
    c = clasificar_tiempo_extra(
        hora_ingreso="07:30",
        hora_salida="18:30",
        fecha="2026-11-10",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_diurna"] == 2.0
    assert c["extra_nocturna"] == 0.0
    assert c["extra_festiva_diurna"] == 0.0
    assert c["extra_festiva_nocturna"] == 0.0


def test_solo_extra_nocturna_ordinario():
    """Extra solo en franja nocturna: 19:00–22:00 con jornada ya cumplida (stored)."""
    h = horario_default()
    # Simula salida extendida: 07:30–22:00 → extra 5.5h; clasificamos con total=3
    # forzando intervalo nocturno puro vía ingreso/salida 19:00–22:00 y total=3.
    c = clasificar_tiempo_extra(
        hora_ingreso="19:00",
        hora_salida="22:00",
        fecha="2026-11-10",
        horario=h,
        total_extra=3.0,
    )
    _assert_suma(c, 3.0)
    assert c["extra_nocturna"] == 3.0
    assert c["extra_diurna"] == 0.0


def test_cruza_diurno_a_nocturno():
    """07:30–20:30 → 4h extra: 2.5 diurna (16:30–19:00) + 1.5 nocturna (19:00–20:30)."""
    h = horario_default()
    total = calcular_horas_extra(
        hora_ingreso="07:30",
        hora_salida="20:30",
        horario=h,
        fecha="2026-11-10",
    )
    assert total == 4.0
    c = clasificar_tiempo_extra(
        hora_ingreso="07:30",
        hora_salida="20:30",
        fecha="2026-11-10",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_diurna"] == 2.5
    assert c["extra_nocturna"] == 1.5
    assert c["extra_festiva_diurna"] == 0.0
    assert c["extra_festiva_nocturna"] == 0.0


def test_domingo_festiva_diurna():
    """Domingo 2026-11-08: 08:00–12:00 → 4h festiva diurna."""
    h = horario_default()
    total = calcular_horas_extra(
        hora_ingreso="08:00",
        hora_salida="12:00",
        horario=h,
        fecha="2026-11-08",
    )
    assert total == 4.0
    c = clasificar_tiempo_extra(
        hora_ingreso="08:00",
        hora_salida="12:00",
        fecha="2026-11-08",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_festiva_diurna"] == 4.0
    assert c["extra_diurna"] == 0.0


def test_festivo_oficial_colombia():
    """2026-01-01 Año Nuevo: 09:00–13:00 → festiva diurna."""
    h = horario_default()
    total = 4.0  # jueves festivo; jornada default aplica pero forzar total
    c = clasificar_tiempo_extra(
        hora_ingreso="09:00",
        hora_salida="13:00",
        fecha="2026-01-01",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_festiva_diurna"] == 4.0


def test_ordinario_a_festivo_cruzando_medianoche():
    """
    2025-12-31 (mié ordinario) 20:00 → 2026-01-01 (jue festivo) 02:00.
    Total almacenado 6h: 4h nocturna ordinaria + 2h festiva nocturna.
    """
    h = horario_default()
    total = 6.0
    c = clasificar_tiempo_extra(
        hora_ingreso="20:00",
        hora_salida="02:00",
        fecha="2025-12-31",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_nocturna"] == 4.0
    assert c["extra_festiva_nocturna"] == 2.0
    assert c["extra_diurna"] == 0.0
    assert c["extra_festiva_diurna"] == 0.0


def test_nocturno_parametro_contrato():
    """Con nocturno 21:00–06:00, 16:30–20:30 es todo diurno."""
    h = normalize_horario({
        "nocturno_inicio": "21:00",
        "nocturno_fin": "06:00",
    })
    total = 4.0
    c = clasificar_tiempo_extra(
        hora_ingreso="07:30",
        hora_salida="20:30",
        fecha="2026-11-10",
        horario=h,
        total_extra=total,
    )
    _assert_suma(c, total)
    assert c["extra_diurna"] == 4.0
    assert c["extra_nocturna"] == 0.0


def test_html_pdf_incluye_columnas_tipos():
    from bitacora_horas_extra_export import (
        CODIGO_FORMATO_HORAS_EXTRA,
        _html_informe,
        construir_filas_horas_extra,
        filas_informe_agrupadas,
    )

    diarios = [{
        "tipo": "diario",
        "fecha": "2026-11-10",
        "asistencia_colaboradores": [{
            "nombre": "Ana Perez",
            "documento_numero": "222",
            "subcontratista_nombre": "Empresa A",
            "hora_ingreso": "07:30",
            "hora_salida": "20:30",
            "horas_extra": 4.0,
            "justificacion_horas_extra": "Cierre",
        }],
    }]
    detalle = construir_filas_horas_extra(diarios, empresa_key="Empresa A")
    assert len(detalle) == 1
    assert detalle[0]["extra_diurna"] == 2.5
    assert detalle[0]["extra_nocturna"] == 1.5
    assert detalle[0]["tiempo_extra"] == 4.0
    vista = filas_informe_agrupadas(detalle)
    html = _html_informe({
        "contrato": {"numero": "CTO-1", "objeto": "Obra", "contratista": "X"},
        "empresa": "Empresa A",
        "fecha_desde": "2026-11-01",
        "fecha_hasta": "2026-11-30",
        "responsable": {"nombre": "R"},
        "elaboro": {"nombre": "E", "cargo": "Aux"},
        "aprobo": {"nombre": "A", "cargo": "Dir"},
        "filas": vista,
        "formato": {
            "codigo": CODIGO_FORMATO_HORAS_EXTRA,
            "version": "1.0",
            "titulo": "INFORME DE HORAS EXTRAS DEL PERSONAL",
        },
    })
    assert "Extra diurna" in html
    assert "Extra nocturna" in html
    assert "Extra festiva diurna" in html
    assert "Extra festiva nocturna" in html
    assert "Total tiempo extra" in html
    assert "Tiempo extra</th>" not in html
