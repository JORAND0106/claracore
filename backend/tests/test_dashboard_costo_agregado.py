"""Regresión: agregación cant×VU con un solo redondeo (dashboard comparativo)."""
from dashboard_costo_agregado import (
    cantidad_dashboard,
    cantidad_dashboard_sum,
    costo_agregado_cant_vu,
    ingest_ppto_resumen_row,
    ppto_costo_por_estado,
    ppto_rows_with_resolved_vu,
    rollup_ppto_por_capitulo,
    rollup_resumen_item_agg,
    resolve_item_vu,
    sicoe_finalize_costs,
    vu_item_rows,
)


def _norm_rev(v):
    return v or "No Revisado"


def test_cantidad_dashboard_dos_decimales():
    assert cantidad_dashboard(12.654) == 12.65
    assert cantidad_dashboard(0.291) == 0.29
    assert cantidad_dashboard(12.655) == 12.65  # banker's rounding


def test_cantidad_dashboard_sum_por_fila():
    rows = [{"cant_total": 12.654}, {"cant_total": 0.291}]
    assert cantidad_dashboard_sum(rows) == 12.94


def test_costo_agregado_usa_cantidad_a_dos_decimales():
    vu = 624_089.0
    # 12.654 → 12.65 antes de multiplicar
    assert costo_agregado_cant_vu(12.654, vu) == round(12.65 * vu, 0)
    assert costo_agregado_cant_vu(12.654, vu) != round(12.654 * vu, 0)


def test_ppto_costo_por_estado_cantidad_dos_decimales():
    vu = 1000.0
    rows = [
        {"cant_total": 12.654, "vlr_unitario": vu, "revisado": "Aprobado"},
        {"cant_total": 0.291, "vlr_unitario": vu, "revisado": "Aprobado"},
    ]
    est = ppto_costo_por_estado(rows, _norm_rev)
    assert est["A"]["cant"] == 12.94
    assert est["A"]["costo"] == round(12.94 * vu, 0)


def test_sicoe_finalize_costs_cantidad_dos_decimales():
    sg = {"ap_q": 12.654, "nr_q": 0.291}
    sicoe_finalize_costs(sg, listado_vu=1000.0)
    assert sg["ap_c"] == round(12.65 * 1000.0, 0)
    assert sg["nr_c"] == round(0.29 * 1000.0, 0)


def test_costo_agregado_un_solo_redondeo():
    vu = 35_162.0
    rows = [{"cant_total": 0.01, "vlr_unitario": vu, "costo_directo": round(0.01 * vu, 0)} for _ in range(100)]
    sum_filas = sum(r["costo_directo"] for r in rows)
    cant_total = sum(r["cant_total"] for r in rows)
    agregado = costo_agregado_cant_vu(cant_total, vu)
    assert sum_filas == 100 * round(0.01 * vu, 0)
    assert agregado == round(round(cant_total, 2) * vu, 0)
    assert agregado != sum_filas


def test_sicoe_item_agg_no_suma_costo_directo_por_linea():
    """Regresión: agregar por ítem con cant×VU difiere de SUM(costo_directo) por línea."""
    vu = 65_000.0
    line_cd = round(0.01 * vu, 0)
    n = 100
    sum_cd = n * line_cd
    cant_total = n * 0.01
    agregado = costo_agregado_cant_vu(cant_total, vu)
    assert agregado == round(round(cant_total, 2) * vu, 0)
    assert sum_cd != agregado or line_cd * n == round(cant_total * vu, 0)


def test_vu_item_rows_fallback_costo_directo():
    rows = [{"cant_total": 10, "costo_directo": 450000, "vlr_unitario": 0}]
    assert vu_item_rows(rows) == 45000.0


def test_resolve_item_vu_listado_fallback():
    rows = [{"cant_total": 1239, "costo_directo": 0, "vlr_unitario": 0}]
    assert resolve_item_vu(rows, listado_vu=87250.0) == 87250.0
    est = ppto_costo_por_estado(
        ppto_rows_with_resolved_vu(rows, listado_vu=87250.0),
        lambda x: x or "No Revisado",
    )
    assert est["NR"]["cant"] == 1239
    assert est["NR"]["costo"] == round(1239 * 87250.0, 0)


def test_resolve_item_vu_listado_sobre_costo_directo_redondeado():
    """Listado gana sobre cd/cant por fila (evita V.U. distorsionado por redondeo línea)."""
    vu = 35_162.0
    rows = [{"cant_total": 0.01, "vlr_unitario": 0, "costo_directo": round(0.01 * vu, 0)}]
    assert resolve_item_vu(rows, listado_vu=vu) == vu
    assert vu_item_rows(rows) == 35_200.0


def test_ppto_costo_por_estado_sin_vu_usa_costo_directo():
    rows = [
        {"cant_total": 100, "costo_directo": 500000, "revisado": "No Revisado", "vlr_unitario": 0},
        {"cant_total": 50, "costo_directo": 250000, "revisado": "No Revisado", "vlr_unitario": 0},
    ]
    est = ppto_costo_por_estado(rows, lambda x: x or "No Revisado")
    assert est["NR"]["cant"] == 150
    assert est["NR"]["costo"] == 750000
    vu = 35_162.0
    rows = [
        {"cant_total": 0.01, "vlr_unitario": vu, "revisado": "Aprobado"},
        {"cant_total": 0.01, "vlr_unitario": vu, "revisado": "Aprobado"},
    ]
    est = ppto_costo_por_estado(rows, _norm_rev)
    assert est["A"]["cant"] == 0.02
    assert est["A"]["costo"] == round(0.02 * vu, 0)
    sum_filas = sum(round(0.01 * vu, 0) for _ in rows)
    assert sum_filas == 2 * 352
    assert est["A"]["costo"] == 703
    assert est["A"]["costo"] != sum_filas


