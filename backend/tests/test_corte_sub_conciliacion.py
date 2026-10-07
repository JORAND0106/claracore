"""Tests unitarios: AIU desglosado, valores, acumulado aislado y otros conceptos."""
from __future__ import annotations

from corte_sub_conciliacion import (
    calc_aiu_desglose,
    costo_total_otro_concepto,
    enriquecer_items_bloques,
    gran_total,
    normalizar_otros_conceptos,
    total_otros_conceptos,
    valor_por_cantidad_vu,
    validate_soporte_upload,
)


def test_calc_aiu_desglose_redondeo_por_componente():
    tributos = {
        "administracion": 5,
        "imprevistos": 3,
        "utilidad": 7,
        "iva": {"porcentaje": 19, "sobre": "utilidad"},
    }
    # CD = 1_000_000
    aiu = calc_aiu_desglose(1_000_000.4, tributos)
    assert aiu["costo_directo"] == 1_000_000
    assert aiu["valor_administracion"] == 50_000
    assert aiu["valor_imprevistos"] == 30_000
    assert aiu["valor_utilidad"] == 70_000
    # IVA sobre utilidad ya redondeada: round(70000 * 0.19) = 13300
    assert aiu["valor_iva_utilidad"] == 13_300
    assert aiu["costo_directo_mas_aiu"] == 1_000_000 + 50_000 + 30_000 + 70_000 + 13_300


def test_otros_conceptos_sin_aiu():
    filas = [
        {"descripcion": "Flete", "unidad": "UN", "cantidad": 2, "valor_unitario": 150_000.4},
        {"descripcion": "Jornal", "unidad": "HORA", "cantidad": 8, "valor_unitario": 25_000},
    ]
    n = normalizar_otros_conceptos(filas)
    assert n[0]["costo_total"] == costo_total_otro_concepto(2, 150_000.4)
    assert n[1]["costo_total"] == 200_000
    tot = total_otros_conceptos(filas)
    aiu = calc_aiu_desglose(1_000_000, {"administracion": 10})
    # Gran total = CD+AIU + otros; otros no reciben el 10% de A
    assert gran_total(aiu["costo_directo_mas_aiu"], tot) == aiu["costo_directo_mas_aiu"] + tot
    assert aiu["valor_administracion"] == 100_000
    assert tot == n[0]["costo_total"] + n[1]["costo_total"]


def test_valor_por_cantidad_vu_no_suma_almacenados():
    from sicoe_cantidad_redondeo import redondear_cantidad_total_dinamico

    cant = redondear_cantidad_total_dinamico(10.5)
    assert valor_por_cantidad_vu(10.5, 1000) == float(round(cant * 1000, 0))
    assert valor_por_cantidad_vu(3, 33333) == float(round(3 * 33333, 0))


def test_enriquecer_bloques_acumulado_y_saldo():
    presente = [
        {
            "item_numero": "1.1",
            "item_descripcion": "Exc",
            "unidad": "M3",
            "cantidad": 10,
            "vlr_unitario_sub": 1000,
            "capitulo": "I",
        }
    ]
    items = enriquecer_items_bloques(
        presente,
        cant_actualizadas={"1.1": 100, "2.1": 5},
        cant_acum_anterior={"1.1": 40},
        vu_por_item={"1.1": 1000, "2.1": 2000},
    )
    by = {it["item_numero"]: it for it in items}
    a = by["1.1"]
    assert a["cant_presente"] == 10
    assert a["cant_acumulado"] == 50  # 40 + 10
    assert a["cant_acum_anterior"] == 40
    assert a["cant_saldo"] == 50  # 100 - 50
    assert a["valor_presente"] == valor_por_cantidad_vu(10, 1000)
    assert a["valor_acumulado"] == valor_por_cantidad_vu(50, 1000)
    assert a["valor_saldo"] == valor_por_cantidad_vu(50, 1000)
    # Ítem solo en actualizadas también aparece
    assert "2.1" in by
    assert by["2.1"]["cant_presente"] == 0
    assert by["2.1"]["cant_actualizadas"] == 5


