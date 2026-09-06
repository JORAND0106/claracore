"""Inventario árbol: agregación capítulo → ítem → insumos."""
from unittest.mock import MagicMock

from almacen_inventario_arbol import (
    build_inventario_arbol_from_lines,
    invalidar_cache_inventario_arbol,
    list_inventario_arbol,
    _fetch_oc_rows,
    _fetch_proveedor_map,
    make_capitulo_key,
    make_item_key,
)


def test_make_item_key_normaliza():
    assert make_item_key("01 Cap", "1.01.") == make_item_key("01 Cap", "1.01")
    assert make_capitulo_key("01 Cap") == make_capitulo_key("01  Cap")


def test_build_arbol_capitulo_item_insumos_financieros_y_rentabilidad():
    item_rows = [
        {
            "item_key": "01|01.01",
            "capitulo": "01",
            "item": "01.01",
            "descripcion": "Excavación",
            "unidad": "m3",
            "vu_cobro": 80000,
            "presupuesto_ids": [10],
            "cant_presupuestada": 100,
        },
        {
            "item_key": "01|01.02",
            "capitulo": "01",
            "item": "01.02",
            "descripcion": "Relleno",
            "unidad": "m3",
            "vu_cobro": 50000,
            "presupuesto_ids": [11],
        },
        {
            "item_key": "02|02.01",
            "capitulo": "02",
            "item": "02.01",
            "descripcion": "Otro cap",
            "unidad": "UND",
            "vu_cobro": 1000,
            "presupuesto_ids": [12],
        },
    ]
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
        "01|01.02": [{
            "insumo_id": 3,
            "codigo": "INS-C",
            "descripcion": "Tierra",
            "unidad": "m3",
            "es_principal": True,
            "rendimiento": 1,
            "vu_costo": 15000,
        }],
    }
    movements = [
        {
            "item_key": "01|01.01",
            "insumo_id": 1,
            "orden_compra_id": 100,
            "numero_oc": 45,
            "proveedor_nombre": "Acme",
            "estado": "parcial",
            "material_descripcion": "Arena",
            "unidad": "m3",
            "valor_unitario": 20000,
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
            "orden_compra_id": 100,
            "numero_oc": 45,
            "proveedor_nombre": "Acme",
            "estado": "parcial",
            "material_descripcion": "Arena fina",
            "unidad": "m3",
            "valor_unitario": 20000,
            "entradas": 5,
            "salidas": 1,
            "saldo": 4,
            "valor_entradas": 100000,
            "valor_salidas": 20000,
            "valor_stock": 80000,
        },
        {
            "item_key": "01|01.01",
            "insumo_id": 2,
            "orden_compra_id": 200,
            "numero_oc": 46,
            "proveedor_nombre": "Beta",
            "estado": "completa",
            "material_descripcion": "Cemento",
            "unidad": "kg",
            "valor_unitario": 100,
            "entradas": 100,
            "salidas": 20,
            "saldo": 80,
            "valor_entradas": 10000,
            "valor_salidas": 2000,
            "valor_stock": 8000,
        },
        {
            # OC asociada al cemento sin entrada aún (trazabilidad incompleta)
            "item_key": "01|01.01",
            "insumo_id": 2,
            "orden_compra_id": 201,
            "numero_oc": 47,
            "proveedor_nombre": "Gamma",
            "estado": "aprobada",
            "material_descripcion": "Cemento",
            "unidad": "kg",
            "valor_unitario": 100,
            "entradas": 0,
            "salidas": 0,
            "saldo": 0,
            "valor_entradas": 0,
            "valor_salidas": 0,
            "valor_stock": 0,
        },
        {
            "item_key": "01|01.02",
            "insumo_id": 3,
            "orden_compra_id": 100,
            "numero_oc": 45,
            "proveedor_nombre": "Acme",
            "estado": "parcial",
            "material_descripcion": "Tierra",
            "unidad": "m3",
            "valor_unitario": 15000,
            "entradas": 2,
            "salidas": 0,
            "saldo": 2,
            "valor_entradas": 30000,
            "valor_salidas": 0,
            "valor_stock": 30000,
        },
    ]
    out = build_inventario_arbol_from_lines(
        item_rows=item_rows,
        composition=composition,
        movement_lines=movements,
    )
    assert len(out["capitulos"]) == 2
    cap01 = next(c for c in out["capitulos"] if c["capitulo"] == "01")
    assert len(cap01["items"]) == 2
    # Capítulos/ítems en valor financiero
    assert cap01["valor_entradas"] == 340000
    assert cap01["valor_salidas"] == 102000
    assert cap01["valor_stock"] == 238000
    assert cap01["stock"] == 238000

    item = next(i for i in cap01["items"] if i["item"] == "01.01")
    assert item["vu_cobro"] == 80000
    assert item["vu_costo"] == 25000  # 20000*1 + 100*50
    assert item["utilidad"] == 55000
    assert item["rentabilidad_pct"] == 68.75  # 55000/80000*100
    assert item["valor_entradas"] == 310000
    assert item["valor_salidas"] == 102000
    assert item["valor_stock"] == 208000
    assert item["stock"] == 208000

    # Nivel 3: insumos reales con valores de entrada/salida
    assert len(item["insumos"]) == 2
    arena = next(i for i in item["insumos"] if i["insumo_id"] == 1)
    assert arena["descripcion"] == "Arena"
    assert arena["vu_costo"] == 20000
    assert arena["es_principal"] is True
    assert arena["valor_entradas"] == 300000
    assert arena["valor_salidas"] == 100000
    assert arena["valor_stock"] == 200000
    assert len(arena["ordenes_compra"]) == 1
    oc_arena = arena["ordenes_compra"][0]
    assert oc_arena["numero_oc"] == 45
    assert oc_arena["tiene_entrada"] is True
    assert oc_arena["tiene_salida"] is True
    assert oc_arena["valor_entradas"] == 300000

    cemento = next(i for i in item["insumos"] if i["insumo_id"] == 2)
    assert cemento["descripcion"] == "Cemento"
    assert cemento["vu_costo"] == 100
    assert cemento["es_principal"] is False
    assert cemento["costo_contribucion"] == 5000
    assert cemento["valor_entradas"] == 10000
    assert cemento["valor_salidas"] == 2000
    assert cemento["valor_stock"] == 8000
    assert len(cemento["ordenes_compra"]) == 2
    oc_con_mov = next(o for o in cemento["ordenes_compra"] if o["numero_oc"] == 46)
    assert oc_con_mov["tiene_entrada"] is True
    assert oc_con_mov["tiene_salida"] is True
    oc_sin_ent = next(o for o in cemento["ordenes_compra"] if o["numero_oc"] == 47)
    assert oc_sin_ent["tiene_entrada"] is False
    assert oc_sin_ent["tiene_salida"] is False
    assert oc_sin_ent["numero_oc_fmt"] == "#00047"

    tierra = next(
        i for i in next(x for x in cap01["items"] if x["item"] == "01.02")["insumos"]
        if i["insumo_id"] == 3
    )
    assert tierra["valor_entradas"] == 30000
    assert tierra["valor_salidas"] == 0
    assert tierra["ordenes_compra"][0]["tiene_entrada"] is True
    assert tierra["ordenes_compra"][0]["tiene_salida"] is False

    assert all("Varios" not in (i.get("descripcion") or "") for i in item["insumos"])
    assert item["ordenes_compra"] == []
    assert out["resumen"]["valor_stock"] == 238000


