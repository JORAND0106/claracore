"""Reglas financieras Obra Ejecutada en informe gerencial / dashboard."""
import pytest
import main as m


def test_obra_ejecutada_sicoe_sin_presupuesto_iguala_claracore(monkeypatch):
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(m, "_gerencial_ppto_items", lambda cid, v, u: {})
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("1_cap", "1.10.1"): {"ap_c": 10_000.0, "cap_display": "1. PRELIMINARES"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert len(rows) == 1
    assert rows[0]["claracore"] == 10_000
    assert rows[0]["cobrado"] == 10_000
    assert rows[0]["delta"] == 0


def test_obra_ejecutada_netea_cobrado_negativo_sin_presupuesto(monkeypatch):
    """Reversiones 'No Previsto' (cobrado negativo, sin presupuesto) deben netearse, no descartarse."""
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("7_cap", "7.01"): {
                "cap_display": "7. SANITARIO",
                "ap": 1_000_000.0,
                "pe": 0.0,
                "re": 0.0,
                "nr": 0.0,
                "cc_total": 1_000_000.0,
            },
        },
    )
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("7_cap", "7.01"): {"ap_c": 1_000_000.0, "cap_display": "7. SANITARIO"},
            ("7_cap", "NP-166"): {"ap_c": -6_341_448.0, "cap_display": "7. SANITARIO"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert len(rows) == 1
    assert rows[0]["cobrado"] == 1_000_000 - 6_341_448
    assert rows[0]["claracore"] == 1_000_000 - 6_341_448


def test_obra_ejecutada_presupuesto_suma_todos_estados(monkeypatch):
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("2_cap", "2.01"): {
                "cap_display": "2. RELLENOS",
                "ap": 100.0,
                "pe": 200.0,
                "re": 50.0,
                "nr": 150.0,
                "cc_total": 500.0,
            },
        },
    )
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("2_cap", "2.01"): {"ap_c": 400.0, "cap_display": "2. RELLENOS"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert len(rows) == 1
    assert rows[0]["claracore"] == 500
    assert rows[0]["cobrado"] == 400
    assert rows[0]["delta"] == 100
    assert rows[0]["aprobado"] == 100
    assert rows[0]["pendiente"] == 200
    assert rows[0]["rechazado"] == 50
    assert rows[0]["no_revisado"] == 150


def test_presupuesto_obra_sigue_bolsa_ap_nr(monkeypatch):
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("c1", "1.01"): {
                "cap_display": "1. X",
                "ap": 100.0,
                "pe": 200.0,
                "re": 50.0,
                "nr": 150.0,
                "cc_total": 250.0,
            },
        },
    )
    monkeypatch.setattr(m, "_dashboard_scan_sicoe_by_item", lambda cid: {})
    rows = m._gerencial_capitulos_data(1, "presupuesto_obra", None)
    assert rows[0]["claracore"] == 250
    assert rows[0]["pendiente"] == 200


def test_pkid_delta_obra_ejecutada_todos_estados():
    vu = 35_162.0
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "item_vu": vu,
        "sicoe_item_vu": vu,
        "cant_ppto_aprobado_n3": 0,
        "costo_ppto_aprobado_n3": 0,
        "cant_ppto_estado_no_revisado": 50,
        "costo_ppto_estado_no_revisado": 1_758_100,
        "cant_ppto_estado_pendiente": 0,
        "costo_ppto_estado_pendiente": 0,
        "cant_ppto_estado_rechazado": 0,
        "costo_ppto_estado_rechazado": 0,
        "cant_sicoe_aprobado": 50,
        "costo_sicoe_aprobado": 1_758_100,
        "cant_sicoe": 50,
        "costo_sicoe": 1_758_100,
    }
    m._apply_obra_ejecutada_pkid_delta(row)
    assert row["delta_cant"] == 0
    assert row["delta_costo"] == 0


