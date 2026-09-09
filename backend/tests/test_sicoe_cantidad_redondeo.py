"""Tests del redondeo dinámico de cantidad_total SICOE."""

from sicoe_cantidad_redondeo import (
    calcular_cantidad_con_redondeo,
    decimales_cantidad_total,
    formatear_cantidad_total,
    redondear_cantidad_total_dinamico,
    redondear_dimension,
)


def test_redondeo_tres_decimales_cuando_menor_0_10():
    # 0.25 × 0.015 = 0.00375 → 0.004
    assert calcular_cantidad_con_redondeo(0.25, 0.015, None, None) == 0.004
    assert redondear_cantidad_total_dinamico(0.00375) == 0.004


def test_redondeo_dos_decimales_cuando_mayor_igual_0_10():
    assert calcular_cantidad_con_redondeo(5, 0.3, None, None) == 1.5
    assert calcular_cantidad_con_redondeo(2, 3, 4, 1) == 24.0


def test_dimension_hasta_tres_decimales():
    assert redondear_dimension(0.015) == 0.015
    assert redondear_dimension(0.00375) == 0.004
    assert redondear_dimension("1.2345") == 1.235
    assert redondear_dimension(None) is None
    assert redondear_dimension("") is None


def test_vacios_y_formato():
    assert calcular_cantidad_con_redondeo(None, None, None, None) == 0.0
    assert decimales_cantidad_total(0.004) == 3
    assert decimales_cantidad_total(1.5) == 2
    assert formatear_cantidad_total(0.004) == "0.004"
    assert formatear_cantidad_total(1.5) == "1.50"
