"""Costo mano de obra subcontratistas — lectura N2 para rentabilidad Almacén."""
from __future__ import annotations

from almacen_mo_costo import (
    calcular_costo_mo,
    calcular_costo_mo_por_items_contrato,
    costos_mo_desde_precios_pactados,
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
        self._range = None
        self.not_ = _FakeNot(self)

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, list(vals)))
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, start, end):
        self._range = (start, end)
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
        if self._range is not None:
            start, end = self._range
            rows = rows[start:end + 1]
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
    assert mo["costo_insumo_unitario"] == 13.75
    assert len(mo["desglose"]) == 2
    precios = {d["precio_unitario_sub"] for d in mo["desglose"]}
    assert precios == {10.0, 20.0}


def test_precio_fila_resuelve_aunque_capitulo_listado_difiere():
    """Precios en listado con capítulo largo; registro SICOE con capítulo corto."""
    store = _store_base()
    store["subcontratista_precios"] = [
        {
            "subcontratista_id": 1,
            "contrato_id": 9,
            "precio_unitario_sub": 15,
            "listado_precios": {"capitulo": "1. PRELIMINARES", "item_numero": "5."},
        },
    ]
    store["so_registros"] = [
        {
            "id": 201,
            "contrato_id": 9,
            "subcontratista_id": 1,
            "capitulo": "1.",
            "item_numero": "5.",
            "cantidad_total": 10,
            "pk_id_id": 1,
            "nivel2_estado": "Aprobado",
            "nivel2_objeto_pago_sub": True,
            "vlr_unitario_subcontratista": 0,
        },
    ]
    sb = _FakeSb(store)
    mo = calcular_costo_mo(9, capitulo="1.", item="5.", sb=sb)
    assert mo["costo_insumo_linea"] == 150.0
    assert mo["costo_insumo_unitario"] == 15.0


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
    # VU costo unificado: materiales 30 + MO 200/10 = 50
    assert item["vu_costo"] == 50.0
    # utilidad unitaria con MO amortizada: 100 - 50 = 50
    assert item["utilidad"] == 50.0
    assert item["costo_mo"] == 200.0
    assert item["rentabilidad_pct"] == 50.0


def test_inventario_arbol_mo_solo_sin_materiales_roceria():
    """Ítem solo-MO (p. ej. Rocería): VU Costo/Utilidad/% desde N2, sin insumos de catálogo."""
    ikey = make_item_key("1. PRELIMINARES", "5.")
    out = build_inventario_arbol_from_lines(
        item_rows=[{
            "item_key": ikey,
            "capitulo": "1. PRELIMINARES",
            "item": "5.",
            "descripcion": "ROCERÍA",
            "unidad": "M2",
            "vu_cobro": 942073,
            "cant_presupuestada": 100,
            "presupuesto_ids": [11],
        }],
        composition={},
        movement_lines=[],
        mo_by_item={
            ikey: {
                "es_mo": True,
                "etiqueta_fila": "Mano de obra (subcontratistas)",
                "costo_insumo_linea": 50000000,
                "cantidad": 100,
                "costo_insumo_unitario": 500000,
            },
        },
    )
    item = out["items"][0]
    assert item["vu_costo"] == 500000.0
    assert item["utilidad"] == 442073.0
    assert item["rentabilidad_pct"] is not None
    assert item["rentabilidad_pct"] > 0
    assert any(i.get("es_mo") for i in item["insumos"])
    assert not any(not i.get("es_mo") for i in item["insumos"])


def test_alinear_mo_by_item_cuando_capitulo_difiere():
    from almacen_inventario_arbol import alinear_mo_by_item

    inv_key = make_item_key("1. PRELIMINARES", "5.")
    mo_key = make_item_key("1.", "5.")
    aligned = alinear_mo_by_item(
        {inv_key: {"item": "5.", "capitulo": "1. PRELIMINARES"}},
        {
            mo_key: {
                "es_mo": True,
                "costo_insumo_linea": 1000,
                "cantidad": 2,
            },
        },
    )
    assert inv_key in aligned
    assert aligned[inv_key]["costo_insumo_linea"] == 1000


def test_roceria_precios_pactados_sin_n2_alimenta_inventario():
    """
    Caso producción: Rocería solo tiene precio en Subcontratistas (sin so_registros N2).
    VU Cobro 942073, VU M.O. con AIU 1_000_000, cantidad 10.4 HA.
    """
    store = {
        "subcontratista_precios": [
            {
                "subcontratista_id": 7,
                "contrato_id": 3,
                "listado_precio_id": 55,
                "precio_unitario_sub": 1000000,
                "precio_unitario_con_aiu": 1000000,
                "cantidad_manual": 10.4,
                "origen": "presupuesto",
                "tributos": {},
                "listado_precios": {
                    "capitulo": "1. PRELIMINARES",
                    "item_numero": "5.",
                    "unidad": "HA",
                    "descripcion": "ROCERÍA",
                },
            },
        ],
        "subcontratistas": [
            {"id": 7, "contrato_id": 3, "tributos": {}},
        ],
        "presupuesto": [
            {
                "id": 1,
                "contrato_id": 3,
                "capitulo": "1. PRELIMINARES",
                "item": "5.",
                "cant_total": 10.4,
                "subcontratista_id": 7,
                "tipo_ejecucion": "Presupuesto de Obra",
                "dado_de_baja": False,
            },
        ],
        "so_registros": [],
    }
    sb = _FakeSb(store)
    by_item = calcular_costo_mo_por_items_contrato(3, sb=sb)
    ikey = make_item_key("1. PRELIMINARES", "5.")
    assert ikey in by_item
    assert by_item[ikey]["fuente"] == "precios_pactados"
    assert by_item[ikey]["costo_insumo_unitario"] == 1000000.0

    out = build_inventario_arbol_from_lines(
        item_rows=[{
            "item_key": ikey,
            "capitulo": "1. PRELIMINARES",
            "item": "5.",
            "descripcion": "ROCERÍA",
            "unidad": "HA",
            "vu_cobro": 942073,
            "cant_presupuestada": 10.4,
            "presupuesto_ids": [1],
        }],
        composition={},
        movement_lines=[],
        mo_by_item=by_item,
    )
    item = out["items"][0]
    assert item["vu_costo"] == 1000000.0
    assert item["utilidad"] == 942073 - 1000000
    assert item["rentabilidad_pct"] is not None
    assert item["rentabilidad_pct"] < 0


def test_costos_mo_desde_precios_aplica_aiu_global():
    store = {
        "subcontratista_precios": [
            {
                "subcontratista_id": 1,
                "contrato_id": 1,
                "listado_precio_id": 9,
                "precio_unitario_sub": 100,
                "listado_precios": {"capitulo": "2.", "item_numero": "2.1"},
            },
        ],
        "subcontratistas": [
            {
                "id": 1,
                "contrato_id": 1,
                "tributos": {
                    "tipo": "iva_pleno",
                    "iva": {"porcentaje": 19},
                },
            },
        ],
        "presupuesto": [],
        "so_registros": [],
    }
    sb = _FakeSb(store)
    out = costos_mo_desde_precios_pactados(sb, 1)
    ikey = make_item_key("2.", "2.1")
    assert ikey in out
    assert out[ikey]["costo_insumo_unitario"] == 119.0
