"""Proveedor elegido en la línea y cotizaciones del insumo."""
import almacen_service as svc


def test_ofertas_marcan_una_ganadora_y_el_precio_con_iva():
    row = {
        "cotizaciones_detalle": [
            {
                "tipo": "insumo",
                "proveedor": "Ferretería Norte",
                "proveedor_id": 4,
                "numero": "C-1",
                "valor": 100,
                "es_ganadora": True,
                "impuesto": {"iva": "19"},
            },
            {
                "tipo": "insumo",
                "proveedor": "Aceros del Sur",
                "proveedor_id": 5,
                "numero": "C-9",
                "valor": 80,
                "es_ganadora": False,
                "impuesto": {"iva": "19"},
            },
        ]
    }
    ofertas = svc.ofertas_proveedor_desde_row(row)
    assert len(ofertas) == 2
    gan = svc.oferta_ganadora(ofertas)
    assert gan["proveedor_id"] == 4
    assert gan["valor"] == 119
    otra = svc.elegir_oferta_proveedor(ofertas, proveedor_id=5)
    assert otra["numero"] == "C-9"
    assert otra["valor"] == 95


def test_sin_eleccion_usa_la_ganadora():
    ofertas = [
        {"proveedor_id": 1, "proveedor_nombre": "A", "numero": "1", "es_ganadora": False, "valor": 10},
        {"proveedor_id": 2, "proveedor_nombre": "B", "numero": "2", "es_ganadora": True, "valor": 20},
    ]
    assert svc.elegir_oferta_proveedor(ofertas)["proveedor_id"] == 2


def test_proveedor_de_item_prefiere_el_guardado_sobre_la_ganadora():
    cat = {10: {"proveedor_id": 5}}
    nombres = {5: "Ganadora SAS", 8: "Elegida SAS"}
    key, pid, nombre = svc._proveedor_de_item(
        {
            "insumo_id": 10,
            "es_recurrente": False,
            "proveedor_seleccionado_id": 8,
            "proveedor_seleccionado_nombre": "Elegida SAS",
        },
        cat,
        nombres,
    )
    assert key == "id:8"
    assert pid == 8
    assert nombre == "Elegida SAS"


def test_valor_linea_prioriza_proveedor_elegido_y_si_no_la_ganadora():
    ofertas = svc.ofertas_proveedor_desde_row({
        "cotizaciones_detalle": [
            {
                "tipo": "insumo",
                "proveedor": "Ferretería Norte",
                "proveedor_id": 4,
                "numero": "C-1",
                "valor": 100,
                "es_ganadora": True,
                "impuesto": {"iva": "19"},
            },
            {
                "tipo": "insumo",
                "proveedor": "Aceros del Sur",
                "proveedor_id": 5,
                "numero": "C-9",
                "valor": 80,
                "es_ganadora": False,
                "impuesto": {"iva": "19"},
            },
        ],
    })
    elegida = {"cantidad": 2, "proveedor_seleccionado_id": 5, "valor_compra_unitario": 119}
    assert svc.valor_linea_proveedor(elegida, ofertas) == 190
    sin_eleccion = {"cantidad": 3, "valor_compra_unitario": 1}
    assert svc.valor_linea_proveedor(sin_eleccion, ofertas) == 357


def test_valor_compra_linea_usa_cantidad_por_oferta():
    it = {"cantidad": 3, "valor_compra_unitario": 119}
    svc._attach_valor_compra_linea(it)
    assert it["valor_compra_linea"] == 357
    svc._strip_economics_item(it)
    assert "valor_compra_linea" not in it
    assert "valor_compra_unitario" not in it