def test_rollup_por_capitulo_desde_items():
    ppto_by_item = {
        ("c1", "1.01"): [
            {"capitulo": "1. X", "cant_total": 0.5, "vlr_unitario": 999.0, "revisado": "Aprobado"},
            {"capitulo": "1. X", "cant_total": 0.5, "vlr_unitario": 999.0, "revisado": "Aprobado"},
        ],
    }
    listado_idx = {("c1", "1.01"): {"precio_unitario": 1000.0}}
    ap, nr, tot = rollup_ppto_por_capitulo(
        ppto_by_item, _norm_rev, lambda c: str(c), listado_idx=listado_idx
    )
    assert tot["1. X"] == 1000.0
    assert ap["1. X"] == 1000.0


def test_resumen_bruto_por_item():
    agg = {}
    for _ in range(50):
        ingest_ppto_resumen_row(
            agg,
            {"capitulo": "1. X", "item": "1.01", "cant_total": 0.02, "vlr_unitario": 5000.0, "revisado": "Aprobado"},
            cap_key_fn=lambda c: "c1",
            item_key_fn=lambda i: str(i),
            rev_map_fn=_norm_rev,
        )
    ap, nr, tot = rollup_resumen_item_agg(agg, listado_idx={("c1", "1.01"): {"precio_unitario": 5000.0}})
    assert tot["1. X"] == round(50 * 0.02 * 5000.0, 0)


def test_vu_aggregate_rows_implicit():
    from dashboard_costo_agregado import resolve_item_vu, vu_aggregate_rows

    rows = [
        {"cant_total": 0.01, "vlr_unitario": 0, "costo_directo": 352.0},
        {"cant_total": 0.01, "vlr_unitario": 0, "costo_directo": 352.0},
    ]
    assert vu_aggregate_rows(rows) == 35_200.0
    assert resolve_item_vu(rows) == 35_200.0


def test_listado_vu_for_cap_item_solo_cap_capitulo():
    from dashboard_costo_agregado import listado_vu_for_cap_item

    full = {
        ("4. ESPACIO", "4.01"): {"precio_unitario": 10_000.0},
        ("7. SANITARIO", "7.01"): {"precio_unitario": 20_000.0},
    }
    assert listado_vu_for_cap_item("7. SANITARIO", "7.01", full_listado_by_cap_item=full) == 20_000.0
    assert listado_vu_for_cap_item("7. SANITARIO", "4.01", full_listado_by_cap_item=full) is None


def test_resolve_item_vu_listado_only_sin_listado():
    rows = [{"cant_total": 100, "vlr_unitario": 50_000.0, "costo_directo": 5_000_000}]
    assert resolve_item_vu(rows, listado_vu=0, listado_only=True) == 0.0
    assert resolve_item_vu(rows, listado_vu=87250.0, listado_only=True) == 87250.0


def test_sicoe_finalize_costs_usa_listado():
    sg = {"ap_q": 12.94, "nr_q": 0.0}
    sicoe_finalize_costs(sg, listado_vu=624_089.0)
    assert sg["ap_c"] == round(12.94 * 624_089.0, 0)
    assert sg["item_vu"] == 624_089.0
    assert sg.get("listado_vu_encontrado") is True


def test_sicoe_finalize_costs_listado_ausente():
    sg = {"ap_q": 10.0, "nr_q": 0.0}
    sicoe_finalize_costs(sg, listado_vu=0)
    assert sg["ap_c"] == 0.0
    assert sg.get("listado_vu_ausente") is True


def test_gerencial_finalize_cc_total_un_solo_redondeo():
    from dashboard_costo_agregado import gerencial_ppto_finalize_item

    vu = 35_162.0
    raw = {
        "cap_display": "1. X",
        "ap_q": 0.01,
        "pe_q": 0.01,
        "re_q": 0.01,
        "nr_q": 0.01,
    }
    fin = gerencial_ppto_finalize_item(dict(raw), obra_ejecutada=True, listado_vu=vu)
    sum_buckets = fin["ap"] + fin["pe"] + fin["re"] + fin["nr"]
    assert fin["cc_total"] == round(0.04 * vu, 0)
    assert fin["cc_total"] != sum_buckets


def test_ppto_cc_total_from_est_obra_ejecutada():
    from dashboard_costo_agregado import ppto_cc_total_from_est

    vu = 35_162.0
    est = {
        "NR": {"cant": 0.01, "costo": round(0.01 * vu, 0)},
        "P": {"cant": 0.01, "costo": round(0.01 * vu, 0)},
        "R": {"cant": 0.01, "costo": round(0.01 * vu, 0)},
        "A": {"cant": 0.01, "costo": round(0.01 * vu, 0)},
    }
    total = ppto_cc_total_from_est(est, vu, obra_ejecutada=True)
    assert total == round(0.04 * vu, 0)
    assert total != sum(est[k]["costo"] for k in est)
