"""
Buscar objetivo — presupuesto actual = Σ costo_directo (módulo/Resumen),
no el KPI de scan_presupuesto_vista (VU listado × Σcant).
"""
from presupuesto_helpers import sum_costo_directo_capitulos


def test_sum_costo_directo_capitulos_redondeo_final():
    caps = [
        {"capitulo": "1", "costo_total": 1_000_000.4, "total_registros": 10},
        {"capitulo": "2", "costo_total": 250_000.6, "total_registros": 3},
    ]
    assert sum_costo_directo_capitulos(caps) == 1_250_001.0


def test_sum_costo_directo_capitulos_vacio():
    assert sum_costo_directo_capitulos([]) == 0.0
    assert sum_costo_directo_capitulos(None) == 0.0


def test_sum_costo_directo_coincide_con_resumen_excel_payload():
    """Misma agregación que exportar-informe: Σ CD por (cap,ítem) luego Σ global."""
    # Filas de ítem ya agregadas como en export (costo_directo = Σ CD registros)
    resumen_items = [
        {"capitulo": "A", "item": "1.1", "costo_directo": 100_000},
        {"capitulo": "A", "item": "1.2", "costo_directo": 50_500},
        {"capitulo": "B", "item": "2.1", "costo_directo": 10},
    ]
    # Equivalente a sumar por capítulo (capitulos-lista) y luego el total
    by_cap = {}
    for row in resumen_items:
        by_cap.setdefault(row["capitulo"], 0.0)
        by_cap[row["capitulo"]] += float(row["costo_directo"])
    caps = [{"capitulo": k, "costo_total": v} for k, v in by_cap.items()]
    assert sum_costo_directo_capitulos(caps) == 150_510.0
