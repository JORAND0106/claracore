"""Liquidación de valor negociado al cambiar cotización ganadora."""
from almacen_insumo_liquidacion import (
    calcular_liquidacion_ganadora,
    calcular_saldo_por_consumir,
    calcular_valor_negociado_acumulado,
    precio_ganadora_cambio,
)


def test_precio_ganadora_cambio_detecta_centavos():
    assert precio_ganadora_cambio(10, 8) is True
    assert precio_ganadora_cambio(10, 10) is False
    assert precio_ganadora_cambio(10, 10.005) is False
    assert precio_ganadora_cambio(None, 5) is True


def test_liquidacion_congela_consumido_y_revalua_pendiente():
    liq = calcular_liquidacion_ganadora(
        cantidad_negociada=100,
        precio_anterior=10,
        precio_nuevo=8,
        cantidad_entradas=30,
        valor_consumido_congelado=0,
        cantidad_entradas_liquidada=0,
        valor_negociado_total_antes=1000,
    )
    assert liq["valor_congelado_delta"] == 300.0
    assert liq["valor_consumido_congelado"] == 300.0
    assert liq["cantidad_entradas_liquidada"] == 30.0
    assert liq["cantidad_pendiente"] == 70.0
    assert liq["valor_pendiente_revaluado"] == 560.0
    assert liq["valor_negociado_total_despues"] == 860.0
    assert liq["valor_negociado_total_antes"] == 1000.0


def test_liquidacion_acumula_congelado_en_segundo_cambio():
    liq = calcular_liquidacion_ganadora(
        cantidad_negociada=100,
        precio_anterior=8,
        precio_nuevo=7,
        cantidad_entradas=50,
        valor_consumido_congelado=300,
        cantidad_entradas_liquidada=30,
    )
    assert liq["cantidad_congelada_delta"] == 20.0
    assert liq["valor_congelado_delta"] == 160.0
    assert liq["valor_consumido_congelado"] == 460.0
    assert liq["valor_pendiente_revaluado"] == 350.0
    assert liq["valor_negociado_total_despues"] == 810.0


def test_valor_negociado_acumulado_sin_liquidacion_previa():
    assert calcular_valor_negociado_acumulado(
        cantidad_negociada=100,
        precio_actual=10,
        valor_consumido_congelado=0,
        cantidad_entradas_liquidada=0,
    ) == 1000.0


def test_valor_negociado_acumulado_con_base_congelada():
    assert calcular_valor_negociado_acumulado(
        cantidad_negociada=100,
        precio_actual=8,
        valor_consumido_congelado=300,
        cantidad_entradas_liquidada=30,
    ) == 860.0


def test_saldo_por_consumir():
    assert calcular_saldo_por_consumir(860, 300) == 560.0
    assert calcular_saldo_por_consumir(None, 100) is None
    assert calcular_saldo_por_consumir(500, 500) == 0.0
