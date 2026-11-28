"""Tests de la regla única de cantidad_total SICOE."""

from sicoe_cantidad_redondeo import (
    calcular_cantidad_con_redondeo,
    cantidad_total_cumple_regla,
    decimales_cantidad_total,
    formatear_cantidad_total,
    redondear_cantidad_total_dinamico,
    redondear_dimension,
)


def test_entero_sin_decimales():
    assert redondear_cantidad_total_dinamico(24) == 24.0
    assert calcular_cantidad_con_redondeo(2, 3, 4, 1) == 24.0
    assert redondear_cantidad_total_dinamico(5.004) == 5.0


def test_dos_decimales_cuando_no_entero():
    assert calcular_cantidad_con_redondeo(5, 0.3, None, None) == 1.5
    assert redondear_cantidad_total_dinamico(1.567) == 1.57


def test_menor_0_01_conserva_si_2dp_seria_cero():
    assert calcular_cantidad_con_redondeo(0.25, 0.015, None, None) == 0.004
    assert redondear_cantidad_total_dinamico(0.00375) == 0.004
    assert redondear_cantidad_total_dinamico(0.009) == 0.01


def test_varilla_peso_3dp_cant_sigue_regla():
    assert redondear_cantidad_total_dinamico(6 * 0.994 * 4) == 23.86


def test_dimension_y_formato():
    assert redondear_dimension(0.015) == 0.015
    assert calcular_cantidad_con_redondeo(None, None, None, None) == 0.0
    assert decimales_cantidad_total(24) == 0
    assert decimales_cantidad_total(1.5) == 2
    assert decimales_cantidad_total(0.004) == 3
    assert formatear_cantidad_total(24) == "24"
    assert formatear_cantidad_total(1.5) == "1.50"
    assert formatear_cantidad_total(0.004) == "0.004"
    assert cantidad_total_cumple_regla(0.004) is True
    assert cantidad_total_cumple_regla(1.567) is False
