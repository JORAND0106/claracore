"""Costo mano de obra subcontratistas — lectura N2 para rentabilidad Almacén."""
from __future__ import annotations

from almacen_mo_costo import (
    calcular_costo_mo,
    calcular_costo_mo_por_items_contrato,
    fila_rentabilidad_mo,
)
from almacen_insumos_service import filas_rentabilidad_por_insumo
from almacen_inventario_arbol import build_inventario_arbol_from_lines, make_item_key


class _FakeResp:
    def __init__(self, data):
        self.data = data


class _FakeNot:
    def __init__(self, query):
        self.query = query

    def is_(self, col, val):
        if str(val).lower() == "null":
            self.query._not_null.add(col)
        return self.query


class _FakeQuery:
    def __init__(self, table, store):
        self.table = table
        self.store = store
        self._filters = []
        self._not_null = set()
        self.not_ = _FakeNot(self)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, list(vals)))
        return self

    def execute(self):
        rows = list(self.store.get(self.table, []))
        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "in":
                rows = [r for r in rows if r.get(col) in val]
        for col in self._not_null:
            rows = [r for r in rows if r.get(col) is not None]
        return _FakeResp(rows)


class _FakeSb:
    def __init__(self, store):
        self.store = store

    def table(self, name):
        return _FakeQuery(name, self.store)


def _store_base():
    return {
        "subcontratista_precios": [
            {
                "subcontratista_id": 1,
                "contrato_id": 9,
                "precio_unitario_sub": 10,
                "listado_precios": {"capitulo": "1.", "item_numero": "10.1"},
            },
            {
                "subcontratista_id": 2,
                "contrato_id": 9,
                "precio_unitario_sub": 20,
                "listado_precios": {"capitulo": "1.", "item_numero": "10.1"},
            },
        ],
        "so_registros": [
            {
                "id": 101,
                "contrato_id": 9,
                "subcontratista_id": 1,
                "capitulo": "1.",
                "item_numero": "10.1",
                "cantidad_total": 5,
                "pk_id_id": 50,
                "nivel2_estado": "Aprobado",
                "nivel2_objeto_pago_sub": True,
                "vlr_unitario_subcontratista": 0,
            },
            {
                "id": 102,
                "contrato_id": 9,
                "subcontratista_id": 2,
                "capitulo": "1.",
                "item_numero": "10.1",
                "cantidad_total": 3,
                "pk_id_id": 51,
                "nivel2_estado": "Aprobado",
                "nivel2_objeto_pago_sub": True,
                "vlr_unitario_subcontratista": 0,
            },
            # Excluidos
            {
                "id": 103,
                "contrato_id": 9,
                "subcontratista_id": 1,
                "capitulo": "1.",
                "item_numero": "10.1",
                "cantidad_total": 99,
                "pk_id_id": 50,
                "nivel2_estado": "Pendiente",
                "nivel2_objeto_pago_sub": True,
            },
            {
                "id": 104,
                "contrato_id": 9,
                "subcontratista_id": 1,
                "capitulo": "1.",
                "item_numero": "10.1",
                "cantidad_total": 99,
                "pk_id_id": 50,
                "nivel2_estado": "Aprobado",
                "nivel2_objeto_pago_sub": False,
            },
        ],
        "pk_ids": [
            {"id": 50, "pk_id": "K1+000"},
            {"id": 51, "pk_id": "K2+000"},
        ],
    }


def test_calcular_costo_mo_sin_promediar_precios_distintos():
    sb = _FakeSb(_store_base())
    # Contrato: 5×10 + 3×20 = 110
    mo = calcular_costo_mo(9, capitulo="1.", item="10.1", sb=sb)
    assert mo["costo_insumo_linea"] == 110.0
    assert mo["cantidad"] == 8.0
    assert len(mo["desglose"]) == 2
    precios = {d["precio_unitario_sub"] for d in mo["desglose"]}
    assert precios == {10.0, 20.0}


def test_calcular_costo_mo_filtra_por_pk():
    sb = _FakeSb(_store_base())
    mo = calcular_costo_mo(9, capitulo="1.", item="10.1", pk_id_id=50, sb=sb)
    assert mo["costo_insumo_linea"] == 50.0  # solo 5×10
    assert mo["cantidad"] == 5.0


def test_batch_contrato_y_fila_rentabilidad():
    sb = _FakeSb(_store_base())
    by_item = calcular_costo_mo_por_items_contrato(9, sb=sb)
    ikey = make_item_key("1.", "10.1")
    assert ikey in by_item
    assert by_item[ikey]["costo_insumo_linea"] == 110.0
    fila = fila_rentabilidad_mo(by_item[ikey])
    assert fila["es_mo"] is True
    assert fila["costo_insumo_linea"] == 110.0
    assert fila["costo_insumo_unitario"] is None


def test_filas_rentabilidad_incluye_mo_en_total():
    rows = [
        {
            "id": 1,
            "cantidad": 10,
            "vlr_unitario_cobro": 100,
            "valor_compra_unitario": 40,
            "es_principal": True,
            "material_descripcion": "Cemento",
        },
    ]
    mo = {
        "es_mo": True,
        "etiqueta_fila": "Mano de obra (subcontratistas)",
        "costo_insumo_linea": 150,
        "cantidad": 5,
    }
    out = filas_rentabilidad_por_insumo(rows, costo_mo=mo)
    filas = out["filas"]
    assert any(f.get("es_mo") for f in filas)
    total = filas[-1]
    assert total["es_total"] is True
    assert total["costo_insumo_linea"] == 10 * 40 + 150
    assert total["utilidad_estimada_linea"] == 1000 - 550


def test_inventario_arbol_inserta_mo_sin_movimientos():
    ikey = make_item_key("1.", "10.1")
    out = build_inventario_arbol_from_lines(
        item_rows=[{
            "item_key": ikey,
            "capitulo": "1.",
            "item": "10.1",
            "descripcion": "Actividad",
            "unidad": "M3",
            "vu_cobro": 100,
            "cant_presupuestada": 10,
            "presupuesto_ids": [1],
        }],
        composition={
            ikey: [{
                "insumo_id": 7,
                "descripcion": "Material",
                "vu_costo": 30,
                "rendimiento": 1,
                "es_principal": True,
            }],
        },
        movement_lines=[],
        mo_by_item={
            ikey: {
                "es_mo": True,
                "etiqueta_fila": "Mano de obra (subcontratistas)",
                "costo_insumo_linea": 200,
                "cantidad": 10,
            },
        },
    )
    item = out["items"][0]
    mo_rows = [i for i in item["insumos"] if i.get("es_mo")]
    assert len(mo_rows) == 1
    assert mo_rows[0]["costo_contribucion"] == 200
    assert mo_rows[0]["valor_entradas"] is None
    assert mo_rows[0]["valor_salidas"] is None
    assert mo_rows[0]["valor_stock"] is None
    # utilidad unitaria con MO amortizada: 100 - (30 + 200/10) = 50
    assert item["utilidad"] == 50.0
    assert item["costo_mo"] == 200.0
