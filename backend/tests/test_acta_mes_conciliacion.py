"""Tests unitarios de conciliación mensual (reutiliza matemática CC-SUB)."""
from __future__ import annotations

import acta_mes_conciliacion as amc


def test_tributos_from_contrato_fraccion():
    t = amc.tributos_from_contrato(0.25, 0.19)
    assert t["utilidad"] == 25.0
    assert t["iva"] == 19.0
    assert t["administracion"] is None
    assert t["imprevistos"] is None


def test_tributos_from_contrato_puntos():
    t = amc.tributos_from_contrato(25, 19)
    assert t["utilidad"] == 25.0
    assert t["iva"] == 19.0


def test_calc_aiu_contrato_unico_con_iva_sobre_utilidad():
    tributos = amc.tributos_from_contrato(0.25, 0.19)
    aiu = amc.calc_aiu_desglose(1_000_000, tributos)
    assert aiu["costo_directo"] == 1_000_000
    assert aiu["valor_utilidad"] == 250_000  # 25% CD
    assert aiu["valor_iva_utilidad"] == 47_500  # 19% de utilidad
    assert aiu["valor_administracion"] == 0
    assert aiu["costo_directo_mas_aiu"] == 1_000_000 + 250_000 + 47_500


def test_relabel_lineas_omite_a_i_y_renombra_utilidad_a_aiu():
    r = amc.build_resumen_contrato_4cols(
        items=[
            {
                "item_numero": "1.1",
                "cantidad": 10,
                "vlr_unitario_sub": 1000,
                "cant_actualizadas": 100,
                "valor_actualizadas": 100_000,
                "cant_presente": 10,
                "valor_presente": 10_000,
                "cant_acumulado": 10,
                "valor_acumulado": 10_000,
                "cant_saldo": 90,
                "valor_saldo": 90_000,
                "costo_directo": 10_000,
            }
        ],
        tributos=amc.tributos_from_contrato(0.10, 0.19),
        anticipo=50_000,
        amortizacion_pct=20,
        amortizado_anterior=0,
        otros_presente=0,
    )
    keys = [ln["key"] for ln in r["lineas"]]
    assert "a" not in keys
    assert "i" not in keys
    assert "u" in keys
    u = next(ln for ln in r["lineas"] if ln["key"] == "u")
    assert u["nombre"] == "AIU"
    assert "AIU" in (u.get("label") or "")
    assert "Utilidad" not in (u.get("label") or "")
    assert "amort" in keys
    assert "gran_total" in keys


def test_amortizacion_tope_y_acumulado_segunda_acta():
    tributos = amc.tributos_from_contrato(0.0, None)
    # CD presente = 100_000 → CD+AIU = 100_000; amort 30% = 30_000
    items1 = [
        {
            "cant_actualizadas": 0,
            "valor_actualizadas": 200_000,
            "cant_presente": 1,
            "valor_presente": 100_000,
            "cant_acumulado": 1,
            "valor_acumulado": 100_000,
            "cant_saldo": 0,
            "valor_saldo": 100_000,
            "costo_directo": 100_000,
            "vlr_unitario_sub": 100_000,
            "cantidad": 1,
        }
    ]
    r1 = amc.build_resumen_contrato_4cols(
        items=items1,
        tributos=tributos,
        anticipo=50_000,
        amortizacion_pct=30,
        amortizado_anterior=0,
        otros_presente=0,
    )
    amort1 = next(ln for ln in r1["lineas"] if ln["key"] == "amort")
    # 30% de 100k = 30k, pero anticipo=50k → presente 30k
    assert amort1["valores"]["presente"] == 30_000
    assert amort1["valores"]["actualizadas"] == 50_000
    assert amort1["valores"]["saldo"] == 20_000

    # 2ª acta: amortizado_anterior=30_000; 30% de 100k=30k > saldo 20k → tope
    items2 = [
        {
            "cant_actualizadas": 0,
            "valor_actualizadas": 200_000,
            "cant_presente": 1,
            "valor_presente": 100_000,
            "cant_acumulado": 2,
            "valor_acumulado": 200_000,
            "cant_saldo": 0,
            "valor_saldo": 0,
            "costo_directo": 100_000,
            "vlr_unitario_sub": 100_000,
            "cantidad": 1,
        }
    ]
    r2 = amc.build_resumen_contrato_4cols(
        items=items2,
        tributos=tributos,
        anticipo=50_000,
        amortizacion_pct=30,
        amortizado_anterior=30_000,
        otros_presente=0,
        aiu_otros_anterior={"amortizacion_presente": 30_000, "costo_directo": 100_000},
    )
    amort2 = next(ln for ln in r2["lineas"] if ln["key"] == "amort")
    assert amort2["valores"]["presente"] == 20_000  # tope por saldo
    assert amort2.get("tope_por_saldo") is True
    assert amort2["valores"]["acumulado"] == 50_000
    assert amort2["valores"]["saldo"] == 0
    assert "por saldo" in (amort2.get("label") or "")


def test_filtrar_items_solo_presente_o_acumulado():
    items = [
        {"cant_presente": 0, "cant_acumulado": 0, "item_numero": "x"},
        {"cant_presente": 1, "cant_acumulado": 0, "item_numero": "y"},
        {"cant_presente": 0, "cant_acumulado": 2, "item_numero": "z"},
    ]
    out = amc.filtrar_items_con_cantidades(items)
    assert [i["item_numero"] for i in out] == ["y", "z"]