def test_pkid_delta_obra_ejecutada_solo_cobrado_iguala():
    row = {
        "item_vu": 1000.0,
        "sicoe_item_vu": 1000.0,
        "cant_ppto_aprobado_n3": 0,
        "costo_ppto_aprobado_n3": 0,
        "cant_ppto_estado_no_revisado": 0,
        "costo_ppto_estado_no_revisado": 0,
        "cant_ppto_estado_pendiente": 0,
        "costo_ppto_estado_pendiente": 0,
        "cant_ppto_estado_rechazado": 0,
        "costo_ppto_estado_rechazado": 0,
        "cant_sicoe_aprobado": 10,
        "costo_sicoe_aprobado": 10_000,
        "cant_sicoe": 10,
        "costo_sicoe": 10_000,
    }
    m._apply_obra_ejecutada_pkid_delta(row, item_tiene_ppto_oe=False)
    assert row["total_claracore_cant"] == 10
    assert row["total_claracore_costo"] == 10_000
    assert row["delta_cant"] == 0
    assert row["delta_costo"] == 0
    assert row.get("claracore_igualado_cobro") is True


def test_pkid_solo_cobrado_bajo_item_con_ppto_cc_cero():
    """PK solo cobrado dentro de ítem con OE: CC=0 para que la suma PK = total ítem."""
    vu = 12_364_663 / 19.8
    row = {
        "item_vu": vu,
        "sicoe_item_vu": vu,
        "cant_ppto_aprobado_n3": 0,
        "costo_ppto_aprobado_n3": 0,
        "cant_ppto_estado_no_revisado": 0,
        "costo_ppto_estado_no_revisado": 0,
        "cant_ppto_estado_pendiente": 0,
        "costo_ppto_estado_pendiente": 0,
        "cant_ppto_estado_rechazado": 0,
        "costo_ppto_estado_rechazado": 0,
        "cant_sicoe_aprobado": 19.8,
        "costo_sicoe_aprobado": 12_364_663,
    }
    m._apply_obra_ejecutada_pkid_delta(row, item_tiene_ppto_oe=True)
    assert row["total_claracore_cant"] == 0
    assert row["total_claracore_costo"] == 0
    assert row["delta_cant"] == pytest.approx(-19.8, abs=0.01)
    assert row["delta_costo"] == -12_364_663
    assert not row.get("claracore_igualado_cobro")


def test_pkid_sum_coherente_con_item_obra_ejecutada():
    """Suma Cant CC por PK = bolsa OE del ítem; suma Δ = Δ del ítem."""
    vu1 = 624_478.02
    vu2 = 624_478.01
    rows = [
        {
            "pk_id": "4600001",
            "tiene_ppto_obra_ejecutada": True,
            "item_vu": vu1,
            "sicoe_item_vu": 624_478.02,
            "cant_a": 12.65,
            "cant_ppto": 12.65,
            "cant_sicoe_aprobado": 12.94,
        },
        {
            "pk_id": "141018",
            "tiene_ppto_obra_ejecutada": False,
            "item_vu": 12_364_663 / 19.8,
            "sicoe_item_vu": 12_364_663 / 19.8,
            "cant_sicoe_aprobado": 19.8,
            "costo_sicoe_aprobado": 12_364_663,
        },
        {
            "pk_id": "4600010",
            "tiene_ppto_obra_ejecutada": True,
            "item_vu": vu2,
            "cant_a": 25.51,
            "cant_ppto": 25.51,
            "cant_sicoe_aprobado": 0,
            "costo_sicoe_aprobado": 0,
        },
    ]
    for r in rows:
        m._apply_obra_ejecutada_pkid_delta(r, item_tiene_ppto_oe=True)
    sum_cc_q = sum(r["total_claracore_cant"] for r in rows)
    sum_cob_q = sum(float(r.get("cant_cobrado") or r.get("cant_sicoe_aprobado") or 0) for r in rows)
    sum_cc_c = sum(r["total_claracore_costo"] for r in rows)
    sum_cob_c = sum(float(r.get("costo_cobrado") or r.get("costo_sicoe_aprobado") or 0) for r in rows)
    assert sum_cc_q == pytest.approx(12.65 + 25.51, abs=0.01)
    assert sum_cob_q == pytest.approx(12.94 + 19.8, abs=0.01)
    assert sum_cc_c == round(12.65 * vu1, 0) + round(25.51 * vu2, 0)
    assert sum(r["delta_cant"] for r in rows) == pytest.approx(sum_cc_q - sum_cob_q, abs=0.02)
    assert sum(r["delta_costo"] for r in rows) == sum_cc_c - sum_cob_c


