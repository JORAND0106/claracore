"""Regresión: agregación cant×VU con un solo redondeo (dashboard comparativo)."""
from dashboard_costo_agregado import (
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


def test_costo_agregado_un_solo_redondeo():
    vu = 35_162.0
    rows = [{"cant_total": 0.01, "vlr_unitario": vu, "costo_directo": round(0.01 * vu, 0)} for _ in range(100)]
    sum_filas = sum(r["costo_directo"] for r in rows)
    cant_total = sum(r["cant_total"] for r in rows)
    agregado = costo_agregado_cant_vu(cant_total, vu)
    assert sum_filas == 100 * round(0.01 * vu, 0)
    assert agregado == round(cant_total * vu, 0)
    assert agregado != sum_filas or cant_total * vu == sum_filas


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
            {"capitulo": "1. X", "cant_total": 0.5, "vlr_unitario": 1000.0, "revisado": "Aprobado"},
            {"capitulo": "1. X", "cant_total": 0.5, "vlr_unitario": 1000.0, "revisado": "Aprobado"},
        ],
    }
    ap, nr, tot = rollup_ppto_por_capitulo(ppto_by_item, _norm_rev, lambda c: str(c))
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
    ap, nr, tot = rollup_resumen_item_agg(agg)
    assert tot["1. X"] == round(50 * 0.02 * 5000.0, 0)


def test_sicoe_finalize_costs():
    sg = {"ap_q": 12.94, "nr_q": 0.0, "_vu": 624_089.0}
    sicoe_finalize_costs(sg)
    assert sg["ap_c"] == round(12.94 * 624_089.0, 0)
    assert "_vu" not in sg
