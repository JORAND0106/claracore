"""Rentabilidad por OC — insumo + ítem de cobro."""
from almacen_insumos_service import (
    _columna_rentabilidad,
    _fila_rentabilidad_oc,
    _merge_columnas_rentabilidad,
    get_analisis_rentabilidad_acumulada,
)


def test_columna_rentabilidad_utilidad_y_pct():
    col = _columna_rentabilidad(10, 100, 70)
    assert col["valor_cobro_linea"] == 1000
    assert col["costo_insumo_linea"] == 700
    assert col["utilidad_estimada_linea"] == 300
    assert col["rentabilidad_pct"] == 30.0


def test_merge_columnas_actual():
    a = _columna_rentabilidad(5, 100, 80)
    b = _columna_rentabilidad(10, 100, 70)
    total = _merge_columnas_rentabilidad(a, b)
    assert total["cantidad"] == 15
    assert total["valor_cobro_linea"] == 1500
    assert total["costo_insumo_linea"] == 1100
    assert total["utilidad_estimada_linea"] == 400


def test_fila_rentabilidad_oc_actual():
    col = _fila_rentabilidad_oc(
        {"id": 1, "cantidad": 5, "vlr_unitario_cobro": 100, "valor_compra_unitario": 70, "solicitud_id": 9},
        es_actual=True,
        sol={"consecutivo": 12, "estado": "aprobada"},
        oc={"numero_oc": 45},
        vu_cobro_default=100,
        vc_default=70,
    )
    assert col["es_actual"] is True
    assert col["numero_oc"] == 45
    assert col["etiqueta_fila"] == "Esta solicitud"
    assert col["valor_cobro_linea"] == 500


def test_analisis_sin_insumo_id_solo_fila_actual():
    r = get_analisis_rentabilidad_acumulada(
        1,
        solicitud_item_id=99,
        insumo_id=None,
        capitulo="CC",
        item_cobro="1614",
        cantidad_presente=2,
        valor_compra_unitario=50,
        valor_cobro_unitario=100,
    )
    assert r["presente"]["cantidad"] == 2
    assert r["acumulado_anterior"]["cantidad"] == 0
    assert r["actual"]["cantidad"] == 2