def test_pkid_delta_obra_ejecutada_ppto_vs_cobrado():
    vu = 624_478.0
    row = {
        "tiene_ppto_obra_ejecutada": True,
        "item_vu": vu,
        "sicoe_item_vu": vu,
        "cant_ppto_aprobado_n3": 12.65,
        "costo_ppto_aprobado_n3": 7_899_647,
        "cant_ppto_estado_no_revisado": 0,
        "costo_ppto_estado_no_revisado": 0,
        "cant_ppto_estado_pendiente": 0,
        "costo_ppto_estado_pendiente": 0,
        "cant_ppto_estado_rechazado": 0,
        "costo_ppto_estado_rechazado": 0,
        "cant_sicoe_aprobado": 12.94,
        "costo_sicoe_aprobado": 8_080_746,
    }
    m._apply_obra_ejecutada_pkid_delta(row)
    assert row["delta_cant"] == pytest.approx(-0.29, abs=0.01)
    assert row["delta_costo"] == round(12.65 * vu, 0) - round(12.94 * vu, 0)


def test_gerencial_excluye_items_iva(monkeypatch):
    monkeypatch.setattr(
        m,
        "_listado_precios_tipo_calculo_index",
        lambda cid: {
            ("14_cap", "14.01"): "IVA",
            ("7_cap", "7.01"): "AIU",
        },
    )
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("14_cap", "14.01"): {
                "cap_display": "14. ENSAYOS DE LABORATORIO",
                "ap": 1_000_000.0,
                "pe": 0.0,
                "re": 0.0,
                "nr": 0.0,
                "cc_total": 1_000_000.0,
            },
            ("7_cap", "7.01"): {
                "cap_display": "7. PLUVIAL",
                "ap": 500_000.0,
                "pe": 0.0,
                "re": 0.0,
                "nr": 0.0,
                "cc_total": 500_000.0,
            },
        },
    )
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("14_cap", "14.01"): {"ap_c": 900_000.0, "cap_display": "14. ENSAYOS DE LABORATORIO"},
            ("7_cap", "7.01"): {"ap_c": 400_000.0, "cap_display": "7. PLUVIAL"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert len(rows) == 1
    assert rows[0]["capitulo"] == "7. PLUVIAL"
    assert rows[0]["claracore"] == 500_000
    assert rows[0]["cobrado"] == 400_000

    rows_iva = m._gerencial_capitulos_data_obra_ejecutada(1, None, bloque="iva")
    assert len(rows_iva) == 1
    assert rows_iva[0]["capitulo"] == "14. ENSAYOS DE LABORATORIO"
    assert rows_iva[0]["claracore"] == 1_000_000
    assert rows_iva[0]["cobrado"] == 900_000


def test_gerencial_ppto_item_costos_drill_aligned_listado_vu():
    """Sin V.U. en presupuesto, usa listado_precios (misma regla que popup $ CC)."""
    rows = [{"cant_total": 10, "vlr_unitario": 0, "revisado": "Aprobado", "costo_directo": 0}]
    costs = m._gerencial_ppto_item_costos_drill_aligned(rows, listado_vu=10_000.0)
    assert costs["ap"] == 100_000
    assert costs["pe"] == 0
    assert costs["nr"] == 0
    assert costs["cc_total"] == 100_000


def test_gerencial_ppto_item_costos_drill_aligned_listado_vu_redondeo_unico():
    """Con V.U. del listado: cc_total = round(Σcant × V.U., 0), no suma de buckets."""
    vu = 35_162.0
    rows = [
        {"cant_total": 0.01, "vlr_unitario": 0, "revisado": "Aprobado", "costo_directo": round(0.01 * vu, 0)},
        {"cant_total": 0.01, "vlr_unitario": 0, "revisado": "Pendiente", "costo_directo": round(0.01 * vu, 0)},
        {"cant_total": 0.01, "vlr_unitario": 0, "revisado": "Rechazado", "costo_directo": round(0.01 * vu, 0)},
        {"cant_total": 0.01, "vlr_unitario": 0, "revisado": "No Revisado", "costo_directo": round(0.01 * vu, 0)},
    ]
    costs = m._gerencial_ppto_item_costos_drill_aligned(rows, listado_vu=vu)
    assert costs["cc_total"] == round(0.04 * vu, 0)
    assert costs["ap"] + costs["pe"] + costs["re"] + costs["nr"] != costs["cc_total"]


def test_capitulos_dos_capitulos_mismo_redondeo(monkeypatch):
    """Misma regla cc_total en capítulos distintos (no solo Espacio Público)."""
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    vu = 35_162.0

    def _items(cid, v, u):
        return {
            ("4_cap", "4.01"): {
                "cap_display": "4. ESPACIO PUBLICO",
                "ap": 352.0,
                "pe": 352.0,
                "re": 352.0,
                "nr": 352.0,
                "cc_total": round(0.04 * vu, 0),
            },
            ("7_cap", "7.01"): {
                "cap_display": "7. SANITARIO",
                "ap": 352.0,
                "pe": 352.0,
                "re": 352.0,
                "nr": 352.0,
                "cc_total": round(0.04 * vu, 0),
            },
        }

    monkeypatch.setattr(m, "_gerencial_ppto_items", _items)
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("4_cap", "4.01"): {"ap_c": round(0.04 * vu, 0), "cap_display": "4. ESPACIO PUBLICO"},
            ("7_cap", "7.01"): {"ap_c": round(0.04 * vu, 0), "cap_display": "7. SANITARIO"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    by_cap = {r["capitulo"]: r for r in rows}
    assert len(by_cap) == 2
    for cap in ("4. ESPACIO PUBLICO", "7. SANITARIO"):
        assert by_cap[cap]["delta"] == 0
        assert by_cap[cap]["claracore"] == round(0.04 * vu, 0)


def test_capitulos_aggregate_cc_total_no_suma_buckets(monkeypatch):
    """Vista capítulos: claracore = cc_total, no ap+pe+re+nr (redondeo acumulado)."""
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("1_cap", "1.01"): {
                "cap_display": "1. X",
                "ap": 352.0,
                "pe": 352.0,
                "re": 352.0,
                "nr": 352.0,
                "cc_total": 1406.0,
            },
        },
    )
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("1_cap", "1.01"): {"ap_c": 1406.0, "cap_display": "1. X"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert rows[0]["claracore"] == 1406
    assert rows[0]["delta"] == 0
    assert 352 * 4 == 1408


def test_obra_ejecutada_claracore_no_iguala_cobrado_con_ppto(monkeypatch):
    """Total ClaraCore del capítulo debe ser suma $ CC, no cobrado."""
    monkeypatch.setattr(m, "_listado_precios_tipo_calculo_index", lambda cid: {})
    monkeypatch.setattr(
        m,
        "_gerencial_ppto_items",
        lambda cid, v, u: {
            ("7_cap", "7.01"): {
                "cap_display": "7. SANITARIO",
                "ap": 100_000.0,
                "pe": 0.0,
                "re": 0.0,
                "nr": 0.0,
                "cc_total": 100_000.0,
            },
        },
    )
    monkeypatch.setattr(
        m,
        "_dashboard_scan_sicoe_by_item",
        lambda cid: {
            ("7_cap", "7.01"): {"ap_c": 50_000.0, "cap_display": "7. SANITARIO"},
        },
    )
    rows = m._gerencial_capitulos_data_obra_ejecutada(1, None)
    assert len(rows) == 1
    assert rows[0]["claracore"] == 100_000
    assert rows[0]["cobrado"] == 50_000
    assert rows[0]["delta"] == 50_000


def test_gerencial_item_es_aiu_fallback_capitulo_ensayos():
    idx = {}
    assert m._gerencial_item_bloque_precio("14_cap", "14.99", "14. ENSAYOS DE LABORATORIO", idx) == "iva"
    assert m._gerencial_item_bloque_precio("7_cap", "7.01", "7. PLUVIAL", idx) == "aiu"
    assert m._gerencial_item_es_aiu("7_cap", "7.02", "7. PLUVIAL", idx) is True
    idx2 = {("7_cap", "7.02"): "IVA"}
    assert not m._gerencial_item_es_aiu("7_cap", "7.02", "7. PLUVIAL", idx2)
    assert m._gerencial_item_es_iva("7_cap", "7.02", "7. PLUVIAL", idx2)


def test_xlsx_resumen_split_items_por_bloque(monkeypatch):
    monkeypatch.setattr(
        m,
        "_listado_precios_tipo_calculo_index",
        lambda cid: {
            ("7.PLUVIAL", "7.01"): "AIU",
            ("7.PLUVIAL", "7.02"): "IVA",
        },
    )
    items = [{"item": "7.01"}, {"item": "7.02"}, {"item": "7.03"}]
    aiu, iva = m._xlsx_resumen_items_por_bloque(items, 1, "7. PLUVIAL")
    assert [r["item"] for r in aiu] == ["7.01", "7.03"]
    assert [r["item"] for r in iva] == ["7.02"]
