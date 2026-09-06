"""Rentabilidad por OC — agregada a nivel de ítem de presupuesto."""
from almacen_insumos_service import (
    _agregar_lineas_rentabilidad_item,
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


def test_agregar_lineas_principal_mas_asociados():
    """Geocelda (principal) + pines + geotextil bajo el mismo ítem → costo sumado."""
    rows = [
        {
            "id": 1,
            "cantidad": 100,
            "vlr_unitario_cobro": 50,
            "valor_compra_unitario": 30,
            "es_principal": True,
        },
        {
            "id": 2,
            "cantidad": 200,
            "vlr_unitario_cobro": 0,
            "valor_compra_unitario": 2,
            "es_principal": False,
        },
        {
            "id": 3,
            "cantidad": 100,
            "vlr_unitario_cobro": 0,
            "valor_compra_unitario": 5,
            "es_principal": False,
        },
    ]
    col = _agregar_lineas_rentabilidad_item(rows)
    # Cantidad de cobro = solo la principal (vlr > 0)
    assert col["cantidad"] == 100
    assert col["valor_cobro_linea"] == 5000  # 100 * 50
    # Costo = 100*30 + 200*2 + 100*5 = 3000 + 400 + 500 = 3900
    assert col["costo_insumo_linea"] == 3900
    assert col["utilidad_estimada_linea"] == 1100
    assert col["rentabilidad_pct"] == 22.0


def test_agregar_lineas_override_actual_no_duplica():
    rows = [
        {"id": 10, "cantidad": 10, "vlr_unitario_cobro": 100, "valor_compra_unitario": 40, "es_principal": True},
        {"id": 11, "cantidad": 5, "vlr_unitario_cobro": 0, "valor_compra_unitario": 20, "es_principal": False},
    ]
    col = _agregar_lineas_rentabilidad_item(
        rows,
        override_actual={
            "id": 10,
            "cantidad": 12,
            "vlr_unitario_cobro": 100,
            "valor_compra_unitario": 40,
        },
    )
    assert col["cantidad"] == 12
    assert col["valor_cobro_linea"] == 1200
    assert col["costo_insumo_linea"] == 12 * 40 + 5 * 20
