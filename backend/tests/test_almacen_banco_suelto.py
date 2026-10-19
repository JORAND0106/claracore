"""Banco × rendimiento y redondeo de la OC a 2 decimales."""
from almacen_banco_suelto import (
    TEXTO_SALDO_SIN_INSUMO,
    aplicar_conversion_resumen,
    evaluar_conversion,
    factor_banco_a_suelto,
)
from almacen_orden_compra_pdf import _fmt_money, _lineas_y_totales


def test_factor_1_o_vacio_no_convierte():
    assert factor_banco_a_suelto(None) is None
    assert factor_banco_a_suelto("") is None
    assert factor_banco_a_suelto(0) is None
    assert factor_banco_a_suelto(1) is None
    assert factor_banco_a_suelto("1.000") is None
    assert factor_banco_a_suelto(1.3) == 1.3


def test_recebo_13_no_supera_y_13_01_si():
    meta = evaluar_conversion(10, 1.3, "m³", tiene_insumo=True)
    assert meta["cant_disponible_suelto"] == 13.0
    assert meta["conversion_banco_suelto"] is True
    assert meta["texto_conversion"] == (
        "Presupuesto 10,00 m³ en banco × rendimiento 1,30 = 13,00 m³ disponibles"
    )
    # 13 sueltos contra 13 disponibles: no supera.
    assert meta["cant_disponible_suelto"] - 13 >= -0.0001
    # 13,01 pide justificación.
    assert (meta["cant_disponible_suelto"] - 13.01) < -0.0001


def test_rendimiento_1_conserva_el_banco():
    meta = evaluar_conversion(10, 1, "m³", tiene_insumo=True)
    assert meta["cant_disponible_suelto"] == 10
    assert meta["conversion_banco_suelto"] is False
    assert meta["texto_conversion"] == ""
    assert (meta["cant_disponible_suelto"] - 10.01) < -0.0001


def test_sin_insumo_no_convierte_y_lo_dice():
    meta = evaluar_conversion(10, None, "m³", tiene_insumo=False)
    assert meta["cant_disponible_suelto"] == 10
    assert meta["conversion_pendiente"] is True
    assert meta["texto_conversion"] == TEXTO_SALDO_SIN_INSUMO
    nodos = aplicar_conversion_resumen(
        [{"cant_total": 10, "cant_solicitada_acumulada": 0, "saldo_disponible": 10, "unidad": "m³"}],
        None,
        tiene_insumo=False,
    )
    assert nodos[0]["saldo_disponible"] == 10
    assert nodos[0]["cant_total"] == 10
    assert "insumo" in nodos[0]["texto_conversion"]


def test_resumen_convierte_el_saldo_y_deja_el_banco():
    nodos = aplicar_conversion_resumen(
        [{"cant_total": 10, "cant_solicitada_acumulada": 2, "saldo_disponible": 8, "unidad": "m3"}],
        1.3,
        tiene_insumo=True,
    )
    assert nodos[0]["cant_total"] == 10
    assert nodos[0]["cant_disponible_suelto"] == 13.0
    assert nodos[0]["saldo_disponible"] == 11.0


def test_apply_saldo_recebo_marca_13_01_y_no_pisa_el_banco(monkeypatch):
    import almacen_insumos_service as insumos

    class _Resp:
        def __init__(self, data):
            self.data = data

    class _Q:
        def __init__(self, table):
            self.table = table

        def select(self, *_a, **_k):
            return self

        def in_(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            if self.table == "almacen_insumo":
                return _Resp([{
                    "id": 5,
                    "rendimiento": 1.3,
                    "cantidad_negociada": None,
                    "unidad": "m3",
                    "codigo": "REC",
                    "descripcion": "Recebo",
                }])
            return _Resp([])

    class _Sb:
        def table(self, name):
            return _Q(name)

    monkeypatch.setattr(insumos, "batch_cantidad_solicitada_acumulada", lambda *_a, **_k: {(10, "PK-1"): 0.0})
    monkeypatch.setattr(insumos, "batch_cantidad_consumida_insumo", lambda *_a, **_k: {})
    monkeypatch.setattr(insumos, "_sb", lambda: _Sb())

    def _item(cantidad):
        return {
            "presupuesto_id": 10,
            "pk_id": "PK-1",
            "capitulo": "1",
            "item": "1.01",
            "cantidad": cantidad,
            "cant_presupuestada": 10,
            "vlr_unitario_cobro": 1000,
            "insumo_id": 5,
            "unidad": "m³",
            "es_principal": True,
        }

    dentro = _item(13)
    fuera = _item(13.01)
    insumos.apply_saldo_flags_batch(1, [dentro], descontar_linea_actual=True, refresh_listado=False)
    insumos.apply_saldo_flags_batch(1, [fuera], descontar_linea_actual=True, refresh_listado=False)
    assert dentro["supera_presupuesto"] is False
    assert fuera["supera_presupuesto"] is True
    assert dentro["cant_presupuestada"] == 10
    assert dentro["contexto_presupuesto"]["cant_disponible_suelto"] == 13.0
    assert "en banco" in dentro["contexto_presupuesto"]["texto_conversion"]

    igual = _item(10)
    igual["insumo_id"] = None
    insumos.apply_saldo_flags_batch(1, [igual], descontar_linea_actual=True, refresh_listado=False)
    assert igual["supera_presupuesto"] is False
    assert igual["contexto_presupuesto"]["conversion_pendiente"] is True


def test_pdf_total_cuesta_igual_que_la_suma_de_lineas_con_iva():
    items = [
        {"solicitud_item_id": 1, "cantidad": 1.5, "valor_unitario": 10.01, "unidad": "m3", "material_descripcion": "Recebo"},
        {"solicitud_item_id": 2, "cantidad": 2, "valor_unitario": 119, "unidad": "m", "material_descripcion": "B"},
    ]
    sol_items = {
        1: {"id": 1, "insumo_id": 1},
        2: {"id": 2, "insumo_id": 2},
    }
    insumo_map = {
        1: {"tipo_impuesto": "iva", "impuesto_porcentaje": 19},
        2: {"tipo_impuesto": "iva", "impuesto_porcentaje": 19},
    }
    _rows, tot = _lineas_y_totales(items, sol_items, insumo_map)
    esperado = round(1.5 * 10.01, 2) + round(2 * 119, 2)
    assert tot["total"] == esperado
    assert _fmt_money(13) == "$ 13,00"
    assert _fmt_money(1234.5) == "$ 1.234,50"
    assert _fmt_money(tot["total"]) == _fmt_money(esperado)