def test_aislamiento_acumulado_logica_dos_subs():
    """Simula dos subs en el mismo periodo: el acumulado de A no incluye B."""
    # Cantidades "anteriores" ya filtradas por sub A
    ant_a = {"1.1": 20.0}
    ant_b = {"1.1": 99.0}  # otro sub — no debe usarse para A
    items_a = enriquecer_items_bloques(
        [{"item_numero": "1.1", "cantidad": 5, "vlr_unitario_sub": 100}],
        cant_actualizadas={"1.1": 100},
        cant_acum_anterior=ant_a,  # solo A
    )
    assert items_a[0]["cant_acumulado"] == 25
    assert items_a[0]["cant_acumulado"] != 5 + 99
    # Si por error se pasara ant_b, el acumulado cambiaría — la API debe filtrar antes.
    assert ant_a["1.1"] != ant_b["1.1"]


def test_validate_soporte_rechaza_office():
    assert validate_soporte_upload("application/pdf", 100) == "application/pdf"
    assert validate_soporte_upload("image/jpeg", 100) == "image/jpeg"
    assert validate_soporte_upload("image/png", 100) == "image/png"
    try:
        validate_soporte_upload(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            100,
        )
        assert False, "debió rechazar Office"
    except ValueError as e:
        assert "Office" in str(e) or "permitido" in str(e).lower()


def test_aplicar_precios_sub_marca_sin_precio():
    from corte_sub_conciliacion import aplicar_precios_sub_a_items

    items = [
        {"item_numero": "1.1", "cantidad": 10, "vlr_unitario_sub": 0},
        {"item_numero": "2.1", "cantidad": 5, "vlr_unitario_sub": 0},
    ]
    out, sin = aplicar_precios_sub_a_items(items, {"1.1": 25000})
    by = {i["item_numero"]: i for i in out}
    assert by["1.1"]["vlr_unitario_sub"] == 25000
    assert by["1.1"]["costo_directo"] == valor_por_cantidad_vu(10, 25000)
    assert by["1.1"].get("sin_precio") is False
    assert by["2.1"]["sin_precio"] is True
    assert "2.1" in sin


def test_vu_costo_mo_nunca_usa_vu_cobro_del_contrato():
    """V. UNIT. del informe de subcontratista = solo mano de obra pactada."""
    from corte_sub_conciliacion import vu_costo_mo_desde_fila_precios

    # Con MO pactado: usa ese valor aunque exista VU Cobro del contrato
    assert vu_costo_mo_desde_fila_precios({
        "vu_costo_mo": 12_500,
        "vu_cobro": 33_924,
        "precio_unitario": 33_924,
    }) == 12_500
    # Sin MO: 0 (SIN PRECIO) — no caer al listado del contrato
    assert vu_costo_mo_desde_fila_precios({
        "vu_costo_mo": None,
        "vu_cobro": 297_349,
        "precio_unitario": 297_349,
    }) == 0.0
    assert vu_costo_mo_desde_fila_precios({
        "vu_costo_mo": 0,
        "vu_cobro": 1_007_517,
    }) == 0.0
    # Fila cruda de subcontratista_precios
    assert vu_costo_mo_desde_fila_precios({
        "precio_unitario_sub": 8_000,
        "vu_cobro": 50_000,
    }) == 8_000


