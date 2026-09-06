"""Inventario árbol: agregación ítem (listado) → insumo → proveedor."""
from unittest.mock import MagicMock

from almacen_inventario_arbol import (
    build_inventario_arbol_from_lines,
    invalidar_cache_inventario_arbol,
    _fetch_oc_rows,
    make_item_key,
)


def test_make_item_key_normaliza():
    assert make_item_key("01 Cap", "1.01.") == make_item_key("01 Cap", "1.01")


def test_build_arbol_tres_niveles_y_resumen():
    item_rows = [{
        "item_key": "01|01.01",
        "capitulo": "01",
        "item": "01.01",
        "descripcion": "Excavación",
        "unidad": "m3",
        "vu_cobro": 80000,
        "presupuesto_ids": [10],
        "cant_presupuestada": 100,
    }]
    composition = {
        "01|01.01": [
            {
                "insumo_id": 1,
                "codigo": "INS-A",
                "descripcion": "Arena",
                "unidad": "m3",
                "es_principal": True,
                "rendimiento": 1.0,
                "vu_costo": 20000,
            },
            {
                "insumo_id": 2,
                "codigo": "INS-B",
                "descripcion": "Cemento",
                "unidad": "kg",
                "es_principal": False,
                "rendimiento": 50,
                "vu_costo": 100,
            },
        ],
    }
    movements = [
        {
            "item_key": "01|01.01",
            "insumo_id": 1,
            "proveedor_id": 5,
            "proveedor_nombre": "Acme",
            "entradas": 10,
            "salidas": 4,
            "saldo": 6,
            "valor_entradas": 200000,
            "valor_salidas": 80000,
            "valor_stock": 120000,
        },
        {
            "item_key": "01|01.01",
            "insumo_id": 1,
            "proveedor_id": 7,
            "proveedor_nombre": "Beta",
            "entradas": 5,
            "salidas": 5,
            "saldo": 0,
            "valor_entradas": 100000,
            "valor_salidas": 100000,
            "valor_stock": 0,
        },
        {
            "item_key": "01|01.01",
            "insumo_id": 2,
            "proveedor_id": 5,
            "proveedor_nombre": "Acme",
            "entradas": 100,
            "salidas": 20,
            "saldo": 80,
            "valor_entradas": 10000,
            "valor_salidas": 2000,
            "valor_stock": 8000,
        },
    ]
    out = build_inventario_arbol_from_lines(
        item_rows=item_rows,
        composition=composition,
        movement_lines=movements,
    )
    assert len(out["items"]) == 1
    item = out["items"][0]
    assert item["item_key"] == "01|01.01"
    assert item["vu_cobro"] == 80000
    assert item["vu_costo"] == 25000
    assert item["utilidad"] == 55000
    assert item["entradas"] == 115
    assert item["salidas"] == 29
    assert item["saldo"] == 86

    arena = next(i for i in item["insumos"] if i["insumo_id"] == 1)
    assert len(arena["proveedores"]) == 1
    assert arena["proveedores"][0]["proveedor_nombre"] == "Acme"

    cemento = next(i for i in item["insumos"] if i["insumo_id"] == 2)
    assert cemento["utilidad"] == -5000
    assert out["resumen"]["valor_stock"] == 128000


def test_build_arbol_item_sin_movimientos():
    out = build_inventario_arbol_from_lines(
        item_rows=[{
            "item_key": "02|2",
            "capitulo": "02",
            "item": "2",
            "descripcion": "Sin stock",
            "unidad": "UND",
            "vu_cobro": 1000,
            "presupuesto_ids": [],
        }],
        composition={"02|2": [{
            "insumo_id": 9,
            "codigo": "X",
            "descripcion": "Solo catálogo",
            "unidad": "UND",
            "es_principal": True,
            "rendimiento": 1,
            "vu_costo": 400,
        }]},
        movement_lines=[],
    )
    item = out["items"][0]
    assert item["vu_costo"] == 400
    assert item["utilidad"] == 600
    assert item["saldo"] == 0


def test_fetch_oc_rows_fallback_sin_proveedor_id():
    sb = MagicMock()
    calls = {"n": 0}

    def table(name):
        q = MagicMock()
        assert name == "almacen_orden_compra"

        def execute():
            calls["n"] += 1
            if calls["n"] == 1:
                # Primera variante con proveedor_id falla
                raise Exception("column almacen_orden_compra.proveedor_id does not exist code 42703")
            res = MagicMock()
            res.data = [{"id": 3, "proveedor_nombre": "Acme"}]
            return res

        q.select.return_value.in_.return_value.execute.side_effect = execute
        return q

    sb.table.side_effect = table
    out = _fetch_oc_rows(sb, [3])
    assert out[3]["proveedor_nombre"] == "Acme"
    assert calls["n"] == 2


def test_invalidar_cache_arbol():
    invalidar_cache_inventario_arbol()
    invalidar_cache_inventario_arbol(42)