def test_build_arbol_item_sin_movimientos_con_insumos():
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
    assert len(out["capitulos"]) == 1
    item = out["capitulos"][0]["items"][0]
    assert item["vu_costo"] == 400
    assert item["utilidad"] == 600
    assert item["rentabilidad_pct"] == 60.0
    assert item["valor_stock"] == 0
    assert len(item["insumos"]) == 1
    assert item["insumos"][0]["descripcion"] == "Solo catálogo"


def test_fetch_oc_rows_fallback_sin_proveedor_id():
    sb = MagicMock()
    calls = {"n": 0}

    def table(name):
        q = MagicMock()
        assert name == "almacen_orden_compra"

        def execute():
            calls["n"] += 1
            if calls["n"] == 1:
                raise Exception("column almacen_orden_compra.proveedor_id does not exist code 42703")
            res = MagicMock()
            res.data = [{"id": 3, "numero_oc": 9, "proveedor_nombre": "Acme"}]
            return res

        q.select.return_value.in_.return_value.execute.side_effect = execute
        return q

    sb.table.side_effect = table
    out = _fetch_oc_rows(sb, [3])
    assert out[3]["proveedor_nombre"] == "Acme"
    assert calls["n"] == 2


def test_fetch_proveedor_map_usa_razon_social():
    sb = MagicMock()

    def table(name):
        q = MagicMock()
        assert name == "almacen_proveedor"
        q.select.return_value.in_.return_value.execute.return_value.data = [
            {"id": 9, "razon_social": "Pavco S.A."},
        ]
        return q

    sb.table.side_effect = table
    out = _fetch_proveedor_map(sb, [9])
    assert out[9] == "Pavco S.A."


