"""Tests unitarios — cálculo de nómina colombiana."""
from __future__ import annotations

from datetime import date

from rrhh_nomina_calc import (
    calcular_extras,
    calcular_fsp,
    calcular_item_colaborador,
    calcular_liquidacion,
    calcular_novedades,
    periodo_fechas,
)
from rrhh_nomina_params import params_for_year
from rrhh_nomina_xlsx import build_nomina_xlsx


def test_periodo_mensual_y_quincenal():
    fi, ff = periodo_fechas(anio=2026, mes=9, periodicidad="mensual")
    assert fi == date(2026, 9, 1) and ff == date(2026, 9, 30)

    fi, ff = periodo_fechas(anio=2026, mes=9, periodicidad="quincenal", quincena=1)
    assert fi == date(2026, 9, 1) and ff == date(2026, 9, 15)

    fi, ff = periodo_fechas(anio=2026, mes=9, periodicidad="quincenal", quincena=2)
    assert fi == date(2026, 9, 16) and ff == date(2026, 9, 30)


def test_fsp_bajo_umbral_es_cero():
    p = params_for_year(2026)
    assert calcular_fsp(p.smmlv * 3, p.smmlv) == 0.0
    assert calcular_fsp(p.smmlv * 4, p.smmlv) > 0


def test_extras_diurna():
    p = params_for_year(2026)
    salario = 2_200_000
    br = calcular_extras(salario, p, [
        {"tipo": "extra_diurna", "cantidad_horas": 4},
        {"tipo": "bonificacion", "valor_fijo": 100_000},
    ])
    assert br.valor_bonificaciones == 100_000
    assert br.valor_extras > 0
    assert br.total == br.valor_extras + br.valor_bonificaciones


def test_novedades_descuento():
    fi, ff = date(2026, 9, 1), date(2026, 9, 30)
    nov = calcular_novedades(
        3_000_000,
        30,
        fi,
        ff,
        [{"tipo": "ausencia", "fecha_inicio": "2026-09-10", "fecha_fin": "2026-09-12",
          "dias": 3, "porcentaje_pago": 0}],
    )
    assert nov.descuento == 300_000.0  # 3 días * 100_000


def test_item_colaborador_mensual_basico():
    p = params_for_year(2026)
    trab = {
        "id": 1,
        "nombres": "Ana",
        "apellidos": "Pérez",
        "tipo_documento": "CC",
        "numero_documento": "123",
        "salario": 2_000_000,
        "subsidio_transporte": True,
        "arl_nivel_riesgo": "I",
        "email": "ana@example.com",
        "periodicidad": "mensual",
    }
    fi, ff = periodo_fechas(anio=2026, mes=3, periodicidad="mensual")
    item = calcular_item_colaborador(
        trab,
        params=p,
        periodicidad="mensual",
        anio=2026,
        mes=3,
        fecha_inicio=fi,
        fecha_fin=ff,
        novedades=[],
        horas_extras=[],
    )
    assert item.salario_periodo == 2_000_000
    assert item.subsidio_transporte == p.auxilio_transporte
    assert item.deduccion_salud > 0
    assert item.deduccion_pension > 0
    assert item.neto_pagar == item.total_devengado - item.total_deducciones
    assert item.prov_cesantias > 0
    assert item.aporte_arl > 0


def test_liquidacion_usa_provisiones():
    trab = {
        "id": 2,
        "nombres": "Luis",
        "apellidos": "Gómez",
        "salario": 3_000_000,
        "fecha_ingreso": "2025-01-01",
        "email": "luis@example.com",
    }
    liq = calcular_liquidacion(
        trab,
        fecha_retiro=date(2026, 6, 30),
        causa="Renuncia",
        provisiones={
            "cesantias": 500_000,
            "interes_cesantias": 30_000,
            "prima": 400_000,
            "vacaciones": 200_000,
        },
        salario_pendiente=100_000,
        indemnizacion=0,
    )
    assert liq.cesantias == 500_000
    assert liq.total_liquidacion == 100_000 + 200_000 + 500_000 + 30_000 + 400_000


def test_xlsx_build_bytes():
    nomina = {
        "periodicidad": "mensual",
        "anio": 2026,
        "mes": 9,
        "fecha_inicio": "2026-09-01",
        "fecha_fin": "2026-09-30",
        "estado": "cerrada",
        "smmlv_usado": 1_750_000,
    }
    items = [{
        "trabajador_id": 1,
        "salario_base": 2_000_000,
        "salario_periodo": 2_000_000,
        "valor_extras": 0,
        "valor_recargos": 0,
        "valor_bonificaciones": 0,
        "descuento_novedades": 0,
        "subsidio_transporte": 0,
        "total_devengado": 2_000_000,
        "deduccion_salud": 80_000,
        "deduccion_pension": 80_000,
        "deduccion_fsp": 0,
        "total_deducciones": 160_000,
        "neto_pagar": 1_840_000,
        "aporte_salud_patronal": 0,
        "aporte_pension_patronal": 240_000,
        "aporte_arl": 10_000,
        "aporte_caja": 80_000,
        "aporte_sena": 0,
        "aporte_icbf": 0,
        "total_aportes_patronales": 330_000,
        "prov_cesantias": 166_666,
        "prov_interes_cesantias": 1_666,
        "prov_prima": 166_666,
        "prov_vacaciones": 83_333,
        "total_provisiones": 418_331,
        "detalle_json": {
            "nombre": "Ana Pérez",
            "documento": "CC 123",
            "email": "a@b.co",
            "arl_nivel": "I",
        },
    }]
    data = build_nomina_xlsx(nomina, items, contrato_label="Obra demo")
    assert data[:2] == b"PK"  # zip/xlsx magic
    assert len(data) > 500

    from openpyxl import load_workbook
    import io
    wb = load_workbook(io.BytesIO(data))
    assert "Parametros" in wb.sheetnames
    assert "Nómina" in wb.sheetnames
    ws = wb["Nómina"]
    # Fila 5 = primer colaborador (header en fila 4)
    assert str(ws["L5"].value).startswith("=")  # IBC fórmula
    assert str(ws["M5"].value).startswith("=")  # Total devengado
    assert str(ws["N5"].value).startswith("=")  # Ded salud
    assert str(ws["Q5"].value).startswith("=")  # Total deducciones
    assert str(ws["R5"].value).startswith("=")  # Neto
    assert str(ws["Y5"].value).startswith("=")  # Total aportes
    assert str(ws["AD5"].value).startswith("=")  # Total provisiones
    # Bases son valores numéricos
    assert ws["E5"].value == 2_000_000
    assert isinstance(ws["E5"].value, (int, float))
    # Totales con SUM
    assert str(ws["M6"].value).startswith("=SUM(")
