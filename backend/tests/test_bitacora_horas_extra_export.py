"""Tests unitarios — informe horas extras Bitácora."""
from bitacora_horas_extra_export import (
    CODIGO_FORMATO_HORAS_EXTRA,
    _key_empresa,
    construir_filas_horas_extra,
    empresas_con_personal_reportado,
    filas_informe_agrupadas,
)


def test_key_empresa_normaliza():
    assert _key_empresa("Empresa A") == _key_empresa("  empresa   a ")
    assert _key_empresa("") == "__sin_empresa__"


def test_construir_filas_solo_con_extra_ordenado_por_colaborador():
    diarios = [
        {
            "tipo": "diario",
            "fecha": "2026-11-12",
            "horario_aplicado": None,
            "asistencia_colaboradores": [
                {
                    "nombre": "Zeta Lopez",
                    "documento_numero": "11.1",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:30",
                    "hora_salida": "19:30",
                    "horas_extra": 2.5,
                    "justificacion_horas_extra": "Obra nocturna",
                },
                {
                    "nombre": "Ana Perez",
                    "documento_numero": "222",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:30",
                    "hora_salida": "16:30",
                    "horas_extra": 0,
                },
            ],
        },
        {
            "tipo": "diario",
            "fecha": "2026-11-11",
            "asistencia_colaboradores": [
                {
                    "nombre": "Ana Perez",
                    "documento_numero": "222",
                    "subcontratista_nombre": "Empresa A",
                    "hora_ingreso": "07:00",
                    "hora_salida": "19:00",
                    "horas_extra": 1.5,
                    "justificacion_horas_extra": "Cierre de tramo",
                },
                {
                    "nombre": "Luis Mora",
                    "subcontratista_nombre": "Empresa B",
                    "hora_ingreso": "07:30",
                    "hora_salida": "20:00",
                    "horas_extra": 3,
                    "justificacion_horas_extra": "Emergencia",
                },
            ],
        },
        {
            "tipo": "evento",
            "fecha": "2026-11-10",
            "asistencia_colaboradores": [
                {"nombre": "X", "horas_extra": 9, "justificacion_horas_extra": "no"},
            ],
        },
    ]
    filas = construir_filas_horas_extra(diarios, empresa_key="Empresa A")
    assert len(filas) == 2
    # Orden: colaborador (Ana) luego Zeta; fechas cronológicas dentro del grupo
    assert filas[0]["nombre"] == "Ana Perez"
    assert filas[0]["fecha"] == "2026-11-11"
    assert filas[0]["tiempo_extra"] == 1.5
    assert filas[1]["nombre"] == "Zeta Lopez"
    assert filas[1]["documento"] == "111"

    otras = construir_filas_horas_extra(diarios, empresa_key="Empresa B")
    assert len(otras) == 1
    assert otras[0]["nombre"] == "Luis Mora"

    vacio = construir_filas_horas_extra(diarios, empresa_key="No Existe")
    assert vacio == []


def test_filas_informe_agrupadas_subtotales_y_total():
    detalle = [
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-11",
            "hora_inicio": "07:00",
            "hora_fin": "19:00",
            "tiempo_extra": 1.5,
            "observacion": "Cierre",
        },
        {
            "nombre": "Ana Perez",
            "documento": "222",
            "fecha": "2026-11-12",
            "hora_inicio": "07:00",
            "hora_fin": "18:00",
            "tiempo_extra": 0.5,
            "observacion": "Extra",
        },
        {
            "nombre": "Zeta Lopez",
            "documento": "111",
            "fecha": "2026-11-12",
            "hora_inicio": "07:30",
            "hora_fin": "19:30",
            "tiempo_extra": 2.5,
            "observacion": "Noche",
        },
    ]
    vista = filas_informe_agrupadas(detalle)
    tipos = [r["tipo"] for r in vista]
    assert tipos == ["detalle", "detalle", "subtotal", "detalle", "subtotal", "total"]
    # No cuenta colaboradores
    assert vista[0]["no"] == 1 and vista[1]["no"] == 1
    assert vista[3]["no"] == 2
    assert vista[2]["tiempo_extra"] == 2.0  # Ana 1.5+0.5
    assert vista[2]["observacion"] == "Subtotal"
    assert vista[4]["tiempo_extra"] == 2.5
    assert vista[5]["tiempo_extra"] == 4.5
    assert vista[5]["observacion"] == "Total general"
    # Nombre/doc en cada detalle del grupo
    assert vista[0]["nombre"] == vista[1]["nombre"] == "Ana Perez"
    assert vista[0]["documento"] == vista[1]["documento"] == "222"


def test_empresas_con_personal_reportado():
    diarios = [
        {
            "asistencia_colaboradores": [
                {"nombre": "A", "subcontratista_nombre": "Beta"},
                {"nombre": "B", "subcontratista_nombre": "Alpha"},
                {"nombre": "", "subcontratista_nombre": "Ignorar"},
            ],
        },
    ]
    emps = empresas_con_personal_reportado(diarios)
    nombres = [e["nombre"] for e in emps]
    assert nombres == ["Alpha", "Beta"]
    assert CODIGO_FORMATO_HORAS_EXTRA == "CC-BIT-HE-001"
