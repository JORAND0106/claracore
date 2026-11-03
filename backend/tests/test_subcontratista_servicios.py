"""Tests tarifas / factor / presencia para subcontratistas por_servicios."""
from __future__ import annotations

from datetime import date

from subcontratista_servicios import (
    construir_control_presencia,
    dias_esperados_en_periodo,
    es_subcontratista_por_servicios,
    factor_periodo_corte,
    items_corte_desde_tarifas,
    normalizar_tipo_subcontratista,
    valor_concepto_periodo,
)


def test_normalizar_tipo():
    assert normalizar_tipo_subcontratista(None) == "por_cantidades"
    assert normalizar_tipo_subcontratista("por_servicios") == "por_servicios"
    assert es_subcontratista_por_servicios({"tipo": "por_servicios"}) is True
    assert es_subcontratista_por_servicios({"tipo": "por_cantidades"}) is False


def test_factor_periodo():
    assert factor_periodo_corte("quincenal") == 0.5
    assert factor_periodo_corte("mensual") == 1.0


def test_valor_concepto_periodo():
    # 2 topógrafos × 10_000_000 × 0.5 quincena
    assert valor_concepto_periodo(
        tarifa_mensual=10_000_000, cantidad_profesionales=2, tipo_periodo="quincenal"
    ) == 10_000_000
    assert valor_concepto_periodo(
        tarifa_mensual=10_000_000, cantidad_profesionales=2, tipo_periodo="mensual"
    ) == 20_000_000


def test_items_corte_desde_tarifas():
    tarifas = [
        {"id": 1, "concepto": "Topógrafo", "tarifa_mensual": 8_000_000, "cantidad_profesionales": 1},
        {"id": 2, "concepto": "Cadenero", "tarifa_mensual": 3_000_000, "cantidad_profesionales": 2},
    ]
    items, total = items_corte_desde_tarifas(tarifas, tipo_periodo="quincenal")
    assert len(items) == 2
    assert items[0]["costo_directo"] == 4_000_000
    assert items[1]["costo_directo"] == 3_000_000
    assert total == 7_000_000
    assert all(i["sin_precio"] is False for i in items)


def test_dias_esperados_festivo_y_domingo():
    # 2026-07-20 lunes festivo Independencia (CO); 19 domingo; 18 sábado
    # Sin actividad el sábado → no se espera
    dias = dias_esperados_en_periodo(
        "2026-07-18", "2026-07-20", fechas_con_actividad_contrato=[]
    )
    assert "2026-07-19" not in dias  # domingo
    assert "2026-07-20" not in dias  # festivo
    assert "2026-07-18" not in dias  # sábado sin actividad


def test_sabado_con_actividad_si_espera():
    dias = dias_esperados_en_periodo(
        "2026-07-18",
        "2026-07-18",
        fechas_con_actividad_contrato=["2026-07-18"],
    )
    assert dias == ["2026-07-18"]


def test_control_presencia_alerta():
    trabajadores = [
        {
            "id": 10,
            "nombre": "Ana Topo",
            "cargo_aspira": "Topógrafo",
            "empresa_subcontratista_id": 5,
            "empresa_tipo": "subcontratista",
        }
    ]
    # Lun 9 y Mar 10 mar 2026 (hábil, sin festivo CO). Solo presencia el 9.
    diarios = [
        {
            "fecha": "2026-03-09",
            "asistencia_colaboradores": [
                {
                    "rrhh_trabajador_id": 10,
                    "nombre": "Ana Topo",
                    "cargo": "Topógrafo",
                    "subcontratista_id": 5,
                    "estado": "presente",
                }
            ],
            "equipos_uso": [],
        },
        {
            "fecha": "2026-03-10",
            "asistencia_colaboradores": [],
            "equipos_uso": [{"equipo_nombre": "Estación total", "cantidad": 1}],
        },
    ]
    ctrl = construir_control_presencia(
        subcontratista_id=5,
        fecha_inicio="2026-03-09",
        fecha_fin="2026-03-10",
        trabajadores=trabajadores,
        diarios=diarios,
    )
    assert ctrl["n_dias_esperados"] == 2  # lun+mar
    assert ctrl["tiene_alertas"] is True
    p = ctrl["personas"][0]
    assert p["dias_con_presencia"] == 1
    assert "2026-03-10" in p["fechas_sin_reporte"]
