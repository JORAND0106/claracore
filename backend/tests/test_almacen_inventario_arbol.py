"""Inventario árbol: agregación ítem → insumo → proveedor."""
from almacen_inventario_arbol import (
    build_inventario_arbol_from_lines,
    invalidar_cache_inventario_arbol,
)


def test_build_arbol_tres_niveles_y_resumen():
    ppto = [{
        "id": 10,
        "capitulo": "01",
        "item": "01.01",
        "descripcion": "Excavación",
        "und": "m3",
        "cant_total": 100,
        "pk_id": "120350",
    }]
    composition = {
        10: [
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
            "presupuesto_id": 10,
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
            "presupuesto_id": 10,
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
            "presupuesto_id": 10,
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
        ppto_rows=ppto,
        vu_cobro_by_ppto={10: 80000},
        composition=composition,
        movement_lines=movements,
    )
    assert len(out["items"]) == 1
    item = out["items"][0]
    assert item["vu_cobro"] == 80000
    # VU costo = 20000*1 + 100*50 = 25000
    assert item["vu_costo"] == 25000
    assert item["utilidad"] == 55000
    assert item["entradas"] == 115
    assert item["salidas"] == 29
    assert item["saldo"] == 86

    insumos = item["insumos"]
    assert len(insumos) == 2
    arena = next(i for i in insumos if i["insumo_id"] == 1)
    # Solo proveedor con saldo > 0
    assert len(arena["proveedores"]) == 1
    assert arena["proveedores"][0]["proveedor_nombre"] == "Acme"
    assert arena["proveedores"][0]["saldo"] == 6

    cemento = next(i for i in insumos if i["insumo_id"] == 2)
    assert cemento["es_principal"] is False
    assert cemento["utilidad"] == -5000  # -(100*50)

    assert out["resumen"]["valor_stock"] == 128000
    assert out["resumen"]["valor_entradas"] == 310000
    assert out["resumen"]["valor_salidas"] == 182000


def test_build_arbol_item_sin_movimientos():
    out = build_inventario_arbol_from_lines(
        ppto_rows=[{
            "id": 1,
            "capitulo": "02",
            "item": "2",
            "descripcion": "Sin stock",
            "und": "UND",
            "cant_total": 1,
        }],
        vu_cobro_by_ppto={1: 1000},
        composition={1: [{
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
    assert item["insumos"][0]["proveedores"] == []


def test_invalidar_cache_arbol():
    invalidar_cache_inventario_arbol()
    invalidar_cache_inventario_arbol(42)