def test_fetch_proveedor_map_fallback_sin_razon_social():
    sb = MagicMock()
    calls = {"n": 0}

    def table(name):
        q = MagicMock()

        def execute():
            calls["n"] += 1
            if calls["n"] == 1:
                raise Exception("column almacen_proveedor.nombre does not exist code 42703")
            res = MagicMock()
            res.data = [{"id": 2}]
            return res

        q.select.return_value.in_.return_value.execute.side_effect = execute
        return q

    sb.table.side_effect = table
    out = _fetch_proveedor_map(sb, [2])
    assert out[2] == "Proveedor #2"
    assert calls["n"] == 2


def test_list_inventario_arbol_devuelve_listado_si_enrich_falla(monkeypatch):
    """Si falla el enriquecimiento, igual debe devolver ítems del listado por capítulo."""
    import almacen_inventario_arbol as mod

    invalidar_cache_inventario_arbol()

    monkeypatch.setattr(
        "almacen_insumos_service._fetch_all_listado_rows",
        lambda *_a, **_k: [
            {
                "capitulo": "01",
                "item_numero": "01.01",
                "descripcion": "Excavación",
                "unidad": "m3",
                "precio_unitario": 1000,
            },
            {
                "capitulo": "01",
                "item_numero": "01.02",
                "descripcion": "Relleno",
                "unidad": "m3",
                "precio_unitario": 2000,
            },
        ],
    )
    monkeypatch.setattr("almacen_service.list_presupuesto_items", lambda *_a, **_k: [])
    monkeypatch.setattr("almacen_service._sb", lambda: MagicMock())
    monkeypatch.setattr(
        mod,
        "_enrich_inventario_movimientos",
        lambda **_k: (_ for _ in ()).throw(
            RuntimeError("column almacen_proveedor.nombre does not exist")
        ),
    )

    out = list_inventario_arbol(1614)
    assert len(out["items"]) == 2
    assert len(out["capitulos"]) == 1
    assert out["capitulos"][0]["capitulo"] == "01"
    assert out["items"][0]["vu_cobro"] == 1000
    assert out["items"][1]["descripcion"] == "Relleno"
    assert out["items"][0]["valor_stock"] == 0
    assert out["items"][0]["insumos"] == []
    assert out["items"][0]["ordenes_compra"] == []


def test_invalidar_cache_arbol():
    invalidar_cache_inventario_arbol()
    invalidar_cache_inventario_arbol(42)