def test_enriquecer_no_inyecta_precio_contrato_en_vlr_unitario():
    """Si falta VU Costo M.O., no rellenar V. UNIT. desde un vlr_unitario contractual."""
    presente = [
        {
            "item_numero": "1.1",
            "item_descripcion": "Exc",
            "unidad": "M3",
            "cantidad": 10,
            "vlr_unitario_sub": 0,
            # Simula valor contractual colado en el registro
            "vlr_unitario": 33_924,
            "capitulo": "I",
        }
    ]
    items = enriquecer_items_bloques(
        presente,
        cant_actualizadas={"1.1": 100},
        cant_acum_anterior={},
        vu_por_item={},  # sin precio pactado del sub
        meta_por_item={"1.1": {"descripcion": "Exc", "unidad": "M3", "vlr_unitario": 0}},
    )
    assert items[0]["vlr_unitario_sub"] == 0
    assert items[0]["sin_precio"] is True
    assert items[0]["valor_actualizadas"] == 0

    # Con VU Costo M.O. pactado: ese manda, no el del contrato
    items2 = enriquecer_items_bloques(
        presente,
        cant_actualizadas={"1.1": 100},
        cant_acum_anterior={},
        vu_por_item={"1.1": 12_500},
        meta_por_item={"1.1": {"vlr_unitario": 12_500, "tiene_vu_costo_mo": True}},
    )
    assert items2[0]["vlr_unitario_sub"] == 12_500
    assert items2[0]["valor_actualizadas"] == valor_por_cantidad_vu(100, 12_500)
    assert items2[0].get("sin_precio") is False


def test_calc_amortizacion_tope_por_saldo():
    from corte_sub_conciliacion import calc_amortizacion

    # Anticipo 1_000_000, ya amortizado 900_000, CD+AIU=500_000, 30% → bruto 150k > saldo 100k
    a = calc_amortizacion(
        500_000,
        anticipo=1_000_000,
        amortizacion_pct=30,
        amortizado_anterior=900_000,
    )
    assert a["amortizacion_presente"] == 100_000
    assert a["saldo_por_amortizar"] == 0
    assert a["tope_por_saldo"] is True
    assert a["subtotal_despues_amortizacion"] == 400_000

    # Sin anticipo: no afecta
    z = calc_amortizacion(500_000, anticipo=0, amortizacion_pct=30, amortizado_anterior=0)
    assert z["amortizacion_presente"] == 0
    assert z["subtotal_despues_amortizacion"] == 500_000

    # Saldo ya 0
    z2 = calc_amortizacion(
        500_000, anticipo=1_000_000, amortizacion_pct=10, amortizado_anterior=1_000_000
    )
    assert z2["amortizacion_presente"] == 0
    assert z2["saldo_por_amortizar"] == 0


def test_label_amortizacion_incluye_pct_y_tope_saldo():
    from corte_sub_conciliacion import label_linea_resumen_4cols, build_resumen_conciliacion_4cols

    assert label_linea_resumen_4cols(
        {"key": "amort", "pct": 30, "tope_por_saldo": False}
    ) == "Amortización del anticipo (30%)"
    assert label_linea_resumen_4cols(
        {"key": "amort", "pct": 30, "tope_por_saldo": True}
    ) == "Amortización del anticipo (30% · por saldo)"
    assert label_linea_resumen_4cols(
        {"key": "amort", "pct": None, "tope_por_saldo": True}
    ) == "Amortización del anticipo (por saldo)"

    # Tope real: anticipo casi agotado
    r = build_resumen_conciliacion_4cols(
        items=[
            {
                "valor_actualizadas": 500_000,
                "valor_presente": 500_000,
                "valor_acumulado": 500_000,
                "valor_saldo": 0,
            }
        ],
        tributos={"administracion": 0, "imprevistos": 0, "utilidad": 0, "iva": {"porcentaje": 0}},
        anticipo=1_000_000,
        amortizacion_pct=30,
        amortizado_anterior=900_000,
        otros_presente=0,
    )
    amort_ln = next(x for x in r["lineas"] if x["key"] == "amort")
    assert amort_ln["tope_por_saldo"] is True
    assert amort_ln["label"] == "Amortización del anticipo (30% · por saldo)"
    assert amort_ln["pct"] == 30


def test_gran_total_usa_subtotal_despues_amortizacion():
    from corte_sub_conciliacion import gran_total_con_amortizacion

    assert gran_total_con_amortizacion(400_000, 50_000) == 450_000
