"""Tests esquema varilla NTC 2289."""
from sicoe_varilla import (
    sicoe_calcular_cantidad_registro,
    sicoe_calcular_cantidad_varilla,
    sicoe_kg_pendiente_recaptura,
    sicoe_normalizar_diametro_varilla,
    sicoe_peso_kg_m_por_diametro,
    sicoe_unidad_es_kg,
    sicoe_validar_y_preparar_medicion_varilla,
)


def test_unidad_es_kg():
    assert sicoe_unidad_es_kg("Kg")
    assert sicoe_unidad_es_kg("kg")
    assert sicoe_unidad_es_kg("KG")
    assert not sicoe_unidad_es_kg("m³")
    assert not sicoe_unidad_es_kg("")


def test_normalizar_diametro():
    assert sicoe_normalizar_diametro_varilla("3/8") == "3/8"
    assert sicoe_normalizar_diametro_varilla("Ø 3/8") == "3/8"
    assert sicoe_normalizar_diametro_varilla("1-1/4") == "1 1/4"
    assert sicoe_normalizar_diametro_varilla("1 1/4") == "1 1/4"
    assert sicoe_normalizar_diametro_varilla("9/16") is None


def test_pesos_ntc():
    assert sicoe_peso_kg_m_por_diametro("3/8") == 0.56
    assert sicoe_peso_kg_m_por_diametro("1 1/4") == 6.40
    assert sicoe_peso_kg_m_por_diametro("2 1/4") == 20.24


def test_calculo_varilla():
    # 12 m × 0.56 × 10 = 67.2 → 67.20
    assert sicoe_calcular_cantidad_varilla(12, 0.56, 10) == 67.2
    assert sicoe_calcular_cantidad_registro(
        es_varilla=True, longitud=12, diametro_varilla="3/8", cantidad=10
    ) == 67.2


def test_calculo_estandar_sin_cambio():
    # 2×3×0.1×1 = 0.6
    assert sicoe_calcular_cantidad_registro(
        es_varilla=False, longitud=2, ancho=3, espesor=0.1, cantidad=1
    ) == 0.6


def test_pendiente_recaptura():
    assert sicoe_kg_pendiente_recaptura({"unidad": "Kg", "es_varilla": None})
    assert not sicoe_kg_pendiente_recaptura({"unidad": "Kg", "es_varilla": False})
    assert not sicoe_kg_pendiente_recaptura({"unidad": "m", "es_varilla": None})


def test_preparar_varilla_ok():
    data = {"es_varilla": True, "diametro_varilla": "1/2", "longitud": 6, "cantidad": 4}
    out, err = sicoe_validar_y_preparar_medicion_varilla(data, unidad="Kg")
    assert err is None
    assert out["diametro_varilla"] == "1/2"
    assert out["peso_kg_m"] == 0.99
    assert out["ancho"] is None
    assert out["espesor"] is None
    assert out["cantidad_total"] == sicoe_calcular_cantidad_varilla(6, 0.99, 4)


def test_preparar_varilla_diametro_invalido():
    data = {"es_varilla": True, "diametro_varilla": "9/16", "longitud": 1, "cantidad": 1}
    _, err = sicoe_validar_y_preparar_medicion_varilla(data, unidad="kg")
    assert err is not None
    assert "Diámetro" in err
