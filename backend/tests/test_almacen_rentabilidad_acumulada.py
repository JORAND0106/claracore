"""Rentabilidad por ítem — una fila por insumo + Total."""
from almacen_insumos_service import (
    _columna_rentabilidad,
    _fila_rentabilidad_oc,
    _merge_columnas_rentabilidad,
    filas_rentabilidad_por_insumo,
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


def test_filas_por_insumo_principal_mas_asociados():
    """Geocelda + pines + geotextil: filas por insumo; cobro solo principal; utilidad en Total."""
    rows = [
        {
            "id": 1,
            "cantidad": 100,
            "vlr_unitario_cobro": 50,
            "valor_compra_unitario": 30,
            "es_principal": True,
            "material_descripcion": "Geocelda",
            "numero_linea": 1,
        },
        {
            "id": 2,
            "cantidad": 200,
            "vlr_unitario_cobro": 0,
            "valor_compra_unitario": 2,
            "es_principal": False,
            "material_descripcion": "Pines de fijación",
            "numero_linea": 2,
        },
        {
            "id": 3,
            "cantidad": 100,
            "vlr_unitario_cobro": 0,
            "valor_compra_unitario": 5,
            "es_principal": False,
            "material_descripcion": "Geotextil",
            "numero_linea": 3,
        },
    ]
    out = filas_rentabilidad_por_insumo(rows, numero_oc=45, solicitud_id=9)
    assert out["modo"] == "por_insumo"
    filas = out["filas"]
    assert len(filas) == 4  # 3 insumos + Total

    principal = filas[0]
    assert principal["etiqueta_fila"] == "Geocelda"
    assert principal["es_principal"] is True
    assert principal["es_total"] is False
    assert principal["cantidad"] == 100
    assert principal["valor_cobro_linea"] == 5000
    assert principal["costo_insumo_linea"] == 3000
    assert principal["utilidad_estimada_linea"] is None

    pines = filas[1]
    assert pines["etiqueta_fila"] == "Pines de fijación"
    assert pines["es_principal"] is False
    assert pines["valor_cobro_linea"] is None
    assert pines["cantidad"] == 200
    assert pines["costo_insumo_linea"] == 400

    total = filas[-1]
    assert total["es_total"] is True
    assert total["etiqueta_fila"] == "Total ítem"
    assert total["valor_cobro_linea"] == 5000
    assert total["costo_insumo_linea"] == 3900  # 3000+400+500
    assert total["utilidad_estimada_linea"] == 1100
    assert total["rentabilidad_pct"] == 22.0
    assert total["numero_oc"] == 45


def test_filas_por_insumo_override_actual():
    rows = [
        {
            "id": 10,
            "cantidad": 10,
            "vlr_unitario_cobro": 100,
            "valor_compra_unitario": 40,
            "es_principal": True,
            "material_descripcion": "Principal",
        },
        {
            "id": 11,
            "cantidad": 5,
            "vlr_unitario_cobro": 0,
            "valor_compra_unitario": 20,
            "es_principal": False,
            "material_descripcion": "Asociado",
        },
    ]
    out = filas_rentabilidad_por_insumo(
        rows,
        override_actual={
            "id": 10,
            "cantidad": 12,
            "vlr_unitario_cobro": 100,
            "valor_compra_unitario": 40,
            "es_principal": True,
            "material_descripcion": "Principal",
        },
    )
    principal = out["filas"][0]
    total = out["filas"][-1]
    assert principal["cantidad"] == 12
    assert principal["valor_cobro_linea"] == 1200
    assert total["costo_insumo_linea"] == 12 * 40 + 5 * 20
    assert total["utilidad_estimada_linea"] == 1200 - (480 + 100)
